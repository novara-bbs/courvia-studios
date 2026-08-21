# TCO · operar dos motores de comercio

> **Cierra la Fase 0** de [`docs/plan-dual-commerce.md`](plan-dual-commerce.md). Informa la
> operación de la decisión ya tomada en [ADR-029](adr/ADR-029-dual-commerce-engines.md); **no
> la revisa**. Ninguna línea de este documento recomienda apagar un motor.
>
> **Fecha de consulta de todas las cifras: 21 ago 2026.** Los precios de Shopify, Stripe,
> Vercel y Supabase cambian sin aviso y sin changelog. **Cualquier cifra de aquí con más de
> un trimestre se vuelve a comprobar antes de usarse para decidir.** El §9 dice cómo.
>
> **Ninguna cifra sin fuente.** Lo que no se pudo verificar contra la fuente oficial se
> marca `no publicado` o `no verificado` y se explica qué haría falta para saberlo. El §8
> reúne todo lo que quedó sin cerrar; es la parte más importante del documento.

---

## 0 · Advertencia de método, y no es menor

En esta sesión **la descarga directa de páginas está bloqueada por el proxy de salida**:
`shopify.com`, `help.shopify.com`, `shopify.dev`, `stripe.com`, `docs.stripe.com`,
`vercel.com` y `supabase.com` devuelven todos `EGRESS_BLOCKED`, igual que cualquier otro
dominio. La única herramienta de red que funciona es la búsqueda.

Consecuencia: **las cifras de abajo proceden de la extracción que el buscador hace de esas
páginas oficiales, con el dominio restringido a la fuente oficial en cada consulta, no de
haber leído la página.** No se ha citado ningún blog ni comparador. Pero una extracción no
es una lectura, y hay dos sitios donde eso se nota y está anotado:

- las tarifas de Shopify **en euros para España** no se pudieron confirmar (§1.1);
- el porcentaje por transacción de **Stripe Tax** no aparece en ningún extracto (§4.1).

Cuando alguien pueda abrir las páginas, este documento se re-verifica entero. Hasta
entonces, trátese cada número como «lo que la fuente oficial dice, según su buscador».

---

## 1 · Motor Shopify

### 1.1 El plan

Precios de suscripción publicados (facturación mensual, USD):

| Plan | Cuota | Comisión adicional si **no** se usa Shopify Payments |
|---|---|---|
| Basic | **39 $/mes** (29 $/mes con facturación anual) | **2 %** |
| Grow | **105 $/mes** | **1 %** |
| Advanced | **399 $/mes** | **0,6 %** |
| Plus | **desde 2.300 $/mes** a 3 años · **2.500 $/mes** a 1 año | **0,20 %** |

Fuentes: `shopify.com/pricing` y `help.shopify.com/.../plans-features` (cuotas y comisión
adicional), `shopify.com/plus/pricing` (Plus), consultadas el 21 ago 2026. Plus además puede
pasar a una **tarifa variable sobre facturación** que solo da su equipo comercial: `no
publicado`.

**Qué plan hace falta para lo que ADR-029 describe: el Basic basta.**

El acceso a la Storefront API y a la Customer Account API se obtiene instalando el canal
**Headless** desde la App Store, y ese canal **está incluido en el plan, sin coste**
(`apps.shopify.com/headless`, `shopify.dev/docs/storefronts/headless/...`, 21 ago 2026). No
hay un «plan headless» ni un mínimo de plan para las dos APIs. La Storefront API además **no
tiene límite fijo de peticiones por minuto** para tráfico de compradores reales
(`shopify.dev/docs/api/usage/limits`, 21 ago 2026).

Los motivos para subir de plan **no son técnicos, son de comisión**, y son tres:

1. Si el cobro va por una pasarela de terceros —Tabby y Tamara en EAU lo son— el recargo
   pasa de 2 % (Basic) a 1 % (Grow) o 0,6 % (Advanced). Sobre un robot, 1,4 puntos son
   mucho dinero.
2. **Shopify Payments en EAU exige plan Plus** y está en acceso anticipado, limitado a
   ciertos comerciantes y solo para venta online
   (`help.shopify.com/.../supported-countries/united-arab-emirates`, 21 ago 2026).
3. Las tarifas de tarjeta bajan de 2,1 % a 1,8 % y a 1,6 % (§1.2).

**Y una corrección al encargo, que pedía comprobar ES, UK y EAU.** La disponibilidad de
Shopify Payments se decide por **el país del comerciante**, no por el del comprador. La
entidad es española ([`docs/markets.md`](markets.md)), así que la única casilla que manda es
**España, y sí está soportada** (`help.shopify.com/.../supported-countries/spain`). Reino
Unido y EAU importan como países de **compra**, no de cuenta. El dato de EAU-solo-Plus solo
sería un bloqueo si algún día se abriera una entidad allí — que es justo lo que ADR-08
difirió.

**Las cuotas en euros para España: `no verificado`.** Shopify factura la suscripción en la
moneda local del comerciante y sirve la página de precios por país. Los extractos que
devolvió el buscador para la página española se contradicen entre sí (una dice 24 €/mes con
facturación anual, otra 29 €/mes y 22 €/mes anual) y ninguna es la página de precios
española servida en directo. **Este documento modela con las cifras en USD** y lo declara en
§7.0. Para cerrarlo basta con abrir `shopify.com/es/precios` desde un navegador en España.

### 1.2 Procesamiento de pagos con Shopify Payments

Tarifas online para una tienda con Shopify Payments en **España** (EUR):

