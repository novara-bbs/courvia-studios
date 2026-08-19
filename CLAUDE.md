# CLAUDE.md — Courvia · Documento Maestro (final)

> **Contexto completo para Claude Code.** Colócalo en la **raíz del repo** (se lee en cada sesión). Para otras herramientas: `ln -s CLAUDE.md AGENTS.md`.
> Fusiona todo el hilo de arquitectura: branding (3 temas) → arquitectura "commerce fino" → multideporte (tenis · pádel · pickleball) y 3 mercados (España · EAU/Dubái · Reino Unido) → **pasarela de pago intercambiable (puerto/adaptador)**. Redactado: 19 ago 2026.
> **Revisión 19 ago 2026 (correcciones aprobadas por el propietario):** claves Supabase actualizadas a la nomenclatura vigente (*publishable*/*secret*; las legacy `anon`/`service_role` se retiran a finales de 2026) · migraciones: se crean y prueban en local/desarrollo y **solo su aplicación a producción** va por CI · ADR solo para decisiones **nuevas o que se desvíen** de este documento · MCP de Supabase acotado (project_ref + features mínimas + read-only sobre datos reales) · versiones exactas del stack en `docs/adr/ADR-000-versions.md`.

---

## 0. TL;DR
1. **Construye la experiencia Courvia, no una nueva Shopify.** Commerce fino sobre **Next.js 16 + Payload 3 + Supabase + Stripe** en Vercel. Medusa = decisión condicionada (gate en S7), **no** destino garantizado.
2. **Multideporte con el pádel como cuña**: el mercado de robots de pádel es incipiente y España (~17.000 pistas) y EAU (950+, 40-50 % anual) son sus capitales. Tenis = mercado maduro; pickleball = palanca UK/EAU.
3. **3 mercados sin entidad extranjera en Fase 1**: cuenta Stripe España presenta EUR/GBP/AED cross-border (settlement EUR); Stripe Tax cubre ES+UK; EAU se sirve **DDP** vía courier-broker. Tabby/Tamara (EAU) van por **API directa, no Stripe**.
4. **Tema = tokens + composición** (editable como WordPress) y **pago = puerto `PaymentProvider`** (intercambiable como los temas): la máquina de estados de pedidos consume eventos normalizados y no sabe qué pasarela hay detrás. Cambiar Stripe↔Adyen, o de cuenta, no debe costar en exceso.

---

## 1. Qué es Courvia

**Courvia** (court + vía) — marca de entrenamiento para **deportes de raqueta**. Producto ancla: **robots lanzapelotas** (ticket 900–2.000 €); alrededor: contenido (Academy), equipamiento (Gear) y futuro club.

| Entidad | Rol |
|---|---|
| **Courvia Studios** | Matriz: design system, monorepo, I+D |
| **Courvia Sports** | Entidad comercial (seller of record; cuentas de pago y registros fiscales). **Supuesto: sociedad española** |
| **Courvia Drill** | Robots: **Drill One** (entrada) · **Drill Pro** (avanzado) · **Drill Club** (institucional) |
| **Courvia Gear** | Palas, raquetas, paddles, bolas, accesorios |
| **Courvia Club** | Futuro club + membresías **Tiza / Arcilla / Oro** |

**Posicionamiento (ADR-10):** especialista de **robots de pádel** en ES/EAU; tenis para el mercado maduro; pickleball como crecimiento en UK/EAU. Naming por deporte: **Drill Pro T / P / PB** (variantes, ver §7).

**Mercados:** España (base) · EAU/Dubái · Reino Unido. **Idiomas:** ES, EN (UK+EAU); AR en fase posterior (legal primero, §9.4).

**Pendiente legal:** verificar marca "Courvia" en OEPM/EUIPO y dominio antes de inversión fuerte.

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
  ui/                         # solo tokens semánticos, nunca hex crudos
  design-tokens/              # JSON DTCG tipado + script → CSS vars (SIN Style Dictionary aún)
  commerce-domain/            # tipos + CommerceService + PaymentProvider + máquina de estados
  commerce-stripe-supabase/   # adaptador actual (Stripe + tablas Supabase)
  payments-tabby/ payments-tamara/  # adaptadores BNPL EAU (S4)
  config/                     # eslint/tsconfig compartidos
docs/  ARCHITECTURE.md (crear al cierre de S0) · adr/ · orders-state-machine.md · payments-runbook.md (crear en S2)
brand/ # activos ya creados (ver §20.3)
```

### 3.1 Puerto de commerce — `CommerceService`
El frontend consume SOLO esta interfaz:
```ts
interface CommerceService {
  getProduct(id: string): Promise<Product>
  getAvailability(sku: string): Promise<Availability>
  createCheckout(input: CheckoutInput): Promise<Checkout>
  getOrder(id: string): Promise<Order>
  requestReturn(input: ReturnInput): Promise<ReturnRequest>
}
```
Si algún día llega Medusa: se añade `commerce-medusa` y se cambia el adaptador. No abstraer más casos de uso de los que la tienda usa (5-6).

### 3.2 Puerto de pagos — `PaymentProvider` (intercambiable como los temas)
```ts
interface PaymentProvider {
  id: 'stripe' | 'tabby' | 'tamara' | 'adyen' /* futuros */
  createSession(order: Order, market: Market): Promise<PaymentSession> // url | clientSecret
  refund(providerPaymentId: string, amount?: Money): Promise<RefundResult>
  verifyWebhook(req: Request): ProviderEvent            // verifica firma
  normalizeEvent(e: ProviderEvent): PaymentEvent        // → authorized | paid | failed | refunded(parcial)
}
```
- **La máquina de estados de Order consume solo `PaymentEvent` normalizados**: el dominio no sabe qué pasarela hay detrás.
- **Multi-gateway por mercado (estilo WooCommerce):** `MarketSettings.paymentProviders[]` define qué proveedores se ofrecen y en qué orden; **el checkout los pinta y el cliente elige**. Ej.: ES → stripe (card+Bizum+Klarna/seQura) · UK → stripe (card+Klarna/Clearpay) · EAU → stripe (card+Apple Pay) + tabby + tamara.
- **Cambiar de proveedor** (p. ej. Stripe→Adyen): escribir `payments-adyen` contra el puerto + activarlo en MarketSettings. Nada del dominio ni del frontend cambia.
- **Cambiar de cuenta** (otra cuenta Stripe/Adyen): rotar env vars + re-registrar webhooks + drenar pagos en vuelo → runbook en `docs/payments-runbook.md` (crear en S2).
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

## 6. Diseño

Dark-first (volt) · **bento grids** en home y specs · tipografía variable expresiva solo en hero · **liquid glass quirúrgico**: solo nav sticky, overlays y tarjetas sobre imagen, siempre con **respaldo opaco AA** (≥4.5:1) y respeto a `prefers-reduced-motion/transparency`; nunca párrafos sobre glass · firma visual: **trayectoria punteada** (máx. 1 por pantalla) · referencia estética: tenniscore/Courtix (Dribbble) · validar AA en los 3 temas **y en RTL** · los deportes comparten layout y cambian imaginería (variantes de sección, no temas nuevos). Reglas Sí/No por tema en `brand/courvia-guia-de-marca.pdf`.

---

## 7. Multideporte: producto y catálogo

**La bola manda sobre el hardware:** tenis (caucho presurizado ~57 g, hasta ~110 km/h) · pádel (similar, menos presión, trayectorias bajas, juego de pared) · pickleball (plástico perforado 22-26 g, red baja → velocidad/elevación reducidas, ruedas suaves). Una máquina de tenis "sirve" para pickleball bajando velocidad, pero degrada la experiencia → **configuración por deporte**.

**Benchmark:** Lobster (líneas por deporte; Lobster Padel ~1.429 $; Pickle 1.139–2.199 $; garantía 2 años, batería/ruedas 6 m), Spinshot (Player ~1.600 $; Pickleball Player dedicada; 2 años, devolución 30 días), Sports Tutor (Multi-Twist multideporte), Tennibot Partner (premium AI), Erne/Titan/Proton (pickleball ~1.000-2.300 $). **Tenis = maduro/comoditizado; pádel = incipiente → océano azul Courvia a 900-1.400 €.**

**Decisión (ADR-04):** un chasis por gama con **`sport` como atributo de la variante** (`Drill Pro` → variantes T/P/PB; kits hopper/ruedas como componentes de variante). Rechazados: robot universal mediocre y productos independientes sin familia (rompen comparador/analítica). **Gear** facetado por `sport`; bolas de tenis/pádel (presurizadas) y de pickleball (plástico) son consumibles de categorías distintas.

---

## 8. Mercados ES / UK / AE

| Dimensión | 🇪🇸 España | 🇬🇧 Reino Unido | 🇦🇪 EAU/Dubái |
|---|---|---|---|
| Moneda (presentment) | EUR | GBP | AED |
| Impuesto | IVA **21 %** | VAT **20 %** | VAT **5 %** |
| Regla de bienes | Doméstico | **≤£135**: VAT en checkout + registro HMRC. **>£135** (nuestros robots): import VAT/duty en frontera → **DDP** + **registro VAT UK (sin umbral) + EORI GB** | Import VAT 5 % + **duty 5 % sobre CIF**; de-minimis courier AED 300 |
| Cálculo impuesto | **Stripe Tax** ✔ | **Stripe Tax** ✔ | Stripe Tax **NO** calcula VAT de importación si Courvia no es importador → checkout calcula 5 %+5 % CIF propio |
| Pagos must-have | Tarjeta, **Bizum** (vía Stripe), PayPal, **Klarna/seQura** | Tarjeta, **Klarna/Clearpay**, Apple/Google Pay | Tarjeta, **Apple Pay**, **Tabby/Tamara por API directa (NO Stripe)** — widget de cuotas en PDP |
| COD | No | No | En caída (41 %→20 % MENA; ~10 % UAE) → **no ofrecer** en ticket alto |
| Privacidad | RGPD + LSSI | UK GDPR + PECR | **PDPL** (Decreto-Ley 45/2021, extraterritorial) |
| Idioma | ES | EN | EN comercial suficiente; **AR obligatorio en T&C, contratos y avisos de privacidad** |
| Desistimiento | **14 días** (Art. 102 TRLGDCU; 12 meses si no se informa) | 14 días + Consumer Rights Act 2015 | Según contrato/Ley e-commerce |
| Facturación | **VeriFactu** (abajo) | Factura VAT | Factura VAT; e-invoicing piloto jul-2026, grandes ene-2027 |
| Logística 12-15 kg | Correos/SEUR/GLS | DPD/Royal Mail (DDP) | Aramex (DDP, broker/importador de registro) |

**VeriFactu (ES, crítico):** RD 1007/2023 + Orden HAC/1172/2024 — el software de facturación debe generar registros inalterables con hash y remisión AEAT; aplica **sin umbral**; calendario 2026-2027 (RD-ley 15/2025). **Stripe no es un SIF homologado** → integrar **proveedor de facturación certificado por API** que consuma pedidos desde Supabase (ADR-07). Validar plazos con asesor fiscal.

**Cross-border confirmado:** cuenta **Stripe España** presenta **GBP y AED** y liquida en **EUR** sin entidad UK/UAE (FX ~1-2 %/transacción). Settlement multi-moneda (cuenta GBP/AED) solo si el volumen lo justifica. **Stripe UAE local** exigiría entidad+banco en EAU → diferido (ADR-08).

---

## 9. i18n y multi-región técnica

1. **Un dominio, subrutas por locale** (`courvia.com/es`, `/en-gb`, `/en-ae`, futuro `/ar-ae`) — no ccTLDs (ADR-02). **Locale ≠ market**: UK y EAU comparten EN pero son mercados distintos (moneda, impuestos, envíos, SEO) → rutas separadas.
2. **`next-intl`** para App Router/RSC (ADR-03). Segmento `[locale]`, middleware de negociación (cookie → Accept-Language → default) que **sugiere, nunca fuerza**; selector país/idioma persistente; **hreflang** + `x-default`.
3. **Payload localization** nativa: `locales: [es (default), en, ar(rtl)]`, `fallback: true`. Bugs conocidos de RTL en admin (issues #10344, #9482) → **fijar `dir` en `<html>` server-side**, no confiar en el default.
4. **Árabe (ADR-09):** Fase 1 EAU en EN + **documentos legales y privacidad en AR** (obligación e-commerce/PDPL); UI comercial AR en S5+ si hay tracción. Propiedades lógicas CSS desde S0 evitan el refactor.
5. **Precios (ADR-05):** **`Price` objects con `currency_options` EUR/GBP/AED e importes fijos por mercado** (1.290 € no se convierte en 1.312,47 £). Adaptive Pricing solo como respaldo. Payment Element muestra métodos por país; Tabby/Tamara aparte (API propia, ADR-06).

---

## 10. Modelo de datos v2 + máquina de estados

### 10.1 Entidades
```
Sport = enum {tenis|padel|pickleball}         ← atributo, no tabla
Market {es|uk|ae}: currency, tax_behavior, shipping_zone, incoterm,
                   paymentProviders[]{provider, enabled, order}   ← multi-gateway
