# ADR-021 · Commerce en el CMS: marcas, estados de lanzamiento y bloques de catálogo

- **Estado:** aceptado · **Fecha:** 2026-08-20
- **Extiende** ADR-018 (catálogo propio) y ADR-016 (registro de secciones)
  para que marketing monte landings, preventas y listas de espera sin código
  — el "¿lo permite el CMS?" de WooCommerce/Shopify/Kickstarter, respondido
  con tres piezas pequeñas en vez de un page-builder.

## Contexto

El catálogo vendía con una sola marca, un solo estado ("a la venta") y
páginas fijas. Faltaba: multimarca (Drill/Gear, docs/product.md), lanzar un
producto ANTES de venderlo (preventa con precio, lista de espera sin él), y
que una landing del CMS muestre productos VIVOS — precio y stock del
mercado activo, no copiados a mano en el contenido.

## Decisión

1. **`brands` como colección** (name, slug, logo, descripción) +
   `products.brand`. Multimarca = una faceta del catálogo único; nunca un
   multi-sitio ni un fork de colecciones. El puerto expone `ProductBrand`
   {slug, name}.
2. **`products.launchStatus`** enum del dominio (`LAUNCH_STATUSES`:
   `available · preorder · waitlist`). Las superficies derivan de él:
   waitlist no muestra precio ni variantes y captura con intent `waitlist`;
   preorder vende con chip "Preventa" y `PreOrder` en el JSON-LD; y
   `createCheckout` rechaza variantes de productos waitlist con el código
   `not_purchasable` — el estado es COMERCIAL, así que lo custodia el
   adaptador de commerce, no la UI.
3. **Bloques de commerce por inyección**: los bloques `productShowcase` y
   `waitlist` guardan REFERENCIAS (relationship) y el `RenderContext` inyecta
   `renderProductGrid`/`renderLeadForm` desde la raíz de composición. Las
   secciones siguen puras (jamás importan Payload ni el contenedor), y un
   cambio de precio llega a todas las landings por el tag `catalog`, no por
   ediciones de contenido.
4. **Categorías navegables**: `categories` gana imagen + descripción y la
   ruta `/{región}/c/{slug}` lista su catálogo con la MISMA `ProductCard`
   que el listado y los bloques (una tarjeta, cero derivas).
5. **Leads con `intent`** (`demo · waitlist · preorder`): un lanzamiento
   estilo Kickstarter es una página componible (hero + mediaText +
   featureGrid + waitlist + faq) sobre un producto en `waitlist` — estado +
   composición, nunca un tipo de página especial.

## Consecuencias

- Un lanzamiento se opera desde el admin: crear producto en `waitlist`,
  montar su landing, y el día D cambiar `launchStatus` a `preorder`/
  `available` — la PDP, las tarjetas, el JSON-LD y el checkout reaccionan
  solos.
- El comparador ignora `launchStatus` a propósito: compara specs, no ofertas.
- Pendiente consciente: countdown/fecha de lanzamiento (campo `launchesAt` y
  su bloque) y cupos de preventa (contador contra inventory) llegan cuando
  un lanzamiento real los pida — no antes.