| Plan | Tarjeta online | En persona |
|---|---|---|
| Basic | **2,1 % + 0,30 €** | 1,7 % |
| Grow | **1,8 % + 0,30 €** | 1,5 % |
| Advanced | **1,6 % + 0,30 €** | 1,4 % |

Fuente: página de precios de Shopify para España vía extracto del buscador, 21 ago 2026.

Encima de eso, y esto es lo que cambia el cálculo de un negocio con tres mercados:

- **Tarjetas EEA = tarjetas domésticas.** Una tarjeta emitida en otro país del EEE **no**
  paga recargo transfronterizo (`help.shopify.com/.../domestic-international-eu-credit-cards`,
  21 ago 2026).
- **Tarjeta de fuera del EEE (incluidas las británicas tras el Brexit): tarifa
  «Rest of World», y su porcentaje `no está publicado`** en la documentación general; solo
  se ve en el panel de la propia tienda, bajo *Standard rates*. Para UK y EAU —los dos
  mercados donde Courvia quiere vender— **la tarifa de Shopify no se puede conocer sin
  tener la tienda abierta**. Es el hueco más grande de este documento.
- **Conversión de divisa: 1,5 % o 2 %, según el país de la tienda**
  (`help.shopify.com/.../currency-conversion-calculation`, 21 ago 2026). **Cuál de los dos
  aplica a España: `no verificado`.** Se paga en cuanto se cobra en GBP o AED y se liquida
  en EUR, que es exactamente el diseño de ADR-05.
- **Aranceles e impuestos de importación en el checkout: 0,5 % por pedido.** Desde el 2 feb
  2025 está disponible **en todos los planes**, ya no solo en Advanced y Plus
  (`changelog.shopify.com/.../shopify-duty-calculator-now-available-for-all-shopify-plans` y
  `help.shopify.com/.../duties-and-import-taxes/charging-duties`, 21 ago 2026). Como UK y
  EAU se sirven **DDP** (ADR-08), este 0,5 % aplica a todos sus pedidos.
- **La comisión adicional por pasarela de terceros se cobra aunque Shopify Payments esté
  activo.** Solo PayPal y los métodos manuales (efectivo, contra reembolso, transferencia)
  quedan excluidos
  (`help.shopify.com/.../third-party-transaction-fees`, 21 ago 2026). **Tabby y Tamara no
  son ninguna de esas excepciones**: en Shopify pagarían su propia comisión **más** el 2 %
  (Basic), 1 % (Grow) o 0,6 % (Advanced).
- **Bizum: no aparece documentado como método local de Shopify Payments en España.** Los
  métodos locales que la ayuda enumera para España son otros. Dado que
  [`docs/markets.md`](markets.md) lo pone como *must-have* del mercado español, esto es una
  **carencia funcional de Shopify en ES**, no una diferencia de precio, y hay que
  verificarla con la tienda delante antes de dar por buena ninguna ruta de checkout española
  por Shopify.

### 1.3 Aplicaciones que la arquitectura necesitaría

Muy pocas, y ese es justamente el ahorro que compra ADR-029: el CMS, el tema, las secciones
y el frontend siguen siendo nuestros, así que **no hace falta ningún app de page builder, de
traducciones, de reseñas ni de SEO**.

| Necesidad | App | Coste |
|---|---|---|
| Tokens de Storefront API y Customer Account API | **Headless** (canal oficial) | **0 €** — incluido en el plan |
| Admin API (catálogo, pedidos, webhooks) | app personalizada creada en el propio panel | **0 €** |
| Aranceles/DDP en checkout | nativo de Shopify | 0,5 %/pedido (§1.2) |
| Multi-divisa EUR/GBP/AED | nativo, exige Shopify Payments o Adyen | conversión 1,5 % o 2 % |
| **Facturación VeriFactu de las ventas españolas** | **ninguna nativa** | **`no publicado`** — ver §4.2 |
| Tabby / Tamara en EAU | pasarelas de terceros | su comisión **+** el recargo de plan |

El entorno de pruebas **no cuesta**: un partner puede crear **development stores ilimitadas
y gratuitas**, y probar el checkout con el **Bogus Gateway**
(`help.shopify.com/en/partners/...`, `shopify.dev/docs/apps/build/dev-dashboard/stores/development-stores`,
21 ago 2026). Con un matiz que afecta a la Fase 6: **para probar Shopify Payments en modo
test hace falta un plan de pago**. Es decir, `sandbox_verified` de Shopify según ADR-029 se
alcanza gratis para catálogo y carrito, pero **el checkout con pagos reales en test exige
pagar ya la cuota mensual**.

---

## 2 · Motor nativo

### 2.1 Vercel

| Plan | Coste | Cron |
|---|---|---|
| Hobby | 0 $ | **1 vez al día como máximo**; una expresión más fina **falla el despliegue** |
| Pro | **20 $/mes** el primer asiento, con **20 $ de crédito de uso incluidos**; asientos adicionales de desarrollador 20 $/mes, los de solo lectura gratis | **sin límite de frecuencia** |

Fuentes: `vercel.com/pricing`, `vercel.com/docs/plans/pro-plan`, `vercel.com/docs/pricing`,
`vercel.com/docs/cron-jobs/usage-and-pricing`, 21 ago 2026. Pro incluye además **1 TB de
Fast Data Transfer y 10.000.000 de Edge Requests** al mes.

Un matiz que los extractos dejan ambiguo y conviene no tapar: la documentación describe por
un lado una **cuota de plataforma fija que incluye 20 $ de crédito de uso** y por otro
**asientos de desarrollador a 20 $/mes**, con el primero incluido. Si son el mismo importe o
se suman, **no queda claro**. El modelo de §7 usa **20 $/mes**; si resultaran ser 40 $,
sube el fijo compartido de 55 $ a 75 $ y **no cambia ninguna conclusión**, porque todas las
comparaciones entre motores se apoyan en costes que Vercel no toca.

