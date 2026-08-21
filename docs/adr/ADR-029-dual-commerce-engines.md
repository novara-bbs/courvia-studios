# ADR-029 · Dos motores de comercio, una sola autoridad por transacción

- **Estado:** propuesto (borrador — pendiente de aprobación del propietario)
- **Fecha:** 21 ago 2026
- **Supera parcialmente:** [ADR-024](./ADR-024-commerce-portability.md)
- **Relacionado:** ADR-001 (commerce fino), ADR-013 (puerto de pagos), ADR-014 (multi-gateway
  por mercado), ADR-018 (catálogo propio), ADR-021 (commerce en el CMS)

## Contexto

ADR-024 estudió si el puerto de commerce sobrevivía a una plataforma externa. Su conclusión
fue matizada —«Shopify: catálogo sí, checkout no»— y `packages/commerce-shopify` se
construyó **como estudio**: fixtures, sin cliente HTTP, con `createCheckout`, `getOrder` y
`requestReturn` lanzando. Esa conclusión era correcta *para la pregunta que se hizo*: si el
puerto monolítico `CommerceService` podía representar a Shopify sin deformarse.

El propietario ha tomado una decisión de producto que cambia la pregunta. No se trata de si
el puerto aguanta a Shopify, sino de **operar dos negocios**: la tienda propia de Courvia
sobre Payload + Supabase + PSP, y storefronts servidos por Shopify headless. Ambos con el
mismo frontend, el mismo sistema de diseño y el mismo CMS editorial.

El error a evitar no es tener dos motores. Es **tener dos autoridades para la misma
transacción**. Un carrito que empieza en un motor y termina en otro, un pedido Shopify
copiado dentro de la máquina de estados nativa, un fallback automático cuando una pasarela
parpadea: cada uno de ellos produce dinero contabilizado dos veces o ninguna.

## Decisión

**Se completan los dos motores hasta un estado verificable y utilizable.**

1. **`native`** — ecommerce propio: Payload + Supabase + adaptadores de `PaymentProvider`.
2. **`shopify`** — integración headless completa: Storefront API, Cart API, checkout
   alojado, Admin API, Customer Account API y webhooks.

Y sobre ellos, una regla que no admite excepción:

> **El contenido es compartido. Cada carrito, pedido, pago y devolución pertenece para
> siempre a una única conexión.**

De ahí se derivan, como consecuencias y no como opciones:

- Un storefront puede tener varias `CommerceConnection` configuradas; **solo una está activa
  para carritos nuevos**. Cambiar la activa **no toca** carritos ni pedidos existentes.
- El owner (`siteKey`, `engine`, `connectionKey`, `bindingRevision`) se fija **al crear el
  carrito** y viaja con él hasta el final de su vida, incluidas devoluciones y reembolsos.
- **Nunca** hay dual-write. **Nunca** hay fallback automático entre motores. **Nunca** se
  hace A/B testing transaccional.
- **Shopify no implementa `PaymentProvider`.** Cuando Shopify está activo, Shopify controla
  checkout y pagos. `PaymentProvider` es exclusivo del motor nativo.
- Un pedido Shopify **no** entra en la máquina de estados nativa. Se guarda como proyección
  local **read-only** para soporte y reporting, y las acciones se envían a Shopify.
- Payload es la autoridad editorial en los dos motores: narrativa, imágenes, specs,
  evidencia, SEO y plantillas. Nunca guarda copia del precio, del stock ni del GID como
  fuente editable.
- Una indisponibilidad puede mostrar un CTA editorial —demo, waitlist o presupuesto— pero
  **no** cambia de backend en silencio.

## Qué de ADR-024 queda superado y qué sigue en pie

**Superado:** la conclusión de que Shopify se queda permanentemente en estudio y de que su
checkout no se hará. Esa parte respondía a una pregunta de portabilidad, no a una decisión
de negocio, y el propietario ha decidido lo contrario.

**Sigue en pie, y es lo más valioso de aquel ADR:** el hallazgo de que un puerto monolítico
deforma al proveedor que no encaja. Es exactamente el motivo por el que este ADR **no**
obliga a Shopify a fingir la forma del motor nativo, y por el que `CommerceService` se
divide en capacidades. ADR-024 no se borra: es historia, y su diagnóstico es la razón de
que este ADR tenga la forma que tiene.

