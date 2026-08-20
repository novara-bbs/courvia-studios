# ADR-024 — Portabilidad del puerto de commerce: qué pasa si algún día entra una plataforma externa

- **Fecha:** 20 ago 2026
- **Estado:** aceptada
- **Contexto de la pregunta:** «revisa si a futuro, en caso de que decida
  integrar una plataforma de e-commerce externa, se podría o no; tener la
  nuestra propia o incluso añadir una de Shopify; cómo lo hacen otros»

---

## 0. Resumen en cinco líneas

1. **La mitad de catálogo del puerto es portable.** Está demostrado, no
   afirmado: `packages/commerce-shopify` implementa `CommerceService` sobre
   la Storefront API y **pasa la misma suite de contrato** que el adaptador
   propio.
2. **La mitad de checkout no lo es, y no por un fallo del puerto.** Shopify
   aloja su propio checkout y emite sus propios pedidos. No hay nada honesto
   que devolver, así que el adaptador lanza `NotImplementedError`.
3. **El precio por mercado sí es compatible con ADR-05**, pero solo si se
   configura: por defecto Shopify convierte a tipo de cambio, que es
   exactamente lo que ADR-05 prohíbe.
4. **Hay una fuga que ningún adaptador puede cerrar:** el stock. Nuestro
   puerto pide un entero; Shopify normalmente responde un booleano.
5. **La forma realista no es «migrar», es el patrón headless híbrido** que ya
   usa el sector: CMS propio para contenido, plataforma externa para carrito
   y checkout. Lo que se pierde y lo que se conserva está en §4.

---

## 1. Por qué se responde con código

`docs/ARCHITECTURE.md §6` y ADR-018 afirman que el frontend consume solo el
puerto y que cambiar de backend de commerce sería un adaptador nuevo. Hasta
hoy **solo el adaptador propio había ejercido esa interfaz**, y un puerto que
únicamente ha visto una implementación no es un puerto: es la forma de esa
implementación con otro nombre.

`packages/commerce-shopify` existe para quitarle esa duda al documento. No es
una integración a punto de enchufar —ninguna ruta puede importarla, la regla
`adapters-are-not-imported-by-routes` de `.dependency-cruiser.cjs` lo
impide— sino un **estudio ejecutable**: dataset en memoria, `fetch`
inyectado, cero credenciales y cero red, corriendo en CI.

Lo importante es que la suite es **la misma función**
(`describeCatalogContract`) que corre contra `commerce-payload`. Si pasa con
dos backends sin parentesco, la frase de la arquitectura pasa a estar
verificada.

---

## 2. Veredicto método a método

| Método | ¿Portable a Shopify? | Detalle |
|---|---|---|
| `getProductDetail(slug, market)` | **Sí** | `product(handle:)` con la directiva `@inContext(country:, language:)`. `slug`↔`handle` es 1:1. Un handle desconocido es `null` en GraphQL, igual que en el puerto. |
| `listProducts(filter)` | **Sí, con matices** | `products(first:, query:)`. El filtrado por deporte va por tag (`tag:sport:padel`) porque el deporte es atributo de variante aquí (ADR-04) y taxonomía allí. Paginación real es por cursor, no por `offset`: con catálogos grandes, `offset` obliga a paginar y descartar. |
| `getAvailability(skus)` | **Sí en forma, degradada en fondo** | Una sola consulta por lote, sin N+1. Pero el número que devuelve **no siempre es un número** (§3.1). |
| `createCheckout(input)` | **No** | §4. |
| `getOrder(id)` | **No** | Requiere la Customer Account API (OAuth 2.0 desde febrero de 2026) o la Admin API. Ninguna de las dos pinta en un storefront. |
| `requestReturn(input)` | **No** | Operación de Admin API sobre un pedido que es de Shopify. |

El propio comentario del dominio en
`packages/commerce-domain/src/testing/contracts.ts` autoriza esto: un
adaptador puede implementar solo la mitad de catálogo y **lanzar
`NotImplementedError` en la otra, nunca fingir**. Fingir sería peor que
fallar: un `createCheckout` que devolviera un id inventado metería una fila
en la máquina de estados que ningún webhook va a avanzar nunca.

