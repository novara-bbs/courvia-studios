# Operación: testing, CI, entorno y setup

> Estrategia de pruebas, variables de entorno y seguridad, y el arranque de herramientas (MCP, móvil).

---

## Stack local

### Postgres de desarrollo

`scripts/dev-db.sh` (atajo: `pnpm dev:db`) levanta el Postgres local en `127.0.0.1:5433` con datadir `/var/lib/pg-courvia` (configurable vía `COURVIA_PG_DATA`). Es idempotente: si el puerto ya responde, no hace nada. Si el datadir no existe, falla con un mensaje explícito — hay que inicializarlo antes (initdb como usuario `postgres` y `createdb courvia`).

En Claude Code web, el hook **SessionStart** (`.claude/hooks/session-start.sh`, registrado en `.claude/settings.json`) deja el stack listo al abrir sesión: instala dependencias si falta `node_modules` (`pnpm install --frozen-lockfile`) y ejecuta `scripts/dev-db.sh` si existe el datadir. Solo actúa cuando `CLAUDE_CODE_REMOTE=true`; en un entorno local no toca nada.

### Variables de entorno locales

`apps/web/.env.example` es la plantilla: copiarla a `apps/web/.env.local` (ignorado por Git). Obligatorias en local: `DATABASE_URL` (apunta al Postgres del 5433), `PAYLOAD_SECRET` y `PAYMENT_FAKE_SECRET` (proveedor de pago fake de desarrollo, bloqueado en producción por el gate fail-closed). El resto — `NEXT_PUBLIC_SITE_URL`, `STRIPE_WEBHOOK_SECRET`, Plausible, las claves del test de exposición — son opcionales y van comentadas en la plantilla.

### Migraciones: `pnpm migrate:new <nombre>`

`scripts/migrate-new.mjs` crea la migración (`payload migrate:create`) **y** sanea en el mismo paso lo que el generador olvida: separa el import runtime (`sql`) del import de tipos (`import type { MigrateDownArgs, MigrateUpArgs }` — el generador los emite como import runtime y eso revienta en ESM) y reduce las firmas de `up`/`down` a `{ db }` (los argumentos sin usar fallan el lint). Si la plantilla del generador cambia, el script falla en voz alta en lugar de dejar pasar un archivo roto.

Después de crearla:

```bash
pnpm --filter @courvia/web migrate          # aplicar en local
pnpm --filter @courvia/web generate:types   # regenerar payload-types
```

Commitear la migración **y también** `src/migrations/index.ts` (el generador lo regenera). A producción, solo por CI con aprobación explícita (`.claude/rules/database.md`).

### Seeds, en orden

1. `ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter @courvia/web seed:admin` — primer usuario admin por Local API (`ADMIN_NAME` opcional). Idempotente: se niega a correr si ya existe algún usuario.
2. `pnpm seed` — ejecuta en orden `seed:catalog` → `seed:markets` → `seed:content`.

### Sweep de checkouts abandonados

```bash
pnpm --filter @courvia/web sweep:checkouts
```

Ejecuta `expireStaleCheckouts` (`packages/commerce-payload`): los pedidos `pending_payment` con más de 1 hora pasan a `cancelled` por la misma maquinaria que cualquier evento de pago — transición pura, lock de fila, transacción — y se liberan sus reservas de stock. Un checkout que paga durante el sweep está a salvo: el lock serializa a ambos escritores. Pensado para cron (Vercel Cron o schedule de GitHub Actions) o a mano.

---

## 13. Testing y CI

| Nivel | Herramienta | Cubre | Cuándo |
|---|---|---|---|
| Unit | Vitest | Dominio, Zod, monedas (zero-decimal, redondeo), **normalización de PaymentEvents** | Cada PR |
| Integración | Vitest + **Stripe test clocks** (+ sandbox Tabby/Tamara en S4) | Adaptadores, webhooks idempotentes, máquina de estados | Cada PR |
| E2E | **Playwright** (verdad) | Checkout **por mercado y proveedor**: EUR+Bizum · GBP+Klarna · AED+tarjeta y AED+Tabby; RMA; desistimiento | Smoke por PR · completo nightly |
| Visual | Storybook (+Chromatic opc.) | `ui` en 3 temas + RTL | Nightly/release |
| A11y | axe en Playwright | AA en 3 temas, foco, RTL | Nightly |

Ningún merge sin CI verde; humano aprueba pagos/RLS.

---

## 15. Variables de entorno y seguridad