Locale {es|en|ar}: rtl(bool)
Product ─1:N─ Variant {sku, sport, attributes(jsonb), weight_kg, dims}
Variant ─1:N─ Price {currency, unit_amount, market}      ← precio por mercado
Product/Post/Page: campos localizados (title*, description*) por Locale
Inventory {variant, qty_on_hand, qty_committed}          ← commit solo tras paid
Order {market, currency, status, totals, tax_total}
  ─1:N─ OrderLine · ─1:1─ Address(ship/bill) · ─1:N─ Shipment {carrier, tracking, incoterm DDP|DDU}
  ─1:N─ Payment {provider, provider_payment_id, provider_event_id, status,
                 UNIQUE(provider, provider_event_id)}    ← agnóstico de pasarela
ReturnRequest/RMA {order, reason, status, refund_amount}
Customer ─1:N─ Order · Lead {market, sportInterest, consent por market, estado}
Discount · Segment(reglas) · EmailCampaign · Membership (futuro Club)
Globals: ThemeSettings · MarketSettings · Navigation (por locale)
```

### 10.2 Máquina de estados de Order (consume `PaymentEvent` normalizados)
| De → A | Disparador (`PaymentEvent` / acción) | Side-effects |
|---|---|---|
| draft → pending_payment | Checkout creado (session del provider elegido) | Reserva temporal (sin descontar stock) |
| pending_payment → **paid** | `paid` (ej. Stripe `payment_intent.succeeded` / Tabby captured) | **Commit stock** · email confirmación · CRM · **factura VeriFactu (ES)** |
| pending_payment → cancelled | `failed` / expiración | Sin stock; email opcional |
| paid → preparing | Backoffice | Picking |
| preparing → shipped | Alta Shipment | Email tracking |
| shipped → delivered | Webhook courier / manual | Email posventa · abre ventana desistimiento |
| paid/preparing → refund_requested | Cliente/soporte | Aprobación humana |
| refund_requested → refunded / partially_refunded | `refunded` (total/parcial) | Email · nota de crédito · stock si aplica |
| delivered → return_requested | Cliente (14 días ES/UK) | Genera RMA + instrucciones |
| return_requested → return_received → refunded | Recepción → aprobación humana | `provider.refund()` · reingreso stock |

Toda transición en transacción; idempotencia por `(provider, provider_event_id)` UNIQUE.

---

## 11. Payload: colecciones · globals · bloques

**Colecciones** (\*=localizado): `products` (title*, slug, sport, description*, specs jsonb, warranty — público read) · `variants` · `prices` (**solo servidor**) · `pages` (blocks[], seo) · `academyPosts` (sport, level) · `leads` (**servidor/CRM**) · `orders` / `payments` / `returns` / `shipments` (**solo servidor/RLS**) · `media` (Supabase Storage) · `redirects` · `users` (roles).

**Globals:** `ThemeSettings` (tema activo + overrides Zod) · `Navigation` por locale · `MarketSettings` por mercado (moneda, impuestos, envíos, incoterm, **paymentProviders[] con orden de presentación**).

**Bloques (definitivos):** Hero · BentoGrid · SpecsTable · ProductComparator · VideoBlock · LeadForm · TestimonialStrip · FAQBlock · CTABand · RichText · MediaGallery · WarrantyBlock.

---

## 12. Sitemap y navegación (deporte primero)

```
/[locale]/
  /tenis · /padel (★ ES/EAU) · /pickleball     → landings de deporte
  /robots (faceta sport|nivel|precio)
    /robots/drill-one · /drill-pro · /drill-club
  /robots/comparar · /robots/selector (quiz)
  /gear (faceta sport) · /academy (sport, nivel)
  /tecnologia · /financiacion · /club (futuro)
  /soporte (manuales · firmware · garantia · rma · faq)
  /sobre-courvia · /contacto · /distribuidores · /cuenta
  /legal (T&C · privacidad [AR en EAU] · cookies · devoluciones)
