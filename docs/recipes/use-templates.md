# Receta · Partir de una plantilla para una página nueva

Una plantilla aquí **no es un tipo de documento**: es una página que nadie ha publicado, con la composición ya montada. Se usa duplicándola. Sin schema nuevo, sin código, y una plantilla nueva cuesta lo mismo que escribir una página.

> No confundir con **WP13** (`docs/ARCHITECTURE.md §3`): aquellas son plantillas con *slots vinculados* que un producto no puede reordenar, necesitan schema y son otra tarea.

## Las que hay

| Página (borrador) | Para qué | Secciones |
|---|---|---|
| `plantilla-landing-producto` | Lanzar o relanzar un robot | stage · anchorNav · bento · steps · specTable · faq · ctaBand |
| `plantilla-lanzamiento` | Preventa o lista de espera, estilo backer-first (ADR-021) | stage · statBand · timeline · waitlist · faq |
| `plantilla-empresa` | Quiénes somos, tecnología, prensa | hero · featureGrid · quote · ctaBand |

## Cómo se usa

1. En `/admin` → **Contenido → Páginas**, busca la que empieza por `PLANTILLA ·`.
2. Menú de la derecha → **Duplicar**.
3. En la copia: cambia el **título** y, sobre todo, el **slug** (el de la copia sale como `plantilla-…-copy`; ese es el que aparecería en la URL).
4. Escribe el contenido. Borra los bloques que no necesites y añade los que falten: el selector reparte las secciones en cuatro baldas —Portada, Contenido, Producto, Conversión— y cada una lleva su dibujo, así que se elige por silueta antes que por nombre.
5. Repite en cada idioma con el selector de locale: la estructura es común, el texto no.
6. **Previsualiza** antes de publicar. La vista previa se abre sola junto al formulario y trae tres anchos: Móvil (390), Tablet (768) y Escritorio (1440). El móvil es donde está el tráfico y era el único ancho que nadie miraba.
7. **Publica**. La plantilla original se queda en borrador; no la publiques.

## Por qué las plantillas no salen en la web

Son borradores, y `apps/web/src/content/get-page.ts` filtra por `_status: "published"` tanto al leer una página como al listar para el sitemap. Es decir: 404 en su URL y ausentes del sitemap, sin que nadie tenga que acordarse. Verificado en el turno que las creó.

Corolario: **una plantilla publicada por error sí sería una página real**. Por eso el título lleva el prefijo `PLANTILLA ·` y la portada un `note` que lo dice.

## Los nombres de bloque no son decoración

Cada bloque de las plantillas lleva su **Block Name** puesto (`Portada`, `Índice`, `Datos`, `Cierre`…). Hace dos cosas a la vez:

- Nombra el hueco en el admin, para que una página de diez bloques siga siendo legible.
- **Es el ancla**: el renderer deriva el `id` de la sección de ese nombre (`Lo que se mide` → `#lo-que-se-mide`), y es a lo que apunta la sección `anchorNav`.

Si cambias el nombre de un bloque, **actualiza el índice** que lo enlazaba. Si un enlace del índice no lleva a ningún sitio, es esto.

## Añadir una plantilla

Es una página más en `apps/web/src/seeds/seed-content.ts`: llama a `seedComposedPage(slug, titles, esBlocks, enBlocks, "draft")`. El quinto argumento es lo único que la distingue de una página normal.

Escribe el contenido de ejemplo en la voz de la marca (`.claude/rules/content-voice.md`): un editor copia lo que ve, así que un texto de relleno genérico se convierte en una landing genérica. Lo que hay en las tres plantillas está redactado como instrucción *y* como ejemplo de tono.

## Verificar

```bash
pnpm --filter @courvia/web seed:content   # idempotente: salta las que ya existen
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/es/plantilla-landing-producto   # 404
curl -s http://localhost:3000/sitemap.xml | grep -c plantilla                                # 0
```