---

## 3. Las fugas, con su severidad

### 3.1 El stock es un entero aquí y un booleano allí — **alta, irreparable**

`Availability.available` es un entero porque nuestro libro de stock lo tiene:
`qty_on_hand - qty_committed`. La Storefront API expone `availableForSale`
(booleano) y solo publica `quantityAvailable` si la tienda activa
explícitamente el inventario en el canal. La mayoría no lo hace.

El adaptador mapea `availableForSale ? 1 : 0`, y el test lo llama por su
nombre: **ese 1 es un indicador de presencia, no un recuento**. Cualquier UI
que escriba «queda 1» leyendo ese campo estaría mintiendo al cliente.

No es un bug que arreglar en el adaptador: es información que el otro lado no
tiene. Si algún día se integra, `Availability` necesita distinguir «hay» de
«hay N» —un campo `exact: boolean` o un tipo suma— y eso **toca el dominio**,
no solo el adaptador. Queda anotado como el precio de entrada.

### 3.2 La conversión de divisa por defecto viola ADR-05 — **alta, evitable**

ADR-05 dice precios fijos por moneda, nunca convertidos: 1.290 € no puede
convertirse en 1.312,47 £. Shopify Markets, por defecto, **sí convierte** al
tipo del día con reglas de redondeo.

Es evitable: con listas de precios explícitas por mercado, Shopify sirve el
precio fijo. La tienda de prueba de `fixture-shop.ts` está montada así a
propósito —una lista de precios por país, no una conversión— y el test
`quotes each market in its own currency` lo comprueba. **La conclusión es que
ADR-05 es satisfacible en Shopify, pero solo como configuración deliberada:
la opción por defecto lo rompe en silencio.**

### 3.3 El dinero viaja como cadena decimal — **media, resuelta**

Shopify emite `{ amount: "1290.00", currencyCode: "EUR" }`; nuestro `Money`
son unidades menores enteras. La traducción es aritmética de cadenas, no
`parseFloat(x) * 100`: ese producto da 89049.99999999999 para 890,50 € y
mete un céntimo de error en una factura. El adaptador además **se niega a
redondear** si Shopify manda más precisión que decimales tiene la moneda —
prefiere fallar a inventar un precio.

### 3.4 El régimen de evidencia no existe al otro lado — **media, estructural**

`Spec.evidence` (ADR-022) es lo que permite publicar «120 bolas» con la
etiqueta «objetivo de diseño» y que esa etiqueta cambie sola en todas las
páginas cuando la cifra salga del banco de pruebas. Shopify no tiene ese
concepto: lo más parecido es un metafield con un string, sin ninguna garantía
de que alguien lo rellene.

Igual con la gobernanza de medios: `mediaValue()` devuelve `null` a un asset
marcado `blocked`, y por eso un render interno **no puede** llegar a una
landing. En Shopify eso es una convención, no un mecanismo.

De aquí sale la recomendación de §5: aunque entrara una plataforma externa,
**el contenido y la evidencia se quedan en Payload**.

### 3.5 `offset` contra cursores — **baja**

`ProductFilter.offset` es un salto por índice; Shopify pagina por cursor. Para
un catálogo de tres robots es irrelevante; para uno de miles obliga a leer y
descartar. Se resuelve dentro del adaptador, con coste.

---

## 4. Qué muere y qué sobrevive si el checkout se aloja fuera

Esta es la pregunta de verdad, y la respuesta no es simétrica.

**Muere** (deja de tener función, no «hay que reescribirlo»):

- `createCheckout` transaccional y el cálculo de importes en servidor: el
  total lo calcula Shopify.
- La reserva de stock (`commit_stock` solo tras `paid`) y el libro de
  inventario.
- La colección `orders` y **la máquina de estados entera**
  (`docs/orders-state-machine.md`).
- El **outbox** de efectos externos (email, factura, CRM) atado a esas
  transiciones.
