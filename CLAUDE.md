# CLAUDE.md — Courvia · Reglas permanentes

> **Se lee entero en cada sesión.** Por eso contiene solo lo que aplica siempre: identidad, reglas duras, puertos y flujo de trabajo. Arquitectura, mercados, modelo de datos y roadmap viven en `docs/` y se leen cuando la tarea los toca.
> Para otras herramientas (Codex, ChatGPT): `AGENTS.md` es un symlink de este archivo.
> Última revisión: 20 ago 2026.

## Índice de documentación

| Documento | Cuándo leerlo |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | **Antes de tocar estructura.** Las seis capas, las fronteras verificadas, la superficie editable y la resolución de tema. |
| [`docs/product.md`](docs/product.md) | Marca, diseño, catálogo multideporte, sitemap. |
| [`docs/markets.md`](docs/markets.md) | ES/UK/EAU: monedas, impuestos, pagos, privacidad, i18n, SEO. |
| [`docs/data-model.md`](docs/data-model.md) | Entidades, máquina de estados, colecciones y bloques de Payload. |
| [`docs/roadmap.md`](docs/roadmap.md) | Sprints, riesgos, gate de Medusa. |
| [`docs/operations.md`](docs/operations.md) | Testing y CI, variables de entorno, setup de MCP. |
| [`docs/orders-state-machine.md`](docs/orders-state-machine.md) | Al tocar pedidos. La máquina y sus replays. |
| [`docs/payments-runbook.md`](docs/payments-runbook.md) | Al tocar pagos u operar webhooks. Circuito completo y activación de proveedores. |
| [`docs/deployment.md`](docs/deployment.md) | Antes de desplegar. Vercel, dominios, env vars. |
| [`docs/reference.md`](docs/reference.md) | Glosario, activos de marca, vigencia de los datos. |
| [`docs/adr/`](docs/adr/) | Decisiones estructurales y su porqué. |
| [`docs/recipes/`](docs/recipes/) | Recetas paso a paso para tareas repetidas. |
| [`.claude/rules/`](.claude/rules/) | Reglas específicas de pagos y base de datos. |

---

## 0. TL;DR
1. **Construye la experiencia Courvia, no una nueva Shopify.** Commerce fino sobre **Next.js 16 + Payload 3 + Supabase + Stripe** en Vercel. Medusa = decisión condicionada (gate en S7), **no** destino garantizado.
2. **Multideporte con el pádel como cuña**: el mercado de robots de pádel es incipiente y España (~17.000 pistas) y EAU (950+, 40-50 % anual) son sus capitales. Tenis = mercado maduro; pickleball = palanca UK/EAU.
3. **3 mercados sin entidad extranjera en Fase 1**: cuenta Stripe España presenta EUR/GBP/AED cross-border (settlement EUR); Stripe Tax cubre ES+UK; EAU se sirve **DDP** vía courier-broker. Tabby/Tamara (EAU) van por **API directa, no Stripe**.
4. **Tema = tokens + composición** (editable como WordPress) y **pago = puerto `PaymentProvider`** (intercambiable como los temas): la máquina de estados de pedidos consume eventos normalizados y no sabe qué pasarela hay detrás. Cambiar Stripe↔Adyen, o de cuenta, no debe costar en exceso.

---

## 1. Qué es Courvia (resumen)

**Courvia** (court + vía) — marca de entrenamiento para **deportes de raqueta**. Producto ancla: **robots lanzapelotas** (900–2.000 €); alrededor: contenido (Academy), equipamiento (Gear) y futuro club. Entidades: Courvia **Studios** (matriz) · **Sports** (entidad comercial, sociedad española) · **Drill** (robots) · **Gear** · **Club** (futuro).

**Posicionamiento (ADR-10):** especialista de **robots de pádel** en ES/EAU; tenis para el mercado maduro; pickleball como crecimiento en UK/EAU.

**Mercados:** España (base) · EAU/Dubái · Reino Unido. **Idiomas:** ES, EN; AR en fase posterior (legal primero).

**Pendiente legal:** verificar la marca "Courvia" en OEPM/EUIPO y el dominio antes de inversión fuerte.

→ Detalle completo en [`docs/product.md`](docs/product.md).

---

## 2. Principio rector y build-vs-buy

> **"Construye la experiencia Courvia, no una nueva Shopify."**

