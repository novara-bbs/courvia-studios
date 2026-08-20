# ADR-027 · El envío es un documento, no un botón

- **Estado:** aceptado · **Fecha:** 2026-08-20 · **Nuevo**
- **Cierra** el punto 11 del núcleo mínimo de
  [`docs/gap-analysis.md`](../gap-analysis.md) («una salida de `paid`»).
- **Extiende** ADR-13 (puerto de pagos con eventos normalizados) y
  [ADR-021](./ADR-021-cms-commerce.md) (commerce en el CMS).

## Contexto

La máquina de estados ya conocía los tres disparadores de fulfilment
(`fulfilment.picking_started`, `.shipment_created`, `.delivered`) desde el
primer día. **Nada los emitía.** Un pedido que llegaba a `paid` se quedaba
ahí para siempre, y no había dónde escribir transportista, número de
seguimiento ni fecha de envío: la tabla `shipments` que
[`docs/data-model.md`](../data-model.md) §11 daba por existente no existía.

La tentación evidente era un botón «marcar como enviado» en el admin y un
campo `status` que alguien edita. Los dos estaban descartados por reglas que
ya existían:

- Un **botón** en el admin de Payload es un componente React propio, y
  `.claude/rules/design-system.md` prohíbe que una cadena visible viva en un
  componente. Un botón con texto rompe esa regla el día que se escribe.
- Un **`status` editable** es una puerta trasera alrededor de la máquina de
  estados, exactamente lo que CLAUDE.md §4 llama «transiciones por máquina de
  estados dentro de transacción». Un `select` que un humano puede mover
  convierte la garantía en una costumbre.

Y una tercera restricción, arquitectónica: la regla
`adapters-are-not-imported-by-routes` de `.dependency-cruiser.cjs` impide que
nada de `apps/web` importe `@courvia/commerce-payload` salvo el composition
root. La configuración de Payload vive en `apps/web/src/payload/`, así que el
aplicador de fulfilment no puede vivir en el adaptador de persistencia sin
romper esa frontera o crear un ciclo `payload.config → … → @payload-config`.

## Decisión

**1. La superficie de fulfilment es una colección, no una acción.**
Se añade `shipments`, y el documento *es* la transición:

| Acto del operador | Disparador | Estado del pedido |
|---|---|---|
| Crear el envío del pedido | `fulfilment.picking_started` | `paid → preparing` |
| Rellenar transportista + seguimiento | `fulfilment.shipment_created` | `preparing → shipped` |
| Fechar la entrega | `fulfilment.delivered` | `shipped → delivered` |

Un `beforeChange` deriva los disparadores de lo que cambió y los aplica
dentro de la transacción que Payload ya tiene abierta para el `create` o el
`update`. Si la máquina rechaza, el hook lanza y **se cae el guardado
entero**: nunca queda un envío registrado de un pedido que no podía enviarse.
Rellenarlo todo de una vez aplica los pasos en orden, así que una importación
de transportista que ya trae el número no tiene que fingir que prepara antes.

**2. `orders.status` pasa a solo lectura en el admin**, mediante
`withFulfilment(Orders)` en `payload.config.ts` — un decorador, para no tocar
`src/payload/commerce.ts` desde una tarea de envíos. El mismo decorador
cuelga del pedido un campo `join` con su envío.

**3. Los transportistas son datos, no código.** La colección `carriers`
guarda `code`, `name` y **`trackingUrlTemplate`** con un hueco `{tracking}`.
Añadir Aramex para Dubái o cambiar SEUR por GLS es crear una fila, no un
despliegue. El código posee solo el convenio (un placeholder, https
obligatorio) en `@courvia/commerce-domain/fulfilment`, y **la URL se
construye al leer**: corregir una plantilla mal escrita arregla también los
envíos que ya la usaron.

**4. Un envío por pedido.** `shipped` es un único estado; los envíos
parciales exigirían fulfilment por línea, que es otro modelo. El segundo
envío se rechaza al crearlo.

