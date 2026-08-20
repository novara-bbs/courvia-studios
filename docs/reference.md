# Referencia: glosario, activos y vigencia

> Glosario del proyecto, activos de marca entregados y qué datos hay que reverificar y cuándo.

---

## 20. ADRs, glosario y activos

### 20.1 Registro de decisiones
| ADR | Decisión |
|---|---|
| 01 | Commerce fino: Fase 1 Stripe+Supabase, sin Medusa (gate §18) |
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
