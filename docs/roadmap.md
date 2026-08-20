# Roadmap, riesgos y el gate de Medusa

> Sprints, definición de hecho, riesgos con mitigación y los disparadores que reabrirían la decisión sobre Medusa.

**Estado vivo de ejecución → [`docs/ARCHITECTURE.md` §8](ARCHITECTURE.md).**

---

## 16. Roadmap (sprints de 2 semanas; revisión + actualizar este MD al cierre)

| Sprint | Objetivo | DoD | Riesgo |
|---|---|---|---|
| **S0** Fundaciones ✅ | Monorepo, tokens, CI, MCP, **locales es/en/ar y markets es/uk/ae desde el día 1**, esqueleto `CommerceService` + `PaymentProvider`, ADRs | 3 temas conmutan sin FOUC; CI verde; admin logueable | Refactor i18n tardío |
| **S1** Sitio público Volt (solo ES) | Landings deporte (pádel ★), PDP Drill Pro P ✅, comparador ✅, LeadForm ✅, Academy | Editor publica sin código; CWV/AA verdes | Alcance comparador |
| **S2** Checkout EUR + emails | Adaptador `stripe` del puerto (cards+Bizum+Klarna/seQura), Stripe Tax ES, máquina estados ✅, **VeriFactu**, RGPD, **payments-runbook** ✅ | E2E compra real + factura homologada | VeriFactu |
| **S3** Temas | carbon/club, overrides Zod, **variantes de sección por tema**, preview/versiones | Admin cambia tema/acento/fuente sin romper default | Deriva tokens |
| **S4** UK + EAU | `en-gb`/`en-ae`, precios GBP/AED, Klarna/Clearpay, **adaptadores tabby/tamara (validan el puerto)**, selector de método en checkout por MarketSettings, DDP + VAT UK/EORI, hreflang | E2E por mercado y proveedor verdes | Aduanas/VAT |
| **S5** CRM/marketing + AR legal | Segments, cupones, abandoned cart, flujos, consent por market, **T&C/privacidad AR** | Welcome+abandoned activos con métricas; AR legal live | RTL/Payload |
| **S6** Posventa avanzada | Repuestos, RMA completo, reembolsos semi-auto (vía `provider.refund`) | Flujos posventa E2E | Logística inversa intl. |
| **S7** **Gate Medusa** | Informe con métricas de disparadores (§18) | Decisión en ADR | Sobre-ingeniería |
| **S8** Club piloto | Membresías (Stripe subscriptions), tema club | Piloto medible | Alcance |

**Primeras 15 tareas (tamaño móvil, una por sesión):**

1. ✅ Monorepo pnpm+Turborepo + `config`.
2. ✅ Verificar/pinear versiones → `ADR-000-versions`.
3. ✅ Copiar `brand/`; `design-tokens`: JSON+tipos+`build-css.ts`.
4. ✅ `@courvia/ui` (Button/Card/Badge) — queda el Storybook con switcher.
5. ✅ Payload embebido + Supabase (schema `payload`).
6. ✅ **`localization` (es/en/ar,rtl) + Global `MarketSettings` (es/uk/ae, paymentProviders[]) vacíos.**
7. ✅ `data-theme` + `dir` server-side, fuentes `next/font`.
8. ✅ MCP Supabase (comandos §19).
9. ✅ CI: lint+types+Vitest+migraciones y seed contra Postgres real — queda el smoke de Playwright (WP 16).
10. ✅ `products`+`variants` con `sport`.
11. ✅ `prices` (currency, market) solo-servidor.
12. ✅ `commerce-domain`: `CommerceService` + **puerto `PaymentProvider` + tipos `PaymentEvent`** + máquina de estados (doc+tests).
13. ✅ Bloques Hero/RichText/CTABand + Home editable con live preview.
14. Landing `/es/padel` (Hero+Bento).
15. ✅ PDP Drill Pro P (specs+garantía) + LeadForm→`leads` — como ruta; la PDP editable como plantilla queda en WP 13 de ARCHITECTURE §8.

Entregado además de este plan (verificable en el repo): chrome global (header, footer, selector de región) · comparador `/comparar` · navegación y páginas legales seed · SEO (sitemap, hreflang, JSON-LD, `llms.txt`) · fontanería de pagos completa (orders/payments/outbox, webhook `/next/webhooks/[provider]`) con adaptador Stripe verify+normalize — la conexión del SDK (createSession/refund) queda en WP 15b.

---

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

---

## 18. Medusa: gate condicionado (S7)

**Estado actual: ~1-1,5 disparadores de 2 necesarios → NO adoptar.** Stripe cubre presentment EUR/GBP/AED con settlement EUR, Stripe Tax cubre ES+UK, precios por `Price` objects y shipping zones propias resuelven la multi-región Fase 1.

**Migrar a Medusa v2 cuando se cumplan 2+ de:** (1) almacén/stock propio en EAU o UK (multialmacén + probable entidad UAE) · (2) VAT AED liquidado localmente con entidad UAE · (3) conciliación multi-proveedor (Stripe+Tabby+Tamara+Klarna) con reembolsos parciales frecuentes que desborden los adaptadores propios · (4) B2B/clubes con tarifas y catálogos por cuenta · (5) >30 % de sprints en commerce genérico (medir en S7). Si se adopta: host Node dedicado (Railway/Render) + Redis + split server/worker — **nunca en Vercel**; storefront sigue en Vercel; Postgres puede ser Supabase en schema propio. Documentar como ADR.

---
