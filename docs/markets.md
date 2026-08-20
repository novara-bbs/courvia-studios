# Mercados, i18n y SEO internacional

> España · Reino Unido · EAU: monedas, impuestos, pagos, privacidad y logística, más el modelo de idiomas y el SEO internacional.

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

---

## 9. i18n y multi-región técnica

1. **Un dominio, subrutas por locale** (`courvia.com/es`, `/en-gb`, `/en-ae`, futuro `/ar-ae`) — no ccTLDs (ADR-02). **Locale ≠ market**: UK y EAU comparten EN pero son mercados distintos (moneda, impuestos, envíos, SEO) → rutas separadas.
2. **`next-intl`** para App Router/RSC (ADR-03). Segmento `[locale]`, middleware de negociación (cookie → Accept-Language → default) que **sugiere, nunca fuerza**; selector país/idioma persistente; **hreflang** + `x-default`. La negociación solo aterriza en regiones **publicadas**: un navegador en árabe va a `/en-ae` —mismo mercado, idioma que sí publicamos— y no a una página marcada `noindex` con el cuerpo en español. Un enlace profundo a `/ar-ae` no se reescribe jamás.
3. **Payload localization** nativa: `locales: [es (default), en, ar(rtl)]`, `fallback: true`. Bugs conocidos de RTL en admin (issues #10344, #9482) → **fijar `dir` en `<html>` server-side**, no confiar en el default.
4. **Árabe (ADR-09):** Fase 1 EAU en EN + **documentos legales y privacidad en AR** (obligación e-commerce/PDPL); UI comercial AR en S5+ si hay tracción. Propiedades lógicas CSS desde S0 evitan el refactor.

   **Cómo se implementa (ADR-025).** `RegionDefinition.status` distingue una región **publicada** de una **preparada**. `ar-ae` está preparada: su ruta, su layout RTL, su `dir` y su `ar.json` existen y **los compila el build** —el trabajo de RTL sigue verificado—, pero no la declaramos en ninguna parte. Ni sitemap, ni hreflang (tampoco saliente: hreflang es recíproco y una anotación de ida es el error «no return tags»), ni selector público, ni `llms.txt`, ni el 404 global; y `noindex, nofollow` en todas sus páginas, declarado una vez en el layout de `[region]` porque la indexabilidad es propiedad de la región.

   Servir español bajo `lang="ar"` no era una carencia sino una **afirmación falsa**, y hreflang se evalúa por clúster: el castigo alcanzaba a `en-ae`, que sí es real. **Publicar árabe = cambiar ese único valor** en `packages/platform/src/index.ts`, con los documentos legales primero.

   Nunca `Disallow` en `robots.txt` para esto: una URL bloqueada no se descarga, así que el `noindex` no se lee nunca y la URL puede quedarse indexada sin descripción.
5. **Precios (ADR-05):** **`Price` objects con `currency_options` EUR/GBP/AED e importes fijos por mercado** (1.290 € no se convierte en 1.312,47 £). Adaptive Pricing solo como respaldo. Payment Element muestra métodos por país; Tabby/Tamara aparte (API propia, ADR-06).

---

---

## 14. SEO internacional
hreflang por **región publicada** + `x-default` (ADR-025: una región preparada no se anota) · sitemaps por locale en robots.txt · schema.org `Product/Offer` con **`priceCurrency` por mercado**, `AggregateRating`, `FAQPage`, `VideoObject` · CWV budget móvil: LCP <2,5 s · INP <200 ms · CLS <0,1 · meta localizada vía Payload.