**5. `start_picking` deja de ser transaccional y pasa a outbox**, y se añade
su contrario `stop_picking`. Avisar al almacén es un mensaje al mundo, no una
fila nuestra — el mismo argumento que ya justificaba `restock_if_applicable`.
Con eso, **todos** los efectos de fulfilment son de outbox, y el aplicador no
necesita ejecutar nada dentro de la transacción.

**6. Cancelar después de pagar sigue siendo un reembolso, nunca
`cancelled`.** `cancelled` significa «nunca se pagó»: por eso el aplicador de
pagos trata un `paid` sobre un pedido cancelado como **conflicto**. Deshacer
un pedido pagado es `refund.requested` → aprobación humana → `refunded`, y
mientras esa decisión esté abierta el fulfilment queda congelado (desde
`refund_requested` ningún disparador de fulfilment es válido). Si la petición
llega con el pedido ya en `preparing`, la transición emite además
`stop_picking`.

## Justificación

- **El guardarraíl es estructural, no de política.** No hay ruta que mueva
  `status` fuera de `transition()`: el pago entra por el webhook, el envío
  por esta colección, y las dos pasan por la misma función pura dentro de una
  transacción. La colección no «recuerda» comprobar; si la máquina dice que
  no, Postgres deshace el documento.
- **La distinción de rechazos se mantiene y se extiende.** Un disparador de
  fulfilment repetido sobre un pedido que ya pasó ese punto es
  `already_applied` (un reintento, no un error, igual que un webhook
  repetido); sobre un estado que no corresponde es `invalid_for_status`.
  Sobre un pedido `cancelled`/`refunded` la máquina devuelve `terminal_status`
  y **el aplicador de fulfilment lo trata como fallo**, al revés que el
  aplicador de webhooks: una pasarela que reintenta merece un 200, una
  persona a punto de entregar un pedido cancelado merece un no.
- **Ningún efecto externo dentro de la transacción.** Un test de dominio
  exige que ninguna transición de fulfilment emita un efecto transaccional, y
  el aplicador lanza si alguna vez lo hiciera. El hook solo escribe filas de
  outbox `pending`.
- **La frontera de paquetes queda intacta.** El aplicador de fulfilment vive
  en `apps/web/src/payload/orders-fulfilment.ts` e importa únicamente
  `@courvia/commerce-domain` y `payload`. No duplica al aplicador de pagos:
  este no lleva ledger, ni conflictos, ni deltas de reembolso, ni stock —
  porque ninguna transición de fulfilment toca inventario.

## Consecuencias

- El despachador de outbox tiene dos efectos nuevos que atender
  (`start_picking`, `stop_picking`) y `send_tracking_email` pasa a llegar con
  `carrier`, `carrierName`, `trackingNumber`, `trackingUrl`, `shippedAt` e
  `incoterm` en su `payload`.
- `open_withdrawal_window` lleva `market` y `deliveredAt` y **no** un plazo:
  los 14 días son ley española y británica, no de Dubái. Quien escriba el
  email decide el plazo a partir del mercado.
- No hay todavía superficie para `refund.requested` ni para el RMA: el
  reembolso sigue siendo manual-asistido y `execute_provider_refund` sigue
  siendo el único efecto que ordena uno. `stop_picking` existe pero solo se
  emitirá cuando esa superficie llegue.
- **Un pedido en `refund_requested` no puede volver a `paid`.** Si soporte
  pide un reembolso y luego se arrepiente, el pedido queda congelado. Es
  anterior a esta decisión y sigue abierto: necesita su propia transición
  (`refund.rejected`) y su propia aprobación humana.
- Sin filas en `carriers` no se puede marcar nada como enviado. Sembrar los
  transportistas de cada mercado (`seed-markets`) queda pendiente; el primero
  se crea a mano en el admin, que es exactamente el punto.
- No hay envíos parciales ni webhook de transportista. Los dos son
  ampliaciones aditivas: el webhook entraría por el mismo aplicador con su
  propia verificación de firma.