El tope de **número** de crons ya no es el problema: desde el cambio que anunció
`vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan` son **100 por
proyecto en todos los planes** (antes 20 por proyecto, con topes de equipo de 2 en Hobby y
40 en Pro). Lo que **sigue** en pie es la frecuencia: *«Hobby accounts are limited to daily
cron jobs»*, y `0 * * * *` o `*/30 * * * *` **fallan al desplegar**. Coincide exactamente con
lo que ya documenta [`docs/deployment.md`](deployment.md) y sujeta el test
`keeps a cadence the current plan accepts`.

**Y hay una razón mucho más dura que el cron para no seguir en Hobby.** Las
*Fair Use Guidelines* de Vercel dicen que **los equipos Hobby están restringidos a uso
personal no comercial**, que **todo uso comercial requiere Pro o Enterprise**, y definen uso
comercial como *«cualquier despliegue usado con fines de lucro… incluyendo cualquier método
de solicitar o procesar pagos de los visitantes del sitio»*
(`vercel.com/docs/limits/fair-use-guidelines`, `vercel.com/legal/terms`, 21 ago 2026).

Una tienda que cobra **no puede estar en Hobby**. El cron diario no es la razón para pasar a
Pro; es solo el síntoma que se ve. **La razón es que el plan actual no permite cobrar.**
Eso convierte los 20 $/mes en un coste no opcional del motor nativo, y hace que el peor caso
de 24 h del outbox y de ~25 h de la reserva de stock deje de ser un tradeoff y pase a ser
una consecuencia de una configuración que además incumple los términos.

**Otras opciones para una cola durable**, además de subir a Pro y afinar el cron:

| Opción | Precio publicado | Nota |
|---|---|---|
| **Vercel Queues** | **1 M de operaciones/mes incluidas**, después **desde 0,60 $ por 1 M** | Beta pública para todos los equipos desde feb 2026. Se factura por operación de API; los mensajes se miden en trozos de 4 KiB. `vercel.com/docs/queues/pricing`, 21 ago 2026 |
| **Supabase Cron (`pg_cron`)** | **0 €** — extensión de la base que ya se paga | Programa hasta **cada 1-59 segundos** y sabe llamar Edge Functions y **webhooks HTTP**. `supabase.com/docs/guides/cron`, 21 ago 2026 |
| **Supabase Queues (`pgmq`)** | **0 €** — misma base | Cola durable nativa de Postgres con entrega garantizada. `supabase.com/docs/guides/queues`, 21 ago 2026 |
| Upstash QStash | plan gratuito de **1.000 mensajes/día**; de pago **1 $ por 100 K mensajes**; planes fijos **desde 180 $/mes** | `upstash.com/pricing/qstash`, 21 ago 2026. Fuente oficial del proveedor, pero **fuera de la lista de dominios del encargo** |

La combinación **`pg_cron` + `pgmq`** merece atención antes que ninguna otra: el outbox ya
vive en la base que ya se paga, la cadencia deja de depender del plan de Vercel, y no
aparece una quinta factura. No la elige este documento —tocar el outbox toca pagos, y eso
exige aprobación humana explícita— pero es la opción que hoy cuesta cero.

### 2.2 Supabase

| Plan | Coste |
|---|---|
| Free | 0 $ · **2 proyectos activos** por organización · **500 MB** de base · **el proyecto se pausa tras 1 semana de inactividad** |
| Pro | **desde 25 $/mes por organización**, con **10 $/mes de créditos de compute** incluidos (cubren un `Micro`) · tope de gasto activado por defecto |
| Team | **599 $/mes** |

Fuentes: `supabase.com/pricing`, `supabase.com/docs/guides/platform/manage-your-usage/compute`,
`supabase.com/docs/guides/platform/free-project-pausing`, 21 ago 2026.

**Lo que hace falta para tener staging además de producción**, que es exactamente el
bloqueador de Preview diagnosticado en la Fase 0:

- **Segundo proyecto dentro de la organización Pro: +10 $/mes como mínimo.** «Cada proyecto
  adicional añade al menos 10 $ de compute a la factura»
  (`supabase.com/docs/guides/platform/manage-your-usage/compute`).
- **Segundo proyecto en una organización Free aparte: 0 $** — pero **se pausa tras una
  semana sin actividad**. Para una base que solo despierta cuando alguien abre un preview,
  ese es precisamente el modo de fallo que no se quiere: el despliegue vuelve a salir rojo y
  el motivo esta vez es invisible.
- **Branching de Supabase: 0,01344 $ por rama y hora** (`Micro` por defecto)
  (`supabase.com/docs/guides/platform/manage-your-usage/branching`, 21 ago 2026). Son
  **~9,80 $/mes por una rama encendida el mes entero**, o céntimos si solo vive lo que dura
  un PR. Es más elegante que un segundo proyecto y, si las ramas son efímeras, **más
  barato**. La Fase 0 lo descartó por caro; con el precio delante, esa afirmación solo se
  sostiene si las ramas quedan encendidas.

**Recomendación de coste, no de arquitectura: 10 $/mes** por un segundo proyecto `Micro`
estable para Preview y CI. Es la opción que no se pausa y no depende de la duración de un PR.

Un aviso que este documento **no puede resolver**: la Fase 0 registró que el proyecto de
producción documentado (`xurdwzbefgxpfzgkbbkf`) **no aparece en la cuenta de Supabase a la
que llega el MCP**. Mientras eso no se aclare, cualquier presupuesto de Supabase es de una
base que nadie ha podido verificar que exista.

