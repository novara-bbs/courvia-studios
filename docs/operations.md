# Operación: testing, CI, entorno y setup

> Estrategia de pruebas, variables de entorno y seguridad, y el arranque de herramientas (MCP, móvil).

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
**Checklist:** RLS en todo commerce · `(provider, provider_event_id)` UNIQUE + firma en cada webhook · importes server-side · test de que la clave secreta (`SUPABASE_SECRET_KEY` / legacy `service_role`) no está en bundles cliente · MCP prod read-only · migraciones a producción solo por CI · CSP compatible (glass/pasarelas/Plausible) · consentimiento cookies por mercado (LSSI/PECR/PDPL) · rotación de claves · **runbook de cambio de cuenta/pasarela** (`docs/payments-runbook.md`, S2): rotar envs → re-registrar webhooks → drenar pagos en vuelo → conciliar.

---

---

## 19. Setup Claude Code / MCP, estado de infraestructura y móvil

### 19.0 Estado verificado de infraestructura (19 ago 2026)
- **Supabase** ✅: proyecto `courvia-studios` (`xurdwzbefgxpfzgkbbkf`), región **eu-west-1**, Postgres **17.6**, estado ACTIVE_HEALTHY, **sin tablas** en `public`/`payload` → lienzo limpio, listo para las migraciones de S0.
- **Vercel** ⚠️: el team actual no tiene proyecto Courvia todavía → crearlo/vincularlo en S0 (`vercel link` desde `apps/web` o desde el dashboard, con framework Next.js).
- **GitHub** ℹ️: no verificable desde este chat (sin conector GitHub); el repo creado por el usuario se validará al clonar en la primera sesión de Claude Code.

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
