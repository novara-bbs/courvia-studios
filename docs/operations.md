# Operación: testing, CI, entorno y setup

> Estrategia de pruebas, variables de entorno y seguridad, y el arranque de herramientas (MCP, móvil).

---

## Stack local

### Postgres de desarrollo

`scripts/dev-db.sh` (atajo: `pnpm dev:db`) levanta el Postgres local en `127.0.0.1:5433` con datadir `/var/lib/pg-courvia` (configurable vía `COURVIA_PG_DATA`). Es idempotente: si el puerto ya responde, no hace nada. Si el datadir no existe, falla con un mensaje explícito — hay que inicializarlo antes (initdb como usuario `postgres` y `createdb courvia`).

En Claude Code web, el hook **SessionStart** (`.claude/hooks/session-start.sh`, registrado en `.claude/settings.json`) deja el stack listo al abrir sesión: instala dependencias si falta `node_modules` (`pnpm install --frozen-lockfile`) y ejecuta `scripts/dev-db.sh` si existe el datadir. Solo actúa cuando `CLAUDE_CODE_REMOTE=true`; en un entorno local no toca nada.

### Variables de entorno locales

`apps/web/.env.example` es la plantilla: copiarla a `apps/web/.env.local` (ignorado por Git). Obligatorias en local: `DATABASE_URL` (apunta al Postgres del 5433), `PAYLOAD_SECRET` y `PAYMENT_FAKE_SECRET` (proveedor de pago fake de desarrollo, bloqueado en producción por el gate fail-closed). El resto — `NEXT_PUBLIC_SITE_URL`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, el correo (`RESEND_API_KEY` + `EMAIL_FROM`), Plausible y las claves del test de exposición — son opcionales y van comentadas en la plantilla. Sin las dos del correo, en local los mensajes van a consola; en un despliegue su ausencia hace que cada envío falle en voz alta en vez de tragarse el mensaje.

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
2. `pnpm seed` — ejecuta en orden `seed:catalog` → `seed:media` → `seed:markets` →
   `seed:templates` → `seed:content`.

`seed:templates` merece una línea aparte porque no siembra contenido: siembra la
**plantilla de ficha de producto** con exactamente los bloques de
`DEFAULT_PRODUCT_TEMPLATE` (`src/catalog/product-template.ts`). Correrla no
cambia lo que se sirve —el array es la recaída y los bloques son los mismos— y
lo que cambia es el panel: sin ella, Plantillas está vacío y «la ficha de
producto es editable» solo lo es para quien sepa de antemano qué cinco
secciones crear y en qué orden. Es idempotente en el único sentido que importa
aquí: si ya hay una plantilla `product` por defecto, no la toca.

### El tick de mantenimiento, y cómo ejecutarlo a mano

En un despliegue lo dispara Vercel Cron **una vez al día**, a las 04:00 UTC
(`"schedule": "0 4 * * *"` en `apps/web/vercel.json`), sobre `GET /next/cron`
(autenticado con `CRON_SECRET`; ver `docs/deployment.md`). Hace dos cosas:
despachar el outbox y caducar los checkouts abandonados.

**La cadencia es diaria a propósito, y hay que saber lo que cuesta.** Vercel
Hobby rechaza cualquier `schedule` más fino y hace fallar el despliegue al
validar `vercel.json`, así que `*/5 * * * *` no correría despacio: no
desplegaría (`docs/deployment.md`, «Cron de mantenimiento»; lo sujeta el test
`keeps a cadence the current plan accepts` de `deploy-contract.test.ts`). El
peor caso real, con un solo tick al día:

| Efecto | Umbral | Peor caso hasta que ocurre |
|---|---|---|
| Fila del outbox (el correo de la waitlist, el único que hoy convierte) | inmediato | **hasta 24 h** — encolada justo después de un tick, espera al siguiente |
| Checkout abandonado → `cancelled` + stock liberado | 1 h de vida (`CHECKOUT_TTL_MINUTES`) | **casi 25 h** — un pedido creado a las 03:00 UTC aún no tiene una hora a las 04:00, así que no lo caza ese tick y espera al del día siguiente |