---

## 3 · Procesamiento de pagos, motor nativo (Stripe)

Cuenta **Stripe España**, tarifas estándar publicadas (`stripe.com/en-es/pricing`, 21 ago
2026):

| Caso | Tarifa |
|---|---|
| Tarjeta del **EEE** | **1,5 % + 0,25 €** |
| Tarjeta del **Reino Unido** | **2,5 % + 0,25 €** |
| Tarjeta **internacional** (fuera del EEE y de UK) | **3,25 % + 0,25 €** |
| **Conversión de divisa** | **+2 %** cuando hace falta convertir |
| **Bizum** | **4,99 % + 0,40 €** (`stripe.com/pricing/local-payment-methods`, 21 ago 2026) |
| Comisión por disputa (España) | **`no publicado`** en los extractos; la ayuda solo confirma que en SEPA **no hay comisión** por disputas sobre la red **Cartes Bancaires** |

Tres consecuencias que importan más que las cifras:

1. **Bizum es, con diferencia, el método más caro del catálogo español.** 4,99 % sobre un
   robot es más del triple que una tarjeta EEA. `docs/markets.md` lo pone como *must-have*
   de ES y esa sigue siendo una decisión de conversión legítima — pero **es una decisión de
   conversión, no de coste**, y conviene tomarla sabiéndolo. Ofrecerlo en Gear de ticket
   bajo tampoco lo arregla: ahí el `+0,40 €` fijo pesa todavía más.
2. **El mercado de EAU se lleva el peor caso completo del nativo**: tarjeta internacional
   **más** conversión = **5,25 % + 0,25 €**. Es el número que hay que tener delante cuando se
   evalúe si Tabby y Tamara compensan.
3. **Stripe fija la versión de la API de la cuenta en la primera petición y las
   actualizaciones son opcionales** (`docs.stripe.com/upgrades`, `docs.stripe.com/api/versioning`,
   21 ago 2026). Eso no es un coste hoy; es el motivo por el que el mantenimiento del motor
   nativo **no tiene cadencia impuesta desde fuera** y el de Shopify sí (§6).

---

## 4 · Fiscalidad y facturación

### 4.1 Stripe Tax

Lo que la fuente oficial confirma (`stripe.com/tax/pricing`,
`support.stripe.com/questions/understanding-stripe-tax-pricing`, 21 ago 2026):

- Se cobra **por transacción** en las jurisdicciones donde se está registrado.
- Cada transacción incluye **10 llamadas de cálculo**; a partir de la undécima, **5 ¢ por
  llamada**.
- Hay **dos planes**: uno de cálculo y cobro, y **Tax Complete** —registros, cálculo, cobro y
  presentaciones— que se factura como **suscripción mensual por tramos**.
- Hay **precio a medida** para volúmenes grandes, **transacciones de valor alto** o modelos
  de negocio poco habituales.

**El porcentaje por transacción: `no verificado`.** No aparece en ningún extracto de la
página oficial y la página no se puede descargar (§0). Es una omisión relevante porque
Stripe Tax es un coste **porcentual sobre GMV**, o sea exactamente la clase de coste que
domina en un negocio de ticket alto. **Qué haría falta para saberlo:** abrir
`stripe.com/tax/pricing` desde un navegador con país España, y —dado que la propia página
menciona precio a medida para «transacciones de valor alto»— pedir presupuesto a Stripe con
el ticket real delante. Hasta entonces, en §7 se modela **sin** Stripe Tax y se da la
sensibilidad: **cada 0,1 puntos de Stripe Tax añaden 0,1 % del GMV al coste del motor
nativo**, y a partir de **0,6 puntos** el nativo perdería su ventaja porcentual frente a
Shopify Basic en España.

### 4.2 VeriFactu (ADR-07)

Aquí hay que corregir una expresión que se repite en la documentación del repositorio.

**No existen «proveedores homologados» de VeriFactu.** La AEAT **no homologa ni certifica**
software. El régimen es de **declaración responsable**: el productor del sistema declara por
escrito —y de forma visible en el sistema y en cada versión— que cumple el Reglamento, y la
AEAT publica **ejemplos** de esa declaración para que sirvan de modelo. No hay lista
oficial de proveedores aprobados
(`sede.agenciatributaria.gob.es/.../certificacion-sistemas-informaticos-declaracion-responsable.html`,
21 ago 2026). Lo que hay que buscar es un proveedor que **emita su declaración responsable**,
no uno que aparezca en una lista que no existe.

**El calendario, verificado y más apretado de lo que suena:**

| Obligado | Fecha límite |
|---|---|
| Contribuyentes del **Impuesto sobre Sociedades** — es el caso de **Courvia Sports** | **1 de enero de 2027** |
| El resto | **1 de julio de 2027** |

Fuente: **Real Decreto-ley 15/2025, de 2 de diciembre** (BOE-A-2025-24446, BOE núm. 290 de
3 dic 2025), que modificó la disposición final del RD 1007/2023, y la nota informativa de la
AEAT sobre la ampliación del plazo, consultadas el 21 ago 2026. Las fechas anteriores eran
1 ene 2026 y 1 jul 2026. Hoy, 21 ago 2026, **quedan poco más de cuatro meses**.