La IA abarata escribir código, **no** mantener pagos/impuestos/inventario/seguridad. Reducimos superficie propia y automatizamos su verificación (CI como verdad).

| Construimos (diferencial) | NO construimos (comprar/integrar) |
|---|---|
| Configurador y comparador de robots por deporte | Procesamiento de tarjetas → **Stripe** (u otro adaptador del puerto) |
| PDP "de convencer" (specs, vídeo, garantía, BNPL, cross-sell) | Motor fiscal → **Stripe Tax** + asesor |
| Leads / demo / recuperación comercial | Emailing → **Resend/Brevo** |
| Academy (contenido por deporte/nivel) | Constructor CMS genérico (bloques acotados) |
| Garantía, repuestos, RMA, posventa | Motor universal de promociones |
| Flujo de pedido pequeño y muy probado | Marketplace multi-vendedor |
| Sistema de temas + **puerto de pagos** + CRM/leads básico | Colas/workflows prematuros · Facturación propia (→ proveedor **VeriFactu**) |

**Regla:** capacidad genérica/regulada/resuelta por SaaS maduro → se compra. Donde se gana o pierde la venta → se construye.

---

## 3. Stack, monorepo y puertos

**Stack:** Next.js **16.x** (App Router, RSC) en **Vercel** · **Payload 3.x** embebido (estable y compatible con el Next.js 16.x elegido; la versión exacta se fija en ADR-000) · **Supabase** (Postgres `xurdwzbefgxpfzgkbbkf`, Auth, Storage) · **Stripe** (adaptador de pago por defecto) · **Resend/Brevo** · Node **22/24** · pnpm + Turborepo · GA4 + Plausible. **Versiones exactas pineadas y verificadas contra el registro npm en `docs/adr/ADR-000-versions.md`.**

```
apps/
  web/                        # Next.js + Payload embebido (/admin)
packages/
  platform/                   # vocabulario transversal: deportes, locales, mercados, monedas, regiones
  design-tokens/              # DTCG + contrato semántico + build a CSS vars
  appearance/                 # controles de apariencia ligados a tokens (ADR-016)
  ui/                         # primitivas; solo tokens semánticos, sin className/style
  sections/                   # (WP7) unidades editables: bloque Payload + RSC + apariencia
  commerce-domain/            # puertos + PaymentEvent + máquina de estados (puro)
  commerce-payload/           # adaptador de CommerceService (persistencia y catálogo)
  payments-stripe/            # adaptador de PaymentProvider (pasarela)
  payments-tabby/ payments-tamara/  # adaptadores BNPL EAU (S4)
  config/                     # eslint/tsconfig/stylelint compartidos
docs/  ARCHITECTURE.md · adr/ · recipes/ · orders-state-machine.md · payments-runbook.md · deployment.md
brand/ # activos entregados, congelados
```

**Un paquete por puerto, nunca por proveedor** (ADR-017). Las fronteras entre capas las verifica `pnpm arch`, no la confianza: ver `docs/ARCHITECTURE.md` §1.

### 3.1 Puerto de commerce — `CommerceService`
El frontend consume SOLO esta interfaz. Métodos:

- `getProductDetail(slug, market)` — todo lo que renderiza una PDP, en una sola llamada consciente del mercado (las rutas son por slug).
- `listProducts(filter)` — resúmenes (`ProductSummary[]`) para facetas y comparador.
- `getAvailability(skus)` — disponibilidad en lote, nunca N+1.
- `createCheckout(input)` — abre el flujo de pedido; el importe se calcula en servidor.
- `getOrder(id)` — consulta de un pedido.
- `requestReturn(input)` — solicitud de devolución.

Firma exacta: `packages/commerce-domain/src/commerce-service.ts` (la fuente de verdad es el código; no se duplica aquí).

Si algún día llega Medusa: se añade `commerce-medusa` y se cambia el adaptador. No abstraer más casos de uso de los que la tienda usa.

### 3.2 Puerto de pagos — `PaymentProvider` (intercambiable como los temas)
Métodos:

- `id` — identificador del proveedor (`PaymentProviderId`).
- `createSession(order, market)` — crea la sesión de pago de un pedido para un mercado.
- `refund(providerPaymentId, amount?)` — reembolso total o parcial.
- `verifyWebhook(rawBody, signature)` — verifica la firma sobre los bytes exactos recibidos; `async` obligatorio (toda pasarela firma el cuerpo sin parsear, y leerlo exige `await`).
- `normalizeEvent(event)` — traduce el evento del proveedor a `PaymentEvent`; `null` = evento sin significado de dominio.