Un pedido `pending_payment` de veinte horas es, por tanto, la cadencia
elegida y no una avería: solo hay que sospechar del cron si sobrevive a un
tick. Mientras el plan siga en Hobby, el puente es dispararlo a mano: la misma
llamada autenticada de abajo, con el dominio del despliegue en lugar de
`localhost:3000`.

En local, la ruta funciona igual con el servidor levantado:

```bash
# apps/web/.env.local: CRON_SECRET=lo-que-quieras
curl -sS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/next/cron
```

Sin credenciales de correo, Payload usa su adaptador de consola: el envío se
registra en el log del servidor y la fila del outbox pasa a `dispatched`.

Solo el sweep de checkouts, sin servidor:

```bash
pnpm --filter @courvia/web sweep:checkouts
```

Ejecuta `expireStaleCheckouts` (`packages/commerce-payload`): los pedidos `pending_payment` con más de 1 hora pasan a `cancelled` por la misma maquinaria que cualquier evento de pago — transición pura, lock de fila, transacción — y se liberan sus reservas de stock. Un checkout que paga durante el sweep está a salvo: el lock serializa a ambos escritores.

---

## 13. Testing y CI

| Nivel | Herramienta | Cubre | Cuándo |
|---|---|---|---|
| Unit | Vitest | Dominio, Zod, monedas (zero-decimal, redondeo), **normalización de PaymentEvents** | Cada PR |
| Integración | Vitest + **Stripe test clocks** (+ sandbox Tabby/Tamara en S4) | Adaptadores, webhooks idempotentes, máquina de estados | Cada PR |
| Navegador | **Playwright** — `pnpm e2e` | **Existe desde el 22 ago 2026.** Geometría del raíl pegajoso · desbordamiento horizontal a 320/390 en cuatro rutas + RTL · axe AA en los tres temas y en RTL · teclado (menú móvil, salto al contenido) | Job `e2e` en cada PR |
| Operar un pedido | Playwright, por `request` con sesión real | **Desde el 22 ago 2026.** `paid → preparing → shipped → delivered` por la API del panel, con las dos escrituras que tiene que negar (`orders.status` y `withdrawalDeadline`). El escenario lo monta `pnpm seed:e2e-operator`, que **se niega a correr contra una base de datos que no sea local o la de CI** | Job `e2e` en cada PR |
| E2E de compra | Playwright | Checkout **por mercado y proveedor**: EUR+Bizum · GBP+Klarna · AED+tarjeta y AED+Tabby; RMA | 🔒 pendiente: exige credenciales de pasarela |
| Visual | Storybook (+Chromatic opc.) | `ui` en 3 temas + RTL | ⏳ pendiente |

**El harness de navegador, en concreto** (`apps/web/playwright.config.ts`,
`apps/web/e2e/`). Un solo servidor para todas las pruebas —Playwright lo
levanta con `next start` en el 3999— frente a los siete `next start` que las
suites HTTP de Vitest arrancan cada una por su cuenta. Va en un job de CI
**separado** de `verify`: aquel ya tarda unos cuatro minutos, y mezclarlos hace
que un fallo de layout se lea como un fallo de tipos.

El navegador es el Chromium de la máquina si lo hay —este contenedor trae uno
preinstalado— y el que Playwright descarga si no. Se detecta; fijar la ruta a
ciegas rompería CI y no fijarla obliga a descargar 170 MB en cada sesión.

Lo primero que encontró al correr: **32px de desbordamiento horizontal a 320px
en las cuatro rutas**, todos de la cabecera. Llevaba ahí desde que el CTA entró
en la barra.

Ningún merge sin CI verde; humano aprueba pagos/RLS.

---

## 15. Variables de entorno y seguridad