**Precios: `no publicado`.** No hay fuente oficial de precios porque no hay lista oficial de
proveedores. Sí existe un dato oficial que acota el suelo: **la AEAT pondrá a disposición
una aplicación gratuita de facturación** en modo VERI\*FACTU, *«especialmente diseñada para
contribuyentes que emitan un número reducido de facturas»*
(`sede.agenciatributaria.gob.es/.../5_12-veri-factu.html`, 21 ago 2026). Para un negocio de
ticket alto y volumen bajo eso podría ser suficiente **como emisor**, pero **no resuelve la
integración**: ADR-07 pide un proveedor **con API** que consuma pedidos, y una aplicación de
la Sede no la tiene. **Qué haría falta para saber el coste:** pedir presupuesto a dos o tres
proveedores con API con el volumen real de facturas y con el requisito de declaración
responsable por escrito.

**Y hay un agujero específico del motor Shopify.** Shopify no emite registros de
facturación VERI\*FACTU. Un pedido español cobrado por el checkout de Shopify sigue
necesitando un SIF que emita su factura, alimentado por la Admin API o por webhooks. **Ese
coste no está en ninguna tabla de este documento**, aplica igual a los dos motores, y su
precio es `no publicado` en ambos.

---

## 5 · Lo que los dos motores comparten

Es la mitad menos vistosa del análisis y la que más cambia las conclusiones.

**Shopify no sustituye a nada de la pila actual.** ADR-029 fija que el frontend sigue siendo
el Next.js propio y que Payload sigue siendo la autoridad editorial en los dos motores. Por
tanto Vercel y Supabase se pagan **igual** con Shopify activo. La cuota de Shopify es
**aditiva, no sustitutiva**.

| Concepto | Coste fijo mensual | ¿Depende del motor? |
|---|---|---|
| Vercel Pro (1 asiento) | **20 $** | no |
| Supabase Pro (organización) | **25 $** | no |
| Supabase, segundo proyecto para Preview/CI | **10 $** | no |
| **Base compartida** | **55 $/mes** | — |
| Plan de Shopify (Basic) | **+39 $** | **sí** |

Fuera de tabla, y sin cuantificar aquí porque no hay proveedor elegido: **el bucket S3 de
medios**, que [`docs/deployment.md`](deployment.md) marca como obligatorio en producción
(sin `S3_BUCKET` las subidas quedan desactivadas), y el **correo transaccional**
(Resend/Brevo). Los dos son compartidos y los dos son pequeños frente a lo anterior, pero
son reales.

---

## 6 · Horas de mantenimiento

Lo que sigue es una **estimación razonada, no una medición**, y va con sus supuestos
delante. La matriz de huecos no contiene horas; inventarlas sería peor que no darlas.

### 6.1 Lo que la matriz sí dice

[`docs/matriz-huecos.md`](matriz-huecos.md), 101 piezas sobre `5637676`, agrupadas por su
lente:

| Lente | Piezas | A quién pertenece |
|---|---|---|
| `cms-catalogo` | **39** | compartido: se mantiene una vez, haya uno o dos motores |
| `nativo-dominio` | 34 | nativo |
| `pagos` | 8 | nativo |
| `shopify` | 20 | Shopify |

Y **los 6 `launch_blocked` son los seis del motor nativo**: `createCheckout`, la reserva de
inventario, `adjustStock`, `lockOrderRow`, el outbox con 1 handler de 15, y la cadencia del
cron. Ninguno es de Shopify.

De ahí salen dos lecturas, y conviene no confundirlas:

- **Superficie.** Un mundo de un solo motor mantendría 81 piezas; dos motores mantienen 101.
  **+25 % de superficie**, no +100 %. El CMS compartido es lo que evita que se duplique.
- **Riesgo.** El reparto del riesgo es el contrario: **todo lo `launch_blocked` está en el
  lado nativo**, y son piezas de dinero (concurrencia en pagos, reserva de stock,
  reescritura de un `paid`). Veinte piezas de integración externa no equivalen a seis piezas
  de máquina de estados transaccional.

### 6.2 Supuestos, uno a uno

Para el **delta recurrente de tener Shopify como segundo motor**, ya en `launch_ready`:

| # | Supuesto | Base | h/mes |
|---|---|---|---|
| 1 | Migración de versión de API | Shopify publica versión **cada trimestre** y sostiene cada estable **12 meses mínimo**, con **9 meses de solape** (`shopify.dev/docs/api/usage/versioning`, 21 ago 2026). Se supone que **se adopta una de cada dos**: 2 migraciones/año, 8-16 h cada una → 16-32 h/año | **1,3-2,7** |
| 2 | Webhooks y reconciliación de Shopify | 1 incidencia/mes, 1-2 h. **Supuesto débil**: no hay historial, la pieza aún no existe | **1-2** |
| 3 | Los invariantes que solo existen por haber dos motores | **14 de los 17** del plan dejarían de tener sentido con un motor y una conexión. Los tres que sobrevivirían son el **13** (ningún importe del cliente es autoritativo), el **14** (ningún webhook sin auth, dedupe y validación) y el **15** (ningún secreto en bundle, Payload, logs ni fixtures). Los otros 14, más la frontera de `pnpm arch`, son coste del ADR-029 | **1-2** |
| 4 | Doble juego de fixtures y E2E | El coste de CI en minutos es despreciable; el coste está en rehacer fixtures cuando cambia el catálogo | **1-2** |
| | **Delta recurrente estimado** | | **4-9 h/mes** (50-110 h/año) |

Tres cosas que este número **no** incluye, y hay que decirlo:

- **No incluye construir.** Los 6 `launch_blocked`, las 28 piezas que no existen y las 11 a
  refactorizar son coste de proyecto. La matriz no da base para estimarlos en horas.
- **No incluye soporte de pedidos**, que escala con el número de pedidos y no con el número
  de motores.