Firma exacta: `packages/commerce-domain/src/payment.ts` (la fuente de verdad es el código; no se duplica aquí).

**Todo adaptador debe pasar las suites de contrato** de `@courvia/commerce-domain/testing`. Son las que convierten "cambiar de pasarela sin tocar el dominio" en algo verificado.
- **La máquina de estados de Order consume solo `PaymentEvent` normalizados**: el dominio no sabe qué pasarela hay detrás.
- **Multi-gateway por mercado (estilo WooCommerce):** `MarketSettings.paymentProviders[]` define qué proveedores se ofrecen y en qué orden; **el checkout los pinta y el cliente elige**. Ej.: ES → stripe (card+Bizum+Klarna/seQura) · UK → stripe (card+Klarna/Clearpay) · EAU → stripe (card+Apple Pay) + tabby + tamara.
- **Cambiar de proveedor** (p. ej. Stripe→Adyen): escribir `payments-adyen` contra el puerto + activarlo en MarketSettings. Nada del dominio ni del frontend cambia.
- **Cambiar de cuenta** (otra cuenta Stripe/Adyen): rotar env vars + re-registrar webhooks + drenar pagos en vuelo → runbook en `docs/payments-runbook.md`.
- **Anti-sobre-ingeniería:** Fase 1 implementa solo `stripe`; en S4 entran `tabby`/`tamara`, que **ya validan el puerto con proveedores reales**. `adyen` solo si un mercado lo exige (tarifas/entidad local). No construir UI de "gestor de pasarelas" genérico: es un array de config en un Global.

---

## 4. Reglas duras (no negociables)

**Pagos/pedidos:** importe calculado y validado **solo en servidor** · webhooks con **firma verificada** e idempotencia por **`(provider, provider_event_id)` UNIQUE** · transiciones de pedido por **máquina de estados dentro de transacción** (§10.2) alimentada solo por `PaymentEvent` normalizados · pago fallido **no** reserva stock (commit solo tras `paid`) · reembolsos **manual-asistidos** al inicio.

**Datos/seguridad:** tablas commerce en **schema Postgres no expuesto** al Data API; si algo se expone → grants explícitos + **RLS** · claves privilegiadas (**`SUPABASE_SECRET_KEY`**; nomenclatura legacy `service_role`) **jamás** en cliente ni en el repo; **el agente nunca las solicita, lee ni usa** (tampoco contraseñas Postgres ni secretos de pago); una futura app backend podrá usar una clave secreta específica **solo si una tarea aprobada lo justifica** y está almacenada en Vercel · **migraciones:** se crean, revisan y prueban en local/desarrollo; **su aplicación a producción va únicamente por CI** con aprobación explícita · MCP de producción **en solo-lectura**, limitado al proyecto y a las features necesarias · secrets: en local `.env.local` (ignorado por Git) o gestor de contraseñas; despliegue en Vercel; CI en GitHub Environments/Secrets; nunca en el repo · credenciales de pago **namespaced por proveedor** (§15).

**Gobernanza IA:** tareas pequeñas con criterios de aceptación previos (issue/PRD antes de código) · revisión cruzada (otro modelo o pasada separada) de seguridad/arquitectura/casos límite · **CI con Playwright como fuente de verdad** ("parece correcto" no es verificación) · **humano aprueba** pagos, permisos, RLS y prod · decisiones estructurales **nuevas o que se desvíen de este documento** → **ADR** (§20); lo ya aprobado aquí no requiere ADR adicional · actualizar este MD al cerrar cada sprint.

---

## 5. Sistema de temas (tokens + composición)

**Un tema = tokens + composición.** Además de tokens: registro de secciones, **variantes de header/hero/PDP/footer por tema** y reglas de composición.