## El principio rector sigue vigente, con una aclaración

CLAUDE.md §2 dice «construye la experiencia Courvia, no una nueva Shopify», y sigue
mandando. La aclaración es sobre qué significa en el motor nativo: **el nativo compra**
procesamiento de pagos, motor fiscal, facturación conforme al SIF y logística mediante
adaptadores. Lo que construye es el carrito, el flujo de pedido, la posventa y la
experiencia. No construye una pasarela ni un motor de impuestos.

## Fuentes de verdad

| Dato | Compartido | `native` | `shopify` |
|---|---|---|---|
| Identidad editorial estable | Payload (clave de producto) | — | — |
| Narrativa localizada, specs, evidencia, media, SEO, PDP | Payload | — | — |
| Variante y SKU comercial | — | Payload/Supabase | Shopify |
| Precio y compare-at | — | `prices` | Shopify Markets / price lists |
| Inventario | — | `inventory` | Shopify |
| Carrito | — | carrito nativo | Shopify Cart API |
| Checkout y pago | — | Courvia + PSP | checkout alojado de Shopify |
| Pedido, fulfillment, devolución, reembolso | — | colecciones nativas | Shopify |
| Vista operativa | CMS | pedido real local | proyección read-only |
| Claims y compliance | Payload | Payload | Payload |

Las secciones de una landing referencian una **clave editorial de producto**. Nunca guardan
una copia del precio, del stock ni de un GID de Shopify.

## Estados de entrega

Este ADR fija el vocabulario, porque «hecho» ha significado cosas distintas en este
repositorio y ya costó tres días de despliegues rojos con CI en verde:

| Estado | Significa |
|---|---|
| `not_started` | no existe |
| `code_complete` | implementado y con tests, **contra fixtures o mocks** |
| `sandbox_verified` | verificado contra el sistema real en modo prueba: Stripe test mode, development store de Shopify |
| `launch_blocked` | el código está, pero falta algo que no es código: fiscalidad, logística, legal, credenciales |
| `launch_ready` | verificado de punta a punta y con las obligaciones no técnicas cerradas |

Reglas duras del vocabulario:

- Un adaptador que solo pasa tests contra fixtures **nunca** es `sandbox_verified`.
- Shopify sin development store: como máximo `code_complete`.
- Nativo sin una compra y un reembolso reales en Stripe test mode: como máximo
  `code_complete`.
- Un mercado sin fiscalidad y logística aprobadas: `launch_blocked`, aunque el código esté.

## Cambio de motor

El binding activo **no se edita en sitio**: se crea una revisión nueva. El proceso es
obligatorio y está en `docs/plan-dual-commerce.md` §5, Fase 7. En resumen: congelar el
alcance del catálogo, importar con dry-run, comparar SKU/variantes/precios/mercados,
verificar enlaces editoriales, probar carrito y pedido en sandbox, marcar `verified`,
activar para carritos nuevos, dejar la anterior en `draining`, y retirarla solo cuando no
queden obligaciones abiertas.

**Después del primer pedido en el motor nuevo, «rollback» significa crear otra revisión
activa para tráfico nuevo.** Nunca mover pedidos entre motores.

## Consecuencias

**A favor.** Dos negocios servidos por un solo frontend y un solo CMS. Una marca nueva puede
arrancar en Shopify sin esperar a que el nativo esté completo, y el nativo puede llegar a su
primera venta sin bloquear a las demás. La separación por owner hace que un incidente en un
motor no pueda contaminar al otro.

**En contra, y hay que decirlo.** Dos motores son dos superficies que mantener, dos juegos
de webhooks, dos modelos de disponibilidad y dos formas de que un pedido salga mal. El coste
recurrente sube. La mitigación no es «tener cuidado»: son los diecisiete invariantes del
plan, cada uno con un test que se ha visto en rojo, y la prohibición de que las rutas y los
componentes importen adaptadores concretos —que verifica `pnpm arch`, no la confianza.

**Lo que este ADR no autoriza.** Multitenancy parcial. Un tercer motor. Copiar pedidos entre
motores. Que Shopify implemente `PaymentProvider`. Y no autoriza declarar nada
`sandbox_verified` sin el sistema real detrás.
