# ADR-016 · Registro de secciones y controles de apariencia atados a tokens

- **Estado:** aceptado · **Fecha:** 2026-08-19
- **Nuevo** (CLAUDE.md §5 decía "tema = tokens + composición" sin especificar la mitad de composición).

## Contexto

El objetivo del propietario es cambiar la web sin tocar código: textos, imágenes, orden y composición de secciones, tema — y **flexibilidad visual real por instancia, estilo Webflow, sin que el sistema se vuelva incoherente o rompible**.

Las dos salidas fáciles son malas. Un page-builder libre (colores y espaciados arbitrarios por bloque) destruye la consistencia de marca y produce páginas inaccesibles. Un CMS puramente estructural obliga a una sesión de desarrollo por cada cambio de estructura.

## Decisión

**Una declaración por sección, cuatro caras.** `defineSection` empareja config de bloque Payload + componente RSC + preset de apariencia + story/fixture. La config de Payload es la fuente de verdad de los **campos** (es más rica que Zod y Payload ya genera los tipos); Zod cubre `appearance` y los overrides de tema. Un test de biyección impide la deriva.

**Controles de apariencia atados a tokens.** Cada instancia expone un grupo `appearance` donde *todo* control es un enum ligado a la escala de tokens: espaciado, fondo (rol semántico), ancho, alineación, columnas, posición de media, énfasis, radio, elevación, ámbito de tema, aparición y visibilidad. Se renderizan como atributos `data-*` con una hoja CSS generada desde la misma tabla.

Ausentes a propósito: selectores de color, hex, familias tipográficas, tamaños en px, padding libre, `className`, `style`, CSS a medida. Precedentes: `settings.blocks` de `theme.json` en WordPress con `custom:false`, y la formulación de Builder.io — *las barreras son arquitectónicas, no de política*.

**Fallo elegante:** valor desconocido → default (`.catch()`); clave desconocida → descartada (`.strip()`); bloque desconocido → omitido, con diagnóstico solo en preview.

## Consecuencias

- El editor tiene control visual real; **no existe camino desde el contenido hasta un valor CSS arbitrario**.
- La superficie CSS queda acotada en tiempo de build, independiente del número de páginas.
- El contraste se preserva porque los fondos reasignan los roles de texto.
- Ampliar el sistema = añadir un enum y su regla CSS. Nunca un refactor.
- Coste: los enums y los `type` de bloque se guardan en el contenido, así que **renombrarlos después es una migración de datos**. Se fijan antes de que exista contenido.