- **No incluye la tarifa.** Convertir horas en euros exige una tarifa que no es mía. A modo
  de conversión, y **solo** como conversión: a 60 €/h son **240-540 €/mes**; a 90 €/h,
  **360-810 €/mes**.

### 6.3 El delta al revés, y por qué no lleva número

Si la pregunta fuera *«¿cuánto cuesta mantener el nativo como segundo motor?»*, la respuesta
honesta es **más, y no se puede cuantificar con lo que hay**. El nativo posee la máquina de
estados, el outbox, la conciliación de pagos y el RLS; tiene 42 piezas frente a 20; y
concentra los 6 `launch_blocked`. La proporción 42:20 y el reparto del riesgo dicen la
dirección con claridad. Poner un multiplicador encima sería inventar precisión.

---

## 7 · El punto de cruce

### 7.0 Supuestos del modelo, declarados

1. **`N`** = pedidos/mes. **`T`** = importe cobrado por pedido, **IVA incluido** (las
   pasarelas cobran sobre el importe cobrado, no sobre la base imponible). **`G = N × T`**.
2. **El ticket no está fijado.** ADR-022 retiró el corredor de PVP y aquí no se escribe
   ninguna cifra como si fuera el precio de Courvia. Los valores de `T` de abajo son
   **entradas del modelo elegidas para barrer el espacio**, no una estimación de precio.
3. **Los planes se facturan en USD; el modelo los trata como euros al cambio 1:1.** No
   puedo verificar hoy un tipo de cambio, y el error que introduce (±15 % sobre 94 $ son
   ±14 €/mes) es menor que la incertidumbre de cualquier otra línea. Los porcentajes, que son
   lo que manda, no se ven afectados.
4. **Shopify se modela en Basic** (39 $/mes, 2,1 % + 0,30 €) porque es el plan que la
   arquitectura headless necesita (§1.1).
5. **Se modela sin Stripe Tax y sin VeriFactu**, porque sus precios no están verificados.
   Las dos sensibilidades están al final del §7.
6. **Para UK y EAU en Shopify se usa la tarifa española como suelo**, sabiendo que la real
   («Rest of World») es **mayor** y `no está publicada`. Todos los números de Shopify en
   esos dos mercados son, por tanto, **mínimos**.

Coste mensual de un motor = `F + r·G + f·N`, donde `F` es la cuota mensual, `r` el
porcentaje y `f` la parte fija por pedido.

### 7.1 Tres escenarios

| | **S1 · arranque** | **S2 · tracción, tres mercados** | **S3 · Gear, ticket bajo** |
|---|---|---|---|
| **Supuesto** | 2 pedidos/mes, `T` = 3.000 €, 100 % ES, tarjeta EEA | 15 pedidos/mes, `T` = 2.500 €: 10 ES (EUR), 3 UK (GBP), 2 EAU (AED) | 350 pedidos/mes, `T` = 110 €, 100 % ES |
| **GMV/mes** | 6.000 € | 37.500 € | 38.500 € |
| **Nativo · fijo** | 55 € | 55 € | 55 € |
| **Nativo · variable** | 90,50 € | 978,75 € | 665 € |
| **Nativo · total** | **145,50 €** | **1.033,75 €** | **720 €** |
| **Nativo · % del GMV** | **2,43 %** | **2,76 %** | **1,87 %** |
| **Shopify · fijo** | 94 € | 94 € | 94 € |
| **Shopify · variable** | 126,60 € | **≥ 1.042 €** | 913,50 € |
| **Shopify · total** | **220,60 €** | **≥ 1.136 €** | **1.007,50 €** |
| **Shopify · % del GMV** | **3,68 %** | **≥ 3,03 %** | **2,62 %** |
| **Diferencia** | **75 €/mes** | **≥ 102 €/mes** | **287,50 €/mes** |
| **De ella, la cuota de Shopify** | **39 € — el 52 %** | 39 € — el 38 % o menos | 39 € — **el 14 %** |

Desglose de S2 para que se pueda auditar. **Nativo:** ES `1,5 %·25.000 + 0,25·10 = 377,50` ·
UK `(2,5 % + 2 % conversión)·7.500 + 0,25·3 = 338,25` · EAU
`(3,25 % + 2 %)·5.000 + 0,25·2 = 263`. **Shopify (suelo):** ES `2,1 %·25.000 + 0,30·10 = 528`
· UK y EAU `(2,1 % + 1,5 % conversión + 0,5 % aranceles) = 4,1 %` sobre 7.500 y 5.000
`= 308,40 + 205,60`. Si en EAU se cobra por Tabby o Tamara, hay que sumar **su comisión más
un 2 % de recargo de plan**, y ninguna de las dos cosas está en la tabla.

### 7.2 Qué dice el punto de cruce

**En España, con euros y tarjeta del EEE, Shopify no sale más barato que el nativo en
ninguna combinación de pedidos y ticket.** No es una impresión, sale de resolver la
desigualdad. Shopify es más barato cuando

```
39 + (r_shopify − r_nativo)·G + (f_shopify − f_nativo)·N  <  0
```

y con las tarifas publicadas los tres términos son positivos a la vez:

| Plan de Shopify | Cuota | Δ porcentual vs Stripe EEA | Δ por pedido | ¿Cruza? |
|---|---|---|---|---|
| Basic | +39 $ | +0,6 pp | +0,05 € | **nunca** |
| Grow | +105 $ | +0,3 pp | +0,05 € | **nunca** |
| Advanced | +399 $ | +0,1 pp | +0,05 € | **nunca** |

**Dónde sí hay puntos de cruce reales:**