Credenciales de pago **namespaced por proveedor** — añadir una pasarela nueva = añadir su bloque, sin tocar el resto:
```
SUPABASE_URL · SUPABASE_PUBLISHABLE_KEY   # sin prefijo NEXT_PUBLIC_: nada en el
                                 # navegador habla con Supabase; la tienda llega a
                                 # Postgres por Payload, en servidor
SUPABASE_SECRET_KEY              # SOLO backend/CI; el agente jamás la pide, lee o usa
SUPABASE_PROJECT_REF=xurdwzbefgxpfzgkbbkf · DATABASE_URL (CI)
PAYLOAD_SECRET

# Proveedor de pago: stripe (Fase 1)
STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET · NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY · STRIPE_TAX_ENABLED=true
# Proveedores BNPL EAU (S4)
TABBY_API_KEY · TABBY_WEBHOOK_SECRET · TAMARA_API_TOKEN · TAMARA_NOTIFICATION_TOKEN
# Futuro (solo si se activa el adaptador): ADYEN_API_KEY · ADYEN_HMAC_KEY · ADYEN_MERCHANT_ACCOUNT

RESEND_API_KEY · EMAIL_FROM · VERIFACTU_PROVIDER_API_KEY
CRON_SECRET                      # autentica GET /next/cron (outbox + sweep)
NEXT_PUBLIC_GA4_ID · NEXT_PUBLIC_PLAUSIBLE_DOMAIN
NEXT_PUBLIC_SITE_URL · NEXT_PUBLIC_DEFAULT_LOCALE=es
```
**Checklist:** RLS en todo commerce · `(provider, provider_event_id)` UNIQUE + firma en cada webhook · importes server-side · test de que la clave secreta (`SUPABASE_SECRET_KEY` / legacy `service_role`) no está en bundles cliente · MCP prod read-only · migraciones a producción solo por CI · CSP compatible (glass/pasarelas/Plausible) · consentimiento cookies por mercado (LSSI/PECR/PDPL) · rotación de claves · **runbook de cambio de cuenta/pasarela** ([`docs/payments-runbook.md`](payments-runbook.md)): rotar envs → re-registrar webhooks → drenar pagos en vuelo → conciliar.

### 15.1 El test de la cuarta capa (exposición del Data API)

`.claude/rules/database.md` exige que el aislamiento (access control de Payload · schema no expuesto · RLS) lo demuestre un test, no la confianza. Ese test es `apps/web/src/server/data-api-exposure.test.ts`: conecta al Data API de Supabase con la clave **publicable** (pública por diseño; el archivo no contiene ningún secreto) y comprueba que las tablas sensibles (`orders`, `payments`, `outbox`, `leads`, `users`, `prices`) **no resuelven** — ni por el schema por defecto ni forzando `Accept-Profile: payload`. Cualquier cosa que no sea un status de error es una fuga.

Se activa con `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (ver `apps/web/.env.example`); sin ellas se marca como skipped (desarrollo local, CI sin base). Pasó en verde contra el proyecto real el 20 ago 2026.

### 15.2 La plantilla de entorno no puede desviarse del código

`apps/web/src/server/env-contract.test.ts` recorre las fuentes de `apps/web`, extrae toda lectura del entorno —`process.env.X`, `process.env["X"]` y el accesor `env("X")` de `storage.ts`, `build-env.ts` y `email/adapter.ts`— y exige que cada nombre esté en `apps/web/.env.example`. La dirección contraria **también falla**: un nombre en la plantilla que ningún código lee es una instrucción para no hacer nada, y peor, anuncia una integración que no existe (la plantilla de la raíz pedía `TAMARA_WEBHOOK_SECRET` mientras el código leía `TAMARA_NOTIFICATION_TOKEN`).

Dos ficheros, dos trabajos: `apps/web/.env.example` es la plantilla que alguien copia a `.env.local` y el test la mantiene exacta; el `.env.example` de la raíz es el inventario de plataforma —incluidas pasarelas y servicios que aún no existen (ADR-06/07)— y es un superconjunto a propósito. Las variables que inyecta la plataforma (`NODE_ENV`, `CI`, `NEXT_PHASE`, `VERCEL*`) están en una lista explícita del test: documentarlas invitaría a fijar a mano un valor que no es nuestro.

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
