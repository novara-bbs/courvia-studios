# ADR-030 · Bloques compartidos: una sección nueva, no un mecanismo transversal

- **Estado:** aceptado · **Fecha:** 2026-08-23 · **Nuevo**
- **Sube el techo de ADR-028** en exactamente una unidad, para exactamente una
  sección, y **convive** con [ADR-023](./ADR-023-composition-vocabulary.md) —
  esto no es vocabulario visual nuevo, es un mecanismo de reutilización de
  contenido que se expresa con el vocabulario que ya existe.

## Contexto

`docs/gap-analysis.md` señala los «bloques reutilizables (sincronizados)»
como **el mayor hueco de autoría una vez cerrados SEO y medios**: una banda
CTA repetida en cinco landings hay que arreglarla página por página, y
`docs/plan-dual-commerce.md` lo tiene apuntado desde la Fase 3 como
`not_started — bloqueado: el techo de ADR-028 está en 24/24 y añadir el
bloque exige un ADR nuevo».

Comprobado hoy contra el código y no contra el documento: el registro
(`packages/sections/src/registry.ts`) tiene **exactamente 24** secciones —no
23, ni «cerca del límite»—, y `registry.test.ts` ya lo dice con el nombre
correcto: *«The margin is spent: section 25 needs a new ADR, which is what
this constant existing next to the assertion is for.»* Este es ese ADR.

## Lo que ya existe y que este mecanismo reutiliza, sin inventar nada

Tres precedentes del propio repo cierran casi todas las preguntas de diseño:

1. **`Templates`** (`apps/web/src/payload/templates.ts`) ya es «una colección
   cuyo campo `blocks` es `buildBlocks()`, el mismo vocabulario que `pages`».
   Un `Partials` sigue exactamente esa forma.
2. **`productShowcase`** (`packages/sections/src/blocks/product-showcase/`)
   ya es «una sección de contenido normal cuyo campo solo guarda una
   referencia — precio, imagen y disponibilidad se resuelven en vivo, así que
   un cambio llega a cada landing sin tocar contenido» (comentario del propio
   fichero). Es el patrón exacto que hace falta, generalizado de «referencia
   a un producto» a «referencia a un documento de bloques».
3. **`buildBlocks({ bound })`** (`apps/web/src/payload/blocks.ts:311-315`) ya
   acepta una opción para excluir secciones del vocabulario ofrecido a una
   colección concreta. Es el mecanismo que cierra el riesgo de ciclos (ver
   Decisión, punto 4).

## Decisión

1. **El techo sube de 24 a 25.** Una unidad, para una sección — no una
   reapertura general. La constante y la razón viven juntas en
   `registry.test.ts`, como pide ADR-028; la 26 vuelve a exigir un ADR.

2. **Una sección nueva, `partialRef`**, balda `content` (hoy 8/12, pasa a
   9/12 — sigue por debajo del techo de balda). Es una sección de **contenido
   normal**, no `bound`: vive en cualquier página, no en una plantilla, y un
   editor la coloca donde hace falta como cualquier otro bloque.

3. **Campo único: una referencia a `Partials`.** Sigue el patrón de
   `kind: "products"` (`relationship`, no `hasMany`): el bloque guarda el
   `id` del partial, nunca su contenido. Si se necesitan dos fragmentos, se
   colocan dos bloques `partialRef` — no una lista dentro de uno.

4. **`Partials` es una colección nueva**, con un único campo de fondo:
   `blocks: buildBlocks({ exclude: ["partialRef"] })`. La exclusión es lo que
   hace **imposible por construcción** que un partial contenga una referencia
   a otro partial: el selector de bloques de Payload, dentro de un `Partials`,
   nunca ofrece `partialRef` como opción. No hay guarda en tiempo de
   ejecución que comprobar ni un límite de profundidad que fallar en el
   peor caso — es la misma filosofía que el resto del DSL: la regla vive en
   lo que el editor puede llegar a guardar, no en lo que el renderer decide
   descartar después.

4b. **`productShowcase` queda fuera de `Partials.blocks` también**, y no por
   la misma razón que `partialRef`. `pnpm migrate:new` sacó a la luz un
   defecto preexistente y ajeno a esta decisión: esa sección declara
   `dbName: "showcase"` — una tabla sin prefijo de colección, para no pasar
   los 63 caracteres de Postgres — y `Templates` ya la ofrece hoy sin campos
   propios (`buildBlocks({ bound: true })` no filtra nada). El adaptador de
   Postgres de Payload modela una sola fila de relación por nombre de tabla
   de bloque: con `pages` y `templates` compartiendo «showcase», la primera
   migración generada para `Partials` **reasignaba** su FK de `pages` a la
   última colección procesada — de haberse aplicado, habría roto los
   `productShowcase` ya guardados en páginas publicadas. `Partials` no causa
   la colisión Pages/Templates —existe desde WP13 y sigue sin dispararse
   porque nadie ha usado `productShowcase` dentro de una plantilla—, pero
   sumar un tercer aspirante a esa misma tabla la habría convertido en una
   migración que corrompe datos. Se excluye aquí; arreglarla de raíz (una
   tabla por colección) es un `dbName` distinto en `product-showcase/index.tsx`
   y su propia migración, fuera del alcance de este ADR.

5. **Sin versiones ni borradores**, por el mismo argumento que `Templates`
   (`templates.ts`, nota 1): un partial gobierna N páginas publicadas a la
   vez, así que «publicar el partial» publicaría de golpe cada página que lo
   use, y no hay un documento por instancia contra el que previsualizar. El
   día que haga falta obligue a repensarlo, es la misma conversación que
   `Templates` ya dejó escrita, no una nueva.

6. **`ctx.renderPartial` resuelve el contenido de forma independiente**, no
   por profundidad de población del documento que lo contiene. Seguido del
   mismo patrón que `ctx.renderProductGrid`/`ctx.renderSpecTable`
   (`apps/web/src/content/render-context.tsx`): el bloque `partialRef`
   guarda solo el id, y la resolución —traer el partial, parsear sus bloques,
   renderizarlos con `<SectionList>`— ocurre en la app, inyectada por `ctx`,
   no dentro de `packages/sections` (que seguiría sin poder importar Payload
   ni depender en círculo de su propio `render/`).

   Esto no es solo higiene de capas: decide también la caché. Una página que
   no usa ningún partial no paga ningún coste de población extra —
   `pages`/`products` siguen fetcheándose al `depth` que ya usan—, y editar
   un partial invalida **solo su propia etiqueta de caché**
   (`partial:{id}`), sin tener que enumerar qué páginas lo referencian para
   invalidarlas una por una.

## Justificación

**Por qué una sección nueva y no un campo transversal en las 24 que ya
existen.** La alternativa obvia —añadir un `syncedFrom` opcional a cada
sección— tocaría los 24 contratos Zod y sus 24 proyecciones a Payload, y
rompería la dicotomía que `define-section.ts` ya declara sin estado
intermedio: *«A section is either bound or content — there is no half
state»*. Multiplicar por 24 la superficie de prueba para un beneficio que un
solo bloque nuevo cubre entero es el coste sin la ganancia.

**Por qué esto no es lo que ADR-023 prohíbe.** ADR-023 decidió que la
potencia visual llega por vocabulario —secciones nuevas— y no por un escape
genérico. `partialRef` no añade una forma visual: no dibuja nada que otra
sección no dibujara ya. Es un mecanismo de **organización de contenido**, del
mismo orden que «un campo puede ser localizado» o «un documento puede tener
versiones» — ortogonal al argumento de ADR-023, no una excepción a él.

**Por qué no cuenta como el HTML libre que ADR-023 cerró.** Un partial solo
puede contener el mismo vocabulario acotado que ya pasa por Zod, tokens
semánticos y las cuatro garantías (AA, RTL, temas, superficie de inyección).
No abre una vía nueva de ejecutar nada: abre una vía nueva de **apuntar** a
contenido que ya estaba sujeto a esas garantías.

Alternativas descartadas:

- **Campo `syncedFrom` en cada sección.** Rechazada arriba.
- **«Reutilizable» como copiar en vez de sincronizar** (duplicar los bloques
  de una página en otra, sin enlace vivo). No resuelve lo que
  `gap-analysis.md` nombra explícitamente: una banda CTA que cambia de precio
  en cinco landings a la vez es justo el caso que copiar no cierra — solo
  ahorra el primer tecleo, no el mantenimiento.
- **Fusionar dos secciones existentes en variantes de una para no subir el
  techo.** Es «50 genéricos con otro nombre» con el mismo argumento que
  ADR-023 ya rechazó, y además exigiría migrar el contenido de una sección
  publicada en producción sin necesidad.
- **Quitar el techo para este caso.** Es la misma vuelta atrás que ADR-028
  ya cerró: la balda vuelve a ser una lista en cuanto uno de los límites dejar
  de medirse.

## Consecuencias

- El registro pasa a 25/25 exactamente. La sección 26 vuelve a exigir un
  ADR, y `registry.test.ts` lo sigue vigilando con el número delante.
- `content` pasa de 8 a 9 de 12: sigue habiendo margen en esa balda antes de
  discutir partirla.
- `Partials` es una colección nueva: migración nueva, creada y probada en
  local, aplicada a producción solo por CI con aprobación explícita — sin
  excepción por ser «solo CMS» (`.claude/rules/database.md`).
- Un partial no puede contener otro partial, por construcción, no por
  vigilancia en tiempo de ejecución.
- Editar un partial cambia, al instante, cada página que lo referencia — es
  la definición de «sincronizado», y el precio a pagar es el mismo que paga
  hoy `productShowcase`: no hay «vista previa antes de publicar» para un
  cambio que ya es público en el momento de guardarlo.
- El techo de ADR-028 dijo que algún día hablaría de campos y no de bloques,
  si el panel llegara a ir lento por volumen de campos. Esta sección añade
  un campo (`partial`), no varios: no adelanta esa conversación.