- **El puerto `PaymentProvider` completo** y sus cinco adaptadores
  (stripe, adyen, tabby, tamara y el fake): los eventos de pago pasan a ser
  webhooks de Shopify sobre pedidos de Shopify, y la idempotencia
  `(provider, provider_event_id)` deja de ser nuestra.
- Con ellos, buena parte de `.claude/rules/payments.md`.

**Sobrevive intacto** —y es la mayoría de lo construido:

- Todo el sistema de temas: tokens, contrato semántico, los tres temas.
- Las 19 secciones, los 13 controles de apariencia y el registro que las
  proyecta a bloques de Payload.
- El CMS entero: páginas compuestas, navegación, legales, mediateca con su
  gobernanza, borradores y previsualización.
- i18n, regiones en la URL, SEO (sitemap, hreflang, JSON-LD, `llms.txt`).
- Leads, demos y el CRM básico.
- El comparador y las PDP, que consumen `CommerceService` y no saben quién
  hay detrás.

Dicho de otro modo: **se perdería la mitad regulada y transaccional, que es
también la que más caro sale mantener; y se conservaría toda la mitad
diferencial**, que es exactamente el reparto que propone CLAUDE.md §2. Que la
frontera caiga justo ahí no es casualidad: es lo que el puerto estaba
separando.

---

## 5. Cómo lo hace el sector

El patrón headless dominante no es «Shopify o lo tuyo», es **los dos**:

1. El contenido (landings, editorial, marca) vive en un CMS externo — Payload,
   Sanity, Contentful, Storyblok.
2. El carrito va por la **Cart API** de Shopify (la Checkout API legacy está
   retirada).
3. El pago **redirige a `cart.checkoutUrl`**: el checkout lo aloja Shopify,
   con su dominio y su PCI.
4. Las cuentas de cliente pasaron a **OAuth 2.0** con la Customer Account API
   (febrero de 2026).

Es decir: el sector no porta la máquina de estados a headless. La cede. Y a
cambio conserva el control total de la capa de contenido — que es justo la
que Courvia tiene hoy y la que este ADR recomienda no soltar en ningún
escenario.

---

## 6. Decisión

1. **Fase 1 no cambia.** El commerce fino sobre Payload + Supabase + el
   puerto de pagos sigue siendo el plan (ADR-01), y el gate de Medusa sigue
   donde está (`docs/roadmap.md`).
2. **Se conserva `packages/commerce-shopify` como estudio verificado**, no
   como integración. Ninguna ruta puede importarlo. Su valor es que la suite
   de contrato corre contra un segundo backend en cada CI: el día que alguien
   añada un método al puerto que solo el adaptador propio pueda cumplir, este
   paquete lo dirá.
3. **Si algún día se integra una plataforma externa, la forma es la híbrida
   de §5**, no una migración: contenido, temas, secciones y evidencia se
   quedan aquí; carrito y checkout se ceden.
4. **Dos cambios de dominio quedan anotados como precio de entrada**, y
   ninguno se hace ahora por especulación:
   - `Availability` tendría que distinguir «hay» de «hay N» (§3.1).
   - `ProductFilter` tendría que admitir paginación por cursor además de
     `offset` (§3.5).
5. **Sin adaptador no hay decisión.** Cualquier integración real vuelve a
   pasar por ADR, porque implica ceder la máquina de estados y el puerto de
   pagos, que son reglas duras de CLAUDE.md §4.

## Consecuencias

- Lo bueno: la afirmación de portabilidad deja de ser un párrafo y pasa a ser
  una suite verde; y las fugas que costarían dinero aparecen ahora, no en el
  sprint que las necesite.
- Lo malo: hay un paquete en el repo que nadie usa. Se acepta a cambio de que
  el puerto tenga un segundo testigo permanente.
- El riesgo real: que alguien lea este ADR como una hoja de ruta hacia
  Shopify. No lo es. Es la respuesta —«sí, la mitad de catálogo; no, el
  checkout»— con la factura detallada.