- **Defaults en Git** (`packages/design-tokens/tokens.json`, formato **DTCG 2025.10** — estable del Community Group, *no* Recomendación W3C).
- **Tema activo + overrides → Global `ThemeSettings` de Payload** (una sola fuente de verdad). Override = **JSON parcial validado con Zod**; whitelist: `font.display`, `container.width`, `radius.*`, `color.accent`, `color.surface`. **Restaurar = borrar la clave** → vuelve al valor de Git.
- Render: **CSS variables + `data-theme` en `<html>` desde el servidor** (patrón next-themes, **sin FOUC**). *Tradeoff conocido:* leer la cookie en el layout raíz fuerza render dinámico de toda la app; aceptado en S0, revisar en S1 (cacheComponents/PPR o theming vía middleware) antes de medir CWV.
- **Nombres de tema:** `data-theme` usa los alias cortos `volt` · `carbon` · `club`, que mapean a las claves canónicas `volt-precision` · `carbon-drive` · `club-real` de `brand/courvia-tokens.json` (los **valores exactos** de tokens los manda siempre el JSON).
- **Bloques Payload: 10-12 específicos, no 50 genéricos** (el admin degrada con exceso de bloques/campos).

| Tema | Uso | bg / surface | accent (AA) | Tipografías |
|---|---|---|---|---|
| **volt** (default, dark-first) | Sitio principal | `#081426` / `#0E2038` | volt `#D8F343` (texto `#081426`) | Anybody · Archivo · IBM Plex Mono |
| **carbon** | Fabricante/ingeniería | `#E8E7E3` / `#F4F3F0` | `#E24E12` **con texto oscuro** `#141518` | Chakra Petch · IBM Plex Sans |
| **club** | Courvia Club | `#F7F5EC` / `#FFFFFF` | arcilla `#B24A28`; verde `#14503C`; oro `#D9A441` | Bricolage Grotesque · Instrument Sans · Instrument Serif (itálica, lemas) |

**Primitivos compartidos:** spacing base 4 px · radios 6/12/20/999 · breakpoints 480/680/860/1180 · motion 150/300/600 ms · **propiedades lógicas CSS desde S0** (`margin-inline`, `inset-inline`…) para RTL sin refactor.

---

## 6. Flujo de sesión

**UNA tarea del roadmap por sesión** → plan breve → aprobación → implementar → tests y CI en verde → commit convencional → actualizar la documentación si cambió una decisión. Nada de "hazme todo el sprint".

Antes de escribir código: leer `docs/ARCHITECTURE.md` si la tarea toca estructura, y la receta de `docs/recipes/` si existe una para lo que vas a hacer.

Verificación obligatoria antes de cada commit:

```bash
pnpm verify     # build · typecheck · lint · stylelint · arch · test
```

`pnpm arch` comprueba las fronteras entre paquetes. **CI es la verdad**: "parece correcto" no es verificación.

---

## 7. Registro de decisiones

Las decisiones 01–14 están resumidas abajo y desarrolladas en `docs/`. Las decisiones **nuevas o que se desvíen** de este documento requieren un ADR en `docs/adr/` **antes** del código.

| ADR | Decisión |
|---|---|
| 01 | Commerce fino: Fase 1 Stripe+Supabase, sin Medusa (gate en `docs/roadmap.md`) |
| 02 | Un dominio con subrutas por locale (no ccTLDs) |
| 03 | `next-intl` para i18n App Router |
| 04 | `sport` como atributo de variante (Tempo R1 → P/T; Go → PB), no entidad |
| 05 | Precios fijos por moneda con `Price` objects (Adaptive solo respaldo) |
| 06 | Tabby/Tamara por API directa (no existen en Stripe) |
| 07 | Facturación ES vía proveedor homologado VeriFactu, no motor propio |
| 08 | EAU: DDP cross-border desde España, sin entidad UAE en Fase 1 |
| 09 | Árabe: legal/privacidad primero; UI comercial AR en fase posterior |
| 10 | Posicionamiento: especialista de robots de pádel en ES/EAU |
| 11 | Overrides de tema en Global de Payload; defaults en Git; Zod; restore=borrar clave |
| 12 | Tokens: JSON DTCG tipado + script propio; Style Dictionary solo con más plataformas |
| 13 | Puerto `PaymentProvider` con eventos normalizados; idempotencia `(provider, provider_event_id)` |
| 14 | Multi-gateway por mercado en `MarketSettings.paymentProviders[]`; el cliente elige |
| **15–23** | Ver [`docs/adr/`](docs/adr/): tema desde CMS · registro de secciones · paquete por puerto · catálogo propio · `@courvia/platform` · regiones en la URL · commerce en el CMS · catálogo real Tempo/Go/Rally con régimen de evidencia · vocabulario de composición (sin HTML libre) |

---

*Fin. Ante ambigüedad: releer §2 (principio rector) y §4 (reglas duras). Ante decisiones nuevas: ADR primero, código después.*