```
**Mega-menú:** columna por deporte → Robots/Gear/Academy dentro. Selector país/idioma persistente + moneda ligada a market. **Footer:** Producto · Soporte · Empresa · Newsletter+idioma · franja legal.

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

## 14. SEO internacional
hreflang por locale + `x-default` · sitemaps por locale en robots.txt · schema.org `Product/Offer` con **`priceCurrency` por mercado**, `AggregateRating`, `FAQPage`, `VideoObject` · CWV budget móvil: LCP <2,5 s · INP <200 ms · CLS <0,1 · meta localizada vía Payload.

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

## 16. Roadmap (sprints de 2 semanas; revisión + actualizar este MD al cierre)

| Sprint | Objetivo | DoD | Riesgo |
|---|---|---|---|
| **S0** Fundaciones | Monorepo, tokens, CI, MCP, **locales es/en/ar y markets es/uk/ae desde el día 1**, esqueleto `CommerceService` + `PaymentProvider`, ADRs | 3 temas conmutan sin FOUC; CI verde; admin logueable | Refactor i18n tardío |
| **S1** Sitio público Volt (solo ES) | Landings deporte (pádel ★), PDP Drill Pro P, comparador, LeadForm, Academy | Editor publica sin código; CWV/AA verdes | Alcance comparador |
| **S2** Checkout EUR + emails | Adaptador `stripe` del puerto (cards+Bizum+Klarna/seQura), Stripe Tax ES, máquina estados, **VeriFactu**, RGPD, **payments-runbook** | E2E compra real + factura homologada | VeriFactu |
| **S3** Temas | carbon/club, overrides Zod, **variantes de sección por tema**, preview/versiones | Admin cambia tema/acento/fuente sin romper default | Deriva tokens |
| **S4** UK + EAU | `en-gb`/`en-ae`, precios GBP/AED, Klarna/Clearpay, **adaptadores tabby/tamara (validan el puerto)**, selector de método en checkout por MarketSettings, DDP + VAT UK/EORI, hreflang | E2E por mercado y proveedor verdes | Aduanas/VAT |
| **S5** CRM/marketing + AR legal | Segments, cupones, abandoned cart, flujos, consent por market, **T&C/privacidad AR** | Welcome+abandoned activos con métricas; AR legal live | RTL/Payload |
| **S6** Posventa avanzada | Repuestos, RMA completo, reembolsos semi-auto (vía `provider.refund`) | Flujos posventa E2E | Logística inversa intl. |
| **S7** **Gate Medusa** | Informe con métricas de disparadores (§18) | Decisión en ADR | Sobre-ingeniería |
| **S8** Club piloto | Membresías (Stripe subscriptions), tema club | Piloto medible | Alcance |

**Primeras 15 tareas (tamaño móvil, una por sesión):**
1. Monorepo pnpm+Turborepo + `config`. 2. Verificar/pinear versiones → `ADR-000-versions`. 3. Copiar `brand/`; `design-tokens`: JSON+tipos+`build-css.ts`. 4. `@courvia/ui` (Button/Card/Badge) + Storybook con switcher. 5. Payload embebido + Supabase (schema `payload`). 6. **`localization` (es/en/ar,rtl) + Global `MarketSettings` (es/uk/ae, paymentProviders[]) vacíos.** 7. `data-theme` + `dir` server-side, fuentes `next/font`. 8. MCP Supabase (comandos §19). 9. CI: lint+types+Vitest+Playwright smoke+migraciones dry-run. 10. `products`+`variants` con `sport`. 11. `prices` (currency, market) solo-servidor. 12. `commerce-domain`: `CommerceService` + **puerto `PaymentProvider` + tipos `PaymentEvent`** + máquina de estados (doc+tests). 13. Bloques Hero/RichText/CTABand + Home editable con live preview. 14. Landing `/es/padel` (Hero+Bento). 15. PDP Drill Pro P (SpecsTable+WarrantyBlock) + LeadForm→`leads`.

---

## 17. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **VeriFactu** incumplido | Sanciones AEAT | Proveedor homologado por API; asesor fiscal; nunca motor propio |
| VAT UK sin registro (1ª venta) | Multas/paquetes retenidos | Registro VAT+EORI antes de S4; DDP; Stripe Tax UK |
| VAT/duty EAU e importador | Coste oculto, mala UX | DDP con Aramex como broker; 5 %+5 % CIF calculado en checkout |
| Tabby/Tamara fuera de Stripe | Conversión EAU | Adaptadores propios del puerto en S4; widget cuotas en PDP |
| **Lock-in de pasarela / cambio de cuenta** | Migración costosa, pagos en vuelo | Puerto `PaymentProvider` + eventos normalizados + runbook de rotación (ADR-13/14) |
| RTL (bugs Payload) | UI rota en AR | Props lógicas desde S0; `dir` server-side; AR legal antes que UI |
| Envío intl. 12-15 kg | Retrasos/daños | Embalaje robusto, seguro, DDP, tracking en Shipment |
| Stock internacional | Roturas/capital | Stock central ES; cross-border; almacén local solo con volumen |
| FX EUR↔GBP/AED (~1-2 %) | Margen | Precios fijos por moneda con margen; settlement multi-moneda a volumen |
| Dependencia Payload (Figma) | Lock-in | Self-host; puertos; tokens en Git; ADRs |
| Entidad UAE (si stock/AED local) | Coste legal | Diferir; cross-border mientras no lo exija el volumen |

---

## 18. Medusa: gate condicionado (S7)

**Estado actual: ~1-1,5 disparadores de 2 necesarios → NO adoptar.** Stripe cubre presentment EUR/GBP/AED con settlement EUR, Stripe Tax cubre ES+UK, precios por `Price` objects y shipping zones propias resuelven la multi-región Fase 1.

**Migrar a Medusa v2 cuando se cumplan 2+ de:** (1) almacén/stock propio en EAU o UK (multialmacén + probable entidad UAE) · (2) VAT AED liquidado localmente con entidad UAE · (3) conciliación multi-proveedor (Stripe+Tabby+Tamara+Klarna) con reembolsos parciales frecuentes que desborden los adaptadores propios · (4) B2B/clubes con tarifas y catálogos por cuenta · (5) >30 % de sprints en commerce genérico (medir en S7). Si se adopta: host Node dedicado (Railway/Render) + Redis + split server/worker — **nunca en Vercel**; storefront sigue en Vercel; Postgres puede ser Supabase en schema propio. Documentar como ADR.

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

## 20. ADRs, glosario y activos

### 20.1 Registro de decisiones
| ADR | Decisión |
|---|---|
| 01 | Commerce fino: Fase 1 Stripe+Supabase, sin Medusa (gate §18) |
| 02 | Un dominio con subrutas por locale (no ccTLDs) |
| 03 | `next-intl` para i18n App Router |
| 04 | `sport` como atributo de variante (Drill Pro T/P/PB), no entidad |
| 05 | Precios fijos por moneda con `Price` objects (Adaptive solo respaldo) |
| 06 | Tabby/Tamara por API directa (no existen en Stripe) |
| 07 | Facturación ES vía proveedor homologado VeriFactu, no motor propio |
| 08 | EAU: DDP cross-border desde España, sin entidad UAE en Fase 1 |
| 09 | Árabe: legal/privacidad primero; UI comercial AR en fase posterior |
| 10 | Posicionamiento: especialista de robots de pádel en ES/EAU |
| 11 | Overrides de tema en Global de Payload; defaults en Git; Zod; restore=borrar clave |
| 12 | Tokens: JSON DTCG tipado + script propio; Style Dictionary solo con más plataformas |
| 13 | **Puerto `PaymentProvider` con eventos normalizados**: pasarela y cuenta intercambiables sin tocar dominio ni frontend; idempotencia `(provider, provider_event_id)` |
| 14 | **Multi-gateway por mercado** en `MarketSettings.paymentProviders[]`; el cliente elige método en checkout (estilo WooCommerce). Fase 1 solo `stripe`; `tabby`/`tamara` en S4; `adyen` solo si un mercado lo exige |

### 20.2 Glosario
Presentment/settlement currency · **DDP/DDU** (quién paga aranceles/VAT en frontera) · **SIF** (sistema de facturación VeriFactu) · **RMA** · **RLS** · **PDPL** (EAU, DL 45/2021) · **TRLGDCU** (RDL 1/2007) · **PaymentEvent** (evento de pago normalizado, agnóstico de pasarela).

### 20.3 Activos ya creados (en `brand/`)
`courvia-tokens.json` (fuente de verdad DTCG) · `courvia-brand-boards.html` (3 direcciones: paletas, tipografía, componentes, aplicaciones, reglas Sí/No) · `courvia-guia-de-marca.docx/.pdf`. El `courvia-tokens.css` original **no llegó a entregarse y no se recrea a mano**: es un artefacto derivado que genera `packages/design-tokens` desde el JSON (ver `brand/README.md`).

### 20.4 Vigencia de datos
Cifras de mercado (FIP World Padel Report 2025, LTA, Pickleball England, Playtomic) → reverificar anualmente. Capacidades Stripe (Bizum, Tax ES/UK, multi-currency, ausencia Tabby/Tamara), reglas VAT (UK £135, EAU 5 %+5 % CIF) y privacidad (PDPL/RGPD/PECR) confirmadas a ago-2026. **VeriFactu y e-invoicing tienen calendarios en cambio: validar con asesor fiscal antes de cada release que toque facturación.**

---
*Fin del documento. Ante ambigüedad: releer §2 (principio rector) y §4 (reglas duras). Ante decisiones nuevas: ADR primero, código después.*