Credenciales de pago **namespaced por proveedor** — añadir una pasarela nueva = añadir su bloque, sin tocar el resto:
```
NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY              # SOLO backend/CI; el agente jamás la pide, lee o usa
SUPABASE_PROJECT_REF=xurdwzbefgxpfzgkbbkf · DATABASE_URL (CI)
PAYLOAD_SECRET

# Proveedor de pago: stripe (Fase 1)
STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET · NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY · STRIPE_TAX_ENABLED=true
# Proveedores BNPL EAU (S4)
TABBY_API_KEY · TABBY_WEBHOOK_SECRET · TAMARA_API_TOKEN · TAMARA_WEBHOOK_SECRET
# Futuro (solo si se activa el adaptador): ADYEN_API_KEY · ADYEN_HMAC_KEY · ADYEN_MERCHANT_ACCOUNT

RESEND_API_KEY (o BREVO_API_KEY) · VERIFACTU_PROVIDER_API_KEY
NEXT_PUBLIC_GA4_ID · NEXT_PUBLIC_PLAUSIBLE_DOMAIN
NEXT_PUBLIC_SITE_URL · NEXT_PUBLIC_DEFAULT_LOCALE=es
```
**Checklist:** RLS en todo commerce · `(provider, provider_event_id)` UNIQUE + firma en cada webhook · importes server-side · test de que la clave secreta (`SUPABASE_SECRET_KEY` / legacy `service_role`) no está en bundles cliente · MCP prod read-only · migraciones a producción solo por CI · CSP compatible (glass/pasarelas/Plausible) · consentimiento cookies por mercado (LSSI/PECR/PDPL) · rotación de claves · **runbook de cambio de cuenta/pasarela** ([`docs/payments-runbook.md`](payments-runbook.md)): rotar envs → re-registrar webhooks → drenar pagos en vuelo → conciliar.

### 15.1 El test de la cuarta capa (exposición del Data API)

`.claude/rules/database.md` exige que el aislamiento (access control de Payload · schema no expuesto · RLS) lo demuestre un test, no la confianza. Ese test es `apps/web/src/server/data-api-exposure.test.ts`: conecta al Data API de Supabase con la clave **publicable** (pública por diseño; el archivo no contiene ningún secreto) y comprueba que las tablas sensibles (`orders`, `payments`, `outbox`, `leads`, `users`, `prices`) **no resuelven** — ni por el schema por defecto ni forzando `Accept-Profile: payload`. Cualquier cosa que no sea un status de error es una fuga.

Se activa con `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (ver `apps/web/.env.example`); sin ellas se marca como skipped (desarrollo local, CI sin base). Pasó en verde contra el proyecto real el 20 ago 2026.

---

---

## 19. Setup Claude Code / MCP, estado de infraestructura y móvil

### 19.0 Estado de infraestructura

**Estado actual (20 ago 2026):**
- **Supabase**: el schema `payload` está desplegado en el proyecto `courvia-studios` (`xurdwzbefgxpfzgkbbkf`) con **RLS deny-all en todas las tablas**. Las migraciones se aplicaron vía MCP, cada batch con su fila en el ledger de migraciones: batches 1–6 aplicados; el 7 pendiente de aplicar.

**Histórico — snapshot del 19 ago 2026 (superado por lo anterior):**
- **Supabase**: proyecto `courvia-studios` (`xurdwzbefgxpfzgkbbkf`), región **eu-west-1**, Postgres **17.6**, estado ACTIVE_HEALTHY, **sin tablas** en `public`/`payload` → lienzo limpio, listo para las migraciones de S0.
- **Vercel**: el team actual no tenía proyecto Courvia todavía → crearlo/vincularlo en S0 (`vercel link` desde `apps/web` o desde el dashboard, con framework Next.js).
- **GitHub**: no verificable desde aquel chat (sin conector GitHub); el repo creado por el usuario se validaría al clonar en la primera sesión de Claude Code.

### 19.1 Setup (una vez, desde un ordenador — terminal normal)
```bash
git clone <repo-courvia> && cd <repo-courvia>

# MCP Supabase (scope project → crea .mcp.json commiteable)
# Acotado: project_ref + read_only + solo las features necesarias (ampliar solo si una tarea lo exige)
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=xurdwzbefgxpfzgkbbkf&read_only=true&features=docs%2Cdatabase%2Cdevelopment%2Cdebugging"

claude
/mcp        # seleccionar "supabase" → Authenticate

npx skills add supabase/agent-skills   # opcional, recomendado
```
Commitear `.mcp.json`. Autenticación por máquina/entorno. **El MCP no se configura en la sesión de bootstrap**; cuando llegue su tarea: limitar a `project_ref`, activar solo los grupos de features necesarios y `read_only=true` si apunta a datos reales. **Producción: acceso del agente en solo-lectura; escrituras a producción solo por CI.** Añadir después MCP/CLI de Vercel y GitHub.

### 19.2 Móvil (app Claude → pestaña Code)
- **Remote Control** (recomendado con un equipo encendido): `claude` o `claude remote-control` en el ordenador; el móvil es una ventana a esa sesión local — conserva `.mcp.json` autenticado, filesystem y tools. `/mcp` no funciona por el puente: autenticar antes en terminal.
- **Claude Code web/cloud**: sesión en infraestructura de Anthropic conectada al repo GitHub; entorno limpio, ideal para tareas acotadas sin ordenador.
- Docs: code.claude.com/docs/en/remote-control · docs.claude.com/en/docs/claude-code/overview

**Flujo por sesión:** UNA tarea de §16 → plan breve → aprobar → implementar → tests/CI → commit convencional → actualizar este MD si cambió una decisión. Nada de "hazme todo el sprint" de una vez.

---