1. **Entre planes de Shopify**, si el motor Shopify es el que sirve un storefront:
   - **Basic → Grow** cuando `0,3 % · G > 66 $` → **GMV ≈ 22.000 $/mes**.
   - **Grow → Advanced** cuando `0,2 % · G > 294 $` → **GMV ≈ 147.000 $/mes**.
   - Con facturación anual los dos umbrales bajan. Y si hay pasarela de terceros (EAU), la
     diferencia entre planes deja de ser 0,3 pp y pasa a ser **1,3 pp** (0,3 de tarjeta más
     1 de recargo), lo que adelanta el primer umbral a **≈ 5.100 $/mes de GMV**. En EAU, el
     plan Basic se queda corto muy pronto.

2. **El umbral que decide si el ahorro porcentual del nativo paga sus propias horas.** Si el
   nativo ahorra ~0,6 pp frente a Shopify Basic y su mantenimiento adicional cuesta `H`
   €/mes, el ahorro cubre las horas cuando

   ```
   G  >  (H − 39) / 0,006
   ```

   - `H` = 300 €/mes → **GMV > ≈ 43.500 €/mes**
   - `H` = 550 €/mes → **GMV > ≈ 85.000 €/mes**
   - `H` = 800 €/mes → **GMV > ≈ 127.000 €/mes**

   Ninguno de los tres escenarios de §7.1 llega. **Traducido: en el rango de volumen que hoy
   es plausible, el motor nativo no se justifica por la comisión que ahorra.** Se justifica
   por lo que ADR-029 dice que se construye —el carrito, el flujo de pedido, la posventa y
   la experiencia— y por no depender de una plataforma para el negocio propio. El ahorro de
   comisiones es un efecto secundario agradable, **no** el argumento.

### 7.3 Dónde se dilata cada coste, y una precisión al encargo

El encargo dice que con pocos pedidos de mucho valor domina el porcentaje y el fijo se
diluye, y con muchos pedidos pequeños al revés. **Es cierto, pero hay que separar dos fijos
distintos, porque se diluyen con cosas distintas.** Los números de §7.1 lo enseñan:

- **La parte fija por pedido** (0,25 € en Stripe, 0,30 € en Shopify) se diluye **con el
  ticket**. A `T` = 3.000 € vale 0,008 puntos porcentuales: nada. A `T` = 110 € vale
  **entre 0,23 y 0,27 puntos** —según sea el 0,25 € de Stripe o el 0,30 € de Shopify— y ya
  pesa **casi tanto como la diferencia entre dos planes de Shopify**. A `T` = 20 € valdría
  1,25 puntos y se comería el análisis entero.
- **La cuota mensual** se diluye **con el GMV, no con el ticket**. En S1 —pocos pedidos, de
  mucho valor, exactamente el caso que describe la marca— el GMV total es bajo, así que
  **los 55 € compartidos son el 0,92 % del GMV y los 94 € de Shopify el 1,57 %**: la cuota
  mensual pesa **tanto como media comisión de tarjeta**. Ahí el fijo **no** se diluye; es el
  52 % de toda la diferencia entre motores.

La formulación precisa, entonces: **ticket alto diluye el fijo por pedido; GMV alto diluye
la cuota mensual.** Un negocio de pocos pedidos muy caros tiene lo primero pero puede no
tener lo segundo, y es justo el caso de S1.

### 7.4 Las dos sensibilidades pendientes

- **Stripe Tax.** Cada 0,1 pp añaden 0,1 % del GMV al nativo: **6 €/mes en S1, 38 € en S2,
  39 € en S3**. A partir de **0,6 pp** el nativo perdería su ventaja porcentual frente a
  Shopify Basic en España. Es la cifra sin verificar con más capacidad de mover el resultado.
- **VeriFactu.** Si el proveedor cobra cuota fija, entra en el fijo compartido de los dos
  motores y **no cambia ninguna comparación**. Si cobra por factura emitida, se comporta como
  la parte fija por pedido: **irrelevante en S1 y S2, y potencialmente notable en S3**, donde
  hay 350 facturas al mes.

---

## 8 · Lo que no se pudo verificar

| # | Cifra | Por qué | Qué haría falta |
|---|---|---|---|
| 1 | **Cuotas de Shopify en euros para España** | La página de precios se sirve por país y no se puede descargar (§0); los extractos se contradicen | Abrir `shopify.com/es/precios` desde un navegador en España |
| 2 | **Tarifa «Rest of World» de Shopify Payments España** (tarjetas UK y de EAU) | **No está publicada** en la documentación general; solo aparece en el panel de la tienda | Abrir una tienda de pago y mirar *Standard rates*. **Hasta entonces, todos los números de Shopify para UK y EAU de §7.1 son mínimos** |
| 3 | **Conversión de divisa de Shopify para España: ¿1,5 % o 2 %?** | La ayuda dice que depende del país de la tienda y no da la tabla | Misma vía que el 2 |
| 4 | **Porcentaje por transacción de Stripe Tax** | No aparece en ningún extracto de la página oficial | Abrir `stripe.com/tax/pricing` con país España; y pedir presupuesto, porque la propia página ofrece precio a medida para «transacciones de valor alto» |
| 5 | **Precio de un SIF VeriFactu con API** | **No hay lista oficial de proveedores**, luego no hay fuente oficial de precios (§4.2) | Presupuestos a dos o tres proveedores, con exigencia de declaración responsable por escrito |
| 6 | **Comisión por disputa de Stripe en España** | Solo se confirmó la excepción de Cartes Bancaires en SEPA | Página de precios de Stripe España. **Importa**: en ticket alto, una sola disputa pesa más que un mes de cuotas |
| 7 | **¿Bizum existe en Shopify Payments España?** | No aparece en la lista de métodos locales de la ayuda | Confirmarlo con la tienda delante **antes** de dar por buena cualquier ruta de checkout española por Shopify |
| 8 | **Tarifa variable de Shopify Plus sobre facturación** | Solo la da su equipo comercial | Irrelevante mientras no haya entidad en EAU |
| 9 | **Comisiones de Tabby y Tamara** | Fuera de los dominios oficiales del encargo | Presupuesto directo. Afecta a los dos motores, y en Shopify además con el recargo de plan encima |
| 10 | **Si la cuota de plataforma de Vercel Pro y el primer asiento son 20 $ o 40 $** | Los extractos describen las dos cosas por separado (§2.1) | Mirar la página de facturación con el equipo delante. **No cambia ninguna conclusión**: es coste compartido |

