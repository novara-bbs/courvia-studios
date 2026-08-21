# ADR-028 · El techo de secciones sube a 24, y un test lo vigila

- **Estado:** aceptado · **Fecha:** 2026-08-21 · **Nuevo**
- **Corrige** la cifra de CLAUDE.md §5 («10-12 específicos, no 50 genéricos») y
  **convive** con [ADR-023](./ADR-023-composition-vocabulary.md), que hace de
  «una sección nueva» la respuesta canónica a cualquier hueco visual.

## Contexto

CLAUDE.md §5 fijaba el techo en **10-12 bloques**. El registro tiene **19**: un
58 % por encima. La cifra no la vigilaba ningún test, así que el incumplimiento
llevaba semanas escrito en el documento que manda y en el código a la vez, sin
que nada lo dijera.

Peor que la cifra: la contradicción interna. ADR-023 decidió que no hay bloque
de HTML libre y que **la potencia visual llega por vocabulario** — es decir,
por secciones nuevas. Toda la presión de diseño del sistema empuja contra un
techo que nadie mide. Y hay trabajo comprometido que lo empuja más: WP13
(`docs/ARCHITECTURE.md` §3) añade cuatro secciones **vinculadas**
—`productBuybox`, `productSpecs`, `productGallery`, `warranty`— que no tienen
campos de contenido y leen del contexto de render. Con ellas, el registro llega
a **23**.

Lo que ha cambiado desde que se escribió el 10-12 es el selector. Entonces era
una lista plana de diecinueve nombres. Hoy la proyección
(`apps/web/src/payload/blocks.ts`) emite dos cosas más por bloque:

- **`admin.group`** — cada sección declara su balda (`opener` · `content` ·
  `product` · `conversion`) y Payload agrupa el drawer por ella
  (`BlockSelector/index.js` construye un grupo por etiqueta traducida).
- **`admin.images.thumbnail`** — una miniatura generada desde el propio sketch
  de la sección, sobre los tokens del tema por defecto. No es un archivo que
  alguien regenera: se dibuja en cada arranque y hay un test que rechaza dos
  secciones con la misma imagen.

Con eso, el coste de encontrar una sección deja de crecer linealmente con el
número. Se escanea **una balda** en una rejilla de 6 columnas, con dibujo, no
una lista de 19 nombres.

## Decisión

1. **El techo pasa de 12 a 24 secciones.** 19 hoy + 4 de WP13 = 23, y una de
   margen. No es un número redondo por gusto: es el trabajo comprometido más
   uno.
2. **Segundo techo, 12 por balda**, y es el que gobierna de verdad el escaneo.
   El drawer de Payload es una rejilla de **6 columnas** en pantalla ancha —5,
   3 y 2 al estrechar— (`blocks-drawer__blocks/index.scss`, `@payloadcms/ui`
   3.88), así que 12 son dos filas en el ancho en el que se edita: una balda
   entera cabe de un vistazo.
3. **Un test lo vigila**, en `packages/sections/src/registry.test.ts`. Superar
   cualquiera de los dos techos rompe CI con el número exacto y el nombre de
   este ADR.
4. **Subir el techo otra vez es un ADR nuevo**, no editar una constante. La
   constante vive junto a la aserción precisamente para que cambiarla se lea en
   el diff.

## Justificación

El 10-12 protegía dos cosas distintas, y solo una sigue en pie.

- **El coste de elegir.** Resuelto por baldas y miniaturas: cuatro baldas de
  tres a ocho secciones son una decisión y luego una lista corta. Esto es lo
  que autoriza la subida.
- **La degradación del panel con exceso de bloques y campos.** Sigue vivo, y
  este techo **no lo mide**. Hoy el registro son 19 secciones y **87 campos**
  contando los anidados dentro de arrays; la sección más grande (`stage`) tiene
  9. Si algún día el panel va lento, la medida es esa —campos, no bloques— y el
  techo tendrá que hablar de campos. Decirlo aquí es más útil que inventar
  ahora una cifra de campos que nadie ha medido contra un panel lento.

Alternativas descartadas:

- **Mantener 12 y fundir secciones en variantes de una sola.** Es exactamente
  el fallo que ADR-023 rechaza: un bloque genérico con un `select` de diez
  valores es «50 genéricos» con otro nombre, y su formulario muestra campos que
  no aplican a la variante elegida.
- **Quitar el techo.** La balda vuelve a ser una lista en cuanto una de ellas
  crece; el límite por balda es el que impide esa vuelta.
- **Subirlo sin test.** Es lo que produjo el 58 % de exceso sin que nadie se
  enterara. Una regla que nadie ha visto fallar es un comentario
  (`docs/ARCHITECTURE.md` §1).

## Consecuencias

- CLAUDE.md §5 deja de decir una cifra que el código incumple.
- WP13 entra sin volver a tocar el techo: 23 de 24.
- La sección 25 no la para una revisión humana que puede no ocurrir: la para
  CI, con el número delante.
- La cuarta sección de producto de WP13 deja la balda `product` en 8 de 12. La
  siguiente que se añada ahí seguirá cabiendo; a partir de la doceava habrá que
  partir la balda o discutirlo en un ADR. Esa conversación llega cuando toca,
  no cuando alguien se acuerda.
- Retirar una sección sigue costando tres pasos (`docs/ARCHITECTURE.md` §3:
  marcar `deprecated` → migración → borrar el código). El techo no invita a
  borrar para hacer sitio.
