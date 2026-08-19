# ADR-018 · Catálogo en colecciones Payload propias, no en el plugin oficial

- **Estado:** aceptado · **Fecha:** 2026-08-19 · **Nuevo**

## Contexto

Payload publicó `@payloadcms/plugin-ecommerce`, que trae productos, variantes, carritos, pedidos, transacciones, direcciones y un adaptador de Stripe. Ahorraría semanas.

Pero: está **en beta** con roturas anunciadas; **no cubre impuestos ni envíos**, que es justo lo difícil de nuestros tres mercados (Stripe Tax en ES/UK, DDP, 5 %+5 % CIF en EAU); tiene fallos abiertos de multi-moneda; y su modelo de datos nos ataría justo donde tenemos requisitos propios (`sport` como atributo de variante, precios fijos por mercado).

## Decisión

Colecciones propias (`products`, `variants`, `prices`, `inventory`, `categories`, `promotions`) detrás de `CommerceService`. Editables desde el admin sin tocar código, que es el objetivo.

**Puerta de reevaluación**, al estilo del gate de Medusa (§18). Se reabre si se cumplen 2 de: (1) el plugin sale de beta con impuestos y envíos; (2) más del 30 % de los sprints se van en commerce genérico; (3) su modelo de variantes y precios cubre `sport` y precios fijos por mercado sin forzarlo; (4) aparece una necesidad de carrito persistente multi-dispositivo que no queramos construir.

## Consecuencias

- Más código propio, cero lock-in, cero sorpresas de beta.
- Como el frontend solo habla con `CommerceService`, adoptar el plugin más adelante sería escribir un adaptador, no reescribir la tienda.
