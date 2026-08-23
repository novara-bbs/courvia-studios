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
   normal**, no `bound`: no lee nada del producto de la página, así que un
   editor la coloca donde haga falta como cualquier otro bloque — en una
   página suelta **o dentro de una plantilla** (`Templates.blocks` sigue
   ofreciendo el vocabulario de contenido completo vía
   `buildBlocks({ bound: true, … })`, y `partialRef` no tiene motivo para ser
   la excepción: un partial en la plantilla por defecto es «este aviso sale
   en todas las fichas de producto», tan válido como en una página cualquiera).
   Corrección sobre la primera versión de este ADR: decía que vivía «en
   cualquier página, no en una plantilla», y el comité de revisión lo marcó
   como falso — el código nunca lo impidió y no había motivo real para
   impedirlo; era la frase la que sobraba, no una regla que faltara escribir
   en `templates.ts`.

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
   los 63 caracteres de Postgres. El adaptador de Postgres de Payload modela
   una sola fila de relación por nombre de tabla de bloque: la primera
   migración generada para `Partials` **reasignaba** la FK de «showcase» de
   `pages(id)` a la última colección procesada — de haberse aplicado, habría
   roto los `productShowcase` ya guardados en páginas publicadas.

   **Y no se quedó en documentarlo.** `Templates.blocks` (`templates.ts`)
   ya ofrecía `productShowcase` desde WP13 sin ninguna barrera —
   `buildBlocks({ bound: true })` no filtraba nada—, así que la colisión
   real no era «Partials contra Pages», era «Pages y Templates ya la
   comparten hoy, sin que ningún test lo impida»: el día que un editor
   arrastrara ese bloque a una plantilla, la siguiente `pnpm migrate:new`
   por cualquier motivo habría generado la misma migración corruptora que
   esta, y esta vez nadie la habría leído a mano antes de aplicarla. El
   comité de revisión de este ADR lo señaló como importante y con razón:
   dejarlo solo en prosa no es lo que pide `.claude/rules/database.md`
   («sin ese test las tres primeras son aspiraciones»). Se cerró en el sitio
   real del riesgo: `templates.ts` ahora llama
   `buildBlocks({ bound: true, exclude: ["productShowcase"] })` — comprobado
   contra la base local que no genera ninguna migración (`pnpm migrate:new`
   respondió «No schema changes detected»: la tabla compartida no codifica
   qué colecciones la ofrecen, solo su única FK, ya apuntada a `pages` desde
   antes de este ADR) y que ninguna plantilla sembrada usaba ese bloque
   (`seed-templates.ts` solo lleva las cinco vinculadas de WP13). Arreglar la
   colisión de raíz —una tabla física por colección, sin `dbName` compartido—
   sigue fuera de alcance: exigiría cambiar `product-showcase/index.tsx` y su
   propia migración, y no es necesario para que este ADR sea seguro.

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

7. **Un partial que resuelve pero no tiene nada dentro no avisa — ni en
   producción ni en preview —, y eso es una propiedad heredada, no un
   descuido de `partialRef`.** El comité de revisión lo encontró; la primera
   redacción de este punto describía el caso equivocado, y solo correrlo de
   verdad lo dejó claro (`partial-ref.http.test.ts` lo prueba, no solo lo
   describe). Hay dos casos, y son distintos:

   - **El id no resuelve en absoluto** (el partial fue borrado, o nunca
     existió). `getPage`/`getDraftPage` populan `partial` a `depth: 1`, así
     que Payload intenta resolver la relación antes de que esta app vea la
     página; una referencia a un documento borrado **puebla a nada**, y
     `partialRefId()` lo lee exactamente como «no se eligió ningún bloque»
     — la misma rama que un editor que nunca eligió uno. `ctx.renderPartial`
     no llega a invocarse. Este caso YA tenía diagnóstico —«no hay ningún
     bloque elegido», algo impreciso para un borrado, pero visible— y sigue
     teniéndolo: sin banda en producción, con el aviso puesto en preview.
   - **El id sí resuelve, a un partial que no tiene nada que mostrar** (el
     caso ordinario: un editor lo crea y no lo rellena todavía; o, más raro,
     un error real de lectura). Aquí es donde `SectionRenderer`
     (`packages/sections/src/render/index.tsx`) decide si emite el
     `<section>` contenedor mirando el valor que `render()` devuelve **de
     forma síncrona**, y `ctx.renderPartial(id)` ya devolvió un elemento
     React —`<SectionPartial>`— en el instante en que el id resolvió:
     `getPartial` resuelve a `null` o a `[]` **después**, dentro de ese
     componente asíncrono, cuando la decisión de envolver ya está tomada.
     El resultado es una banda vacía, con el ritmo vertical de
     `spaceBlockStart`/`spaceBlockEnd` puesto y nada dentro, silenciosa en
     producción **y en preview** — el mismo «parece un bug de diseño, no
     contenido que falta» que `render/index.tsx` dice evitar para cualquier
     otra sección, y que aquí sí ocurre.

   No es exclusivo de `partialRef`: `specTable` y `productShowcase` tienen la
   misma forma —un `<div>` de vuelta síncrona que envuelve una llamada a
   `ctx.render*` cuyo resultado real solo se conoce más tarde, dentro de un
   componente de servidor asíncrono— y el mismo silencio cuando su lista de
   referencias resuelve a cero filas. `partialRef` no lo inventa; lo hereda.

   Arreglarlo de raíz —que `SectionRenderer` espere la resolución antes de
   decidir si envuelve— exigiría que la función de render fuera asíncrona
   para las 25 secciones y su arnés de test entero (`render.test.tsx` usa
   `renderToStaticMarkup`, que no espera componentes asíncronos), un cambio
   de contrato transversal que ninguna de las tres secciones afectadas
   necesitaba hasta ahora y que este ADR no decide por su cuenta. Lo que sí
   se hizo: `apps/web/src/content/get-partial.ts` ya no afirma en su propio
   comentario que un partial ausente produce «a named diagnostic in
   preview» —era falso para el caso que sí pasa por esa función—, y
   `partial-ref.http.test.ts` deja los dos comportamientos reales afirmados
   en tests en vez de sin probar, incluyendo que **no son el mismo caso**.

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
- `Templates` deja de ofrecer `productShowcase` en su selector de bloques
  (punto 4b). Sin coste real: ninguna plantilla sembrada lo usaba y no se
  perdió ninguna migración al quitarlo (`pnpm migrate:new` no generó
  ninguna). Sí es un cambio de superficie del panel fuera del propio
  `partialRef`, y queda aquí para que no se lea como un efecto secundario
  silencioso.
- Un `partialRef` que apunta a un partial sin bloques deja una banda vacía
  sin avisar, igual en producción que en preview (punto 7) — es una
  propiedad que ya tenían `specTable` y `productShowcase` con una lista
  vacía de referencias, y `partialRef` la hereda en vez de inventarla. Un
  `partialRef` que apunta a un partial **borrado** es otro caso, con el
  diagnóstico que ya existía para «no hay ningún bloque elegido»: los dos
  quedan documentados y probados por separado en vez de confundidos.