**Dónde este análisis es más frágil, por orden:**

1. **El hueco 2.** Sin la tarifa «Rest of World», el coste de Shopify en UK y EAU está
   acotado por abajo pero no cerrado. Es el mercado donde ADR-08 pone el crecimiento.
2. **El hueco 4.** Stripe Tax es porcentual sobre GMV, que es la clase de coste que domina
   aquí, y a partir de 0,6 pp cambiaría la conclusión de §7.2.
3. **Las horas del §6.** Es la única sección sin fuente externa. El supuesto 2 (una
   incidencia de webhooks al mes) no tiene ninguna base empírica: la pieza aún no existe.
4. **El §7.2 supone que el ticket real cae en algún punto del barrido de S1-S3.** Si
   resultara ser un orden de magnitud distinto, los umbrales se mueven con él.
5. **Toda la extracción del §0.** Ninguna cifra se leyó en su página.

---

## 9 · Vigencia

Se re-verifica **entero** cuando ocurra cualquiera de estas cosas:

- **Han pasado tres meses** desde el 21 ago 2026.
- Se abre una tienda de Shopify de pago → se cierran los huecos 1, 2, 3 y 7 el primer día.
- Se elige proveedor VeriFactu → se cierra el 5. **Con fecha límite el 1 ene 2027**, esto no
  espera al siguiente trimestre.
- Se pasa Vercel a Pro o se mueve el outbox a `pg_cron`/`pgmq` → cambia §2.1 y con él el
  peor caso de 24 h.
- Cambia el ticket, cuando exista → se recalcula §7 entero.

Y una regla que este documento hereda de [`CLAUDE.md`](../CLAUDE.md) §6: **una cifra que
solo existe en la memoria de alguien no es una cifra.** Cuando se re-verifique, se cambia el
número **y** su fecha en la misma edición.

---

## 10 · Fuentes

Todas consultadas el **21 ago 2026**, todas oficiales, ninguna descargada directamente
(§0).

**Shopify** — `shopify.com/pricing` · `shopify.com/es/precios` · `shopify.com/plus/pricing` ·
`help.shopify.com/.../pricing-plans/plans-features` ·
`help.shopify.com/.../third-party-transaction-fees` ·
`help.shopify.com/.../shopify-payments/supported-countries/spain` ·
`help.shopify.com/.../shopify-payments/supported-countries/united-arab-emirates` ·
`help.shopify.com/.../transactions/domestic-international-eu-credit-cards` ·
`help.shopify.com/.../store-currency/currency-conversion-calculation` ·
`help.shopify.com/.../duties-and-import-taxes/charging-duties` ·
`changelog.shopify.com/posts/shopify-duty-calculator-now-available-for-all-shopify-plans` ·
`apps.shopify.com/headless` · `shopify.dev/docs/storefronts/headless/...` ·
`shopify.dev/docs/api/usage/limits` · `shopify.dev/docs/api/usage/versioning` ·
`shopify.dev/docs/apps/build/dev-dashboard/stores/development-stores`

**Stripe** — `stripe.com/en-es/pricing` · `stripe.com/pricing/local-payment-methods` ·
`stripe.com/tax/pricing` · `support.stripe.com/questions/understanding-stripe-tax-pricing` ·
`support.stripe.com/questions/dispute-fees-faq` · `docs.stripe.com/upgrades` ·
`docs.stripe.com/api/versioning`

**Vercel** — `vercel.com/pricing` · `vercel.com/docs/plans/hobby` ·
`vercel.com/docs/plans/pro-plan` · `vercel.com/docs/pricing` ·
`vercel.com/docs/cron-jobs/usage-and-pricing` ·
`vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan` ·
`vercel.com/docs/queues/pricing` · `vercel.com/docs/limits/fair-use-guidelines` ·
`vercel.com/legal/terms`

**Supabase** — `supabase.com/pricing` ·
`supabase.com/docs/guides/platform/manage-your-usage/compute` ·
`supabase.com/docs/guides/platform/manage-your-usage/branching` ·
`supabase.com/docs/guides/platform/free-project-pausing` · `supabase.com/docs/guides/cron` ·
`supabase.com/docs/guides/queues`

**AEAT y BOE** — `sede.agenciatributaria.gob.es/.../sistemas-informaticos-facturacion-verifactu` ·
`.../certificacion-sistemas-informaticos-declaracion-responsable.html` ·
`.../nota-informativa-ampliacion-plazo-adaptacion-facturacion.html` ·
`.../folleto-actividades-economicas/.../5_12-veri-factu.html` ·
`boe.es` BOE-A-2025-24446 (RD-ley 15/2025) · BOE-A-2025-6600 (RD 254/2025)

**Fuera de la lista de dominios del encargo, y marcado como tal** — `upstash.com/pricing/qstash`
