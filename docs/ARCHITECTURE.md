# Arquitectura Courvia

> Cómo está construida la plataforma y **por qué**. CLAUDE.md manda en las reglas duras; este documento explica la estructura. Ante conflicto, gana CLAUDE.md y se corrige aquí.
>
> Principio rector (CLAUDE.md §2): **construimos la experiencia Courvia, no una nueva Shopify.**

---

## 1. Las seis capas

Cada capa solo conoce las de abajo. La dirección de dependencias **la verifica CI** (`pnpm arch`), no la confianza.

| Capa | Paquete | Posee | No puede |
|---|---|---|---|
| **L0 Tokens** | `@courvia/design-tokens` | Valores de diseño (DTCG) → variables `--cv-*`. Temas como ámbitos `[data-theme]` anidables. | Depender de ningún paquete del repo (debe seguir siendo portable a Figma o a una app nativa). |
| **L1 Primitivas** | `@courvia/ui` | Semántica DOM y accesibilidad de los átomos. | Conocer el framework, el CMS, el dominio ni recibir `className`/`style`. |
| **L2 Secciones** | `@courvia/sections` *(WP7)* | Las unidades editables: contenido + apariencia + render. | Hacer E/S. Una sección es función pura de `(contenido, apariencia)`. |
| **L3 Plantillas** | Payload `templates` *(WP13)* | Layout de PDP / listado editado una vez para todos los productos. | — |
| **L4 Documentos** | Payload collections *(WP6+)* | Persistencia, campos localizados, borradores y versiones. | Importar componentes de tienda al bundle del admin. |
| **L5 Ajustes** | Payload globals | `ThemeSettings`, `SiteSettings`, `Navigation`, `MarketSettings`. | — |

Transversal: **`@courvia/platform`** (deportes, locales, mercados, monedas, regiones, ids de pasarela). Sin dependencias, del que beben todos. Existe porque la capa de i18n no debe importar el dominio de commerce para saber qué idiomas hay.

Dominio y adaptadores:

```
apps/web ──→ sections ──→ ui ──→ design-tokens
    │            └───────────────→ platform
    ├──→ commerce-domain  ←── payments-stripe      (puerto PaymentProvider)
    └──→ container.ts     ←── commerce-payload     (puerto CommerceService)
```

### Prohibiciones y qué evita cada una

| Prohibido | Evita |
|---|---|
| `commerce-domain` → cualquier cosa salvo `platform` | Que la infraestructura se filtre al único módulo que importan a la vez los adaptadores y la app. |
| `platform` → cualquier cosa | Que el vocabulario compartido deje de ser el suelo común. |
| `design-tokens` → cualquier paquete | Que los tokens dejen de ser portables fuera del repo. |
| `ui` → sections / dominio / adaptadores / `next` / `payload` | Que una primitiva deje de renderizarse aislada en Storybook y en los tests visuales. |
| rutas → adaptadores concretos | Recrear el lock-in de pasarela que los puertos existen para impedir (ADR-13). Solo `apps/web/src/server/container.ts` nombra un adaptador. |
| adaptador de pagos ↔ adaptador de persistencia | Que cambiar Stripe destripe el catálogo. |
| imports profundos `@courvia/x/src/...` | Que las fronteras se pudran en silencio saltándose el `exports`. |

Cada regla se validó introduciendo su violación y comprobando que CI la rechaza.

---

## 2. Tokens y temas

**Fuentes:** `brand/courvia-tokens.json` queda **congelado** como entrega original y sigue mandando en los **valores** de marca. `packages/design-tokens/tokens.json` es la fuente **viva** del sistema (roles, estructura). Un test de fidelidad falla si algún valor entregado se desvía.

### El contrato semántico

Los tres temas son **totales** sobre un vocabulario cerrado de roles (`src/semantic-contract.ts`):

```
color: bg · surface · surface-raised · surface-inverse
       text · text-muted · text-inverse
       accent · accent-contrast · link · border
font:  display · body · data
elevation: raised
```

**Por qué es cerrado e irreversible.** Los controles de apariencia dejan que un editor elija un *rol* por sección (`background: inverse`) y ese string queda guardado en el contenido. Si un rol existe en volt y no en club, la misma página se ve bien en un tema y en blanco en otro; y con miles de instancias guardadas, cambiar el vocabulario es una migración de datos. Por eso `theme-parity` falla el build si un tema omite un rol.

Los extras específicos de tema (el oro de club, el inverso de carbon) se neutralizan con `initial` en los temas que no los definen, para que `var()` caiga a su fallback en vez de heredar el valor de otro tema.

### Contraste garantizado por construcción

27 tests calculan el ratio de cada par texto/fondo en los 3 temas y exigen AA (4.5:1). Dos fallos reales se corrigieron al introducirlos: el badge de acento usaba el acento como **texto** (3.55:1 en carbon) y el propio token `color.link` de volt medía 3.45:1. La garantía se hace una vez en build; ninguna combinación seleccionable por un editor puede ser ilegible.

### Anidamiento

Como los temas son bloques `[data-theme]` de igual especificidad y neutralizan lo que no definen, **un tema dentro de otro funciona**. Esto es lo que permite el modelo aprobado: tema de sitio → override por página → override por sección.

---

## 3. La superficie editable

Referencias reales: **Shopify OS 2.0** (secciones + plantillas JSON), **WordPress `theme.json`** (`settings.blocks` con `custom:false`) y **Builder.io**, cuya formulación es la que seguimos: *las barreras son arquitectónicas, no de política* — un editor no puede romper el sistema de diseño porque solo puede usar lo que ingeniería registró.

### Registro de secciones (WP7)

Un módulo por sección produce cuatro caras desde **una** declaración, evitando el triple mantenimiento:

```
packages/sections/src/hero/
  block.ts        # config de bloque Payload  ← fuente de verdad de los CAMPOS
  Hero.tsx        # React Server Component
  appearance.ts   # controles permitidos para esta sección
  Hero.stories.tsx
  fixtures.ts     # contenido de oro, usado por tests Y por stories
  index.ts        # defineSection({ slug, block, Component, appearance, variants })
```

Decisión deliberada: **la config de bloque de Payload es la fuente de los campos**, no Zod. Es más rica (relaciones, uploads, `localized`, condiciones de admin) y Payload ya genera los tipos TS; generar campos Payload desde Zod sería un codegen frágil. Zod se reserva para `appearance` y para los overrides de tema. Un test de biyección exige que todo bloque registrado tenga componente, story y fixture.

### Controles de apariencia atados a tokens

Cada instancia recibe el mismo grupo `appearance`. **Todo control es un enum ligado a un token; ninguno acepta un número, un color o un string libre.**

| Control | Valores | Mapea a |
|---|---|---|
| `spaceBlockStart` / `spaceBlockEnd` | `none · xs · sm · md · lg · xl` | `--cv-space-*` |
| `gap` | `tight · normal · loose` | `--cv-space-*` |
| `background` | `page · surface · raised · inverse · accent` | roles semánticos |
| `width` | `prose · content · wide · full` | `--cv-breakpoint-*` |
| `align` · `columns` · `mediaPosition` | enums lógicos (`start`/`end`, nunca `left`/`right`) | layout, RTL-seguro |
| `themeScope` | `inherit · volt · carbon · club` | `data-theme` anidado |
| `accentUse` | `none · heading · underline · badge` | énfasis |
| `radius` · `elevation` | enums | `--cv-radius-*`, `--cv-elevation-*` |
| `reveal` | `none · fade · rise` | respeta `prefers-reduced-motion` |
| `hiddenOn` | `mobile · tablet · desktop` | visibilidad |

**Deliberadamente ausentes** — y esta lista *es* el diseño: selectores de color, hex, familias tipográficas, tamaños en px, padding libre, `className`, `style`, CSS a medida, z-index, opacidad.

**Cómo se renderiza.** Como atributos `data-*` en el envoltorio de la sección, con una hoja CSS generada desde la misma tabla de enums. Tres consecuencias que lo hacen seguro para siempre:

1. La superficie CSS es **acotada y conocida en build** (~120 reglas), independiente del número de páginas o instancias. Sin estilos inline, sin CSS-in-JS.
2. **No existe camino desde el contenido hasta un valor CSS**: el contenido solo elige un valor de atributo dentro de un conjunto cerrado, y la hoja se compiló desde ese mismo conjunto.
3. Un valor desconocido cae al default de Zod (`.catch()`), y una clave desconocida se descarta (`.strip()`). Reducir un enum degrada con elegancia en vez de romper páginas publicadas.

`background: inverse` y `themeScope` **reasignan** los roles de texto y borde, así que el contraste se mantiene sin que el editor tenga que pensarlo.

**Válvula de escape acotada:** si algún día hace falta un control numérico (el span de un bento), entra como **enum nuevo** con sus valores enumerados, nunca como `style={{...desdeElCMS}}`. La regla de lint que prohíbe el atributo `style` en TSX ya lo impide.

### Plantillas (WP13)

`templates` contiene `blocks[]` donde algunas secciones son *vinculadas* (`productBuybox`, `productSpecs`, `productGallery`, `warranty`): no tienen campos de contenido y leen del contexto de render (`product`, `variant`, `market`, `locale`). El editor las reordena e intercala secciones de marketing alrededor.

Un producto puede apuntar a otra plantilla o añadir secciones en puntos de inserción con nombre, pero **no puede reordenar ni borrar los slots de la plantilla**. Esa cota es lo que impide que 200 SKUs se conviertan en 200 layouts a medida.

### Resiliencia

- Bloque referenciado pero ausente del código → el renderer lo omite; en preview muestra un diagnóstico visible. **Un bloque roto nunca debe tumbar una página.**
- Retirar una sección son tres pasos: marcarla `deprecated` (desaparece del selector, sigue renderizando) → migración que reescribe las instancias → borrar el código en una release posterior. Un check nocturno compara los `blockType` presentes en contenido con el registro.
- Cada instancia lleva versión; los cambios de forma son *upgraders* en código, no ediciones masivas en base de datos.

---

## 4. Resolución de tema bajo Next.js 16

**El tema activo es contenido del CMS, no una preferencia del visitante.** (Implementado 19-ago: `getSiteTheme()` con `use cache` + `cacheTag("theme")`, hook de publicación que revalida, cookie eliminada, `cacheComponents` activo, verificado end-to-end: publicar carbon re-viste el sitio servido.) La implementación anterior por cookie contradecía CLAUDE.md §5 y, peor, la documentación de Next 16 lo dice explícitamente: leer una cookie que gobierna un atributo de `<html>` en el layout raíz vuelve **toda** la app dependiente de la petición, sin subárbol que envolver en `<Suspense>`. Eso bloquea PPR para toda la tienda.

Modelo objetivo (WP4/WP9), de menor a mayor precedencia:

| Origen | Dónde aterriza | Cacheable |
|---|---|---|
| `DEFAULT_THEME` compilado en `:root` | implícito | sí (CSS estático) |
| `ThemeSettings.activeTheme` (global Payload) | `<html data-theme>` | sí, `cacheTag("theme")` |
| `page.themeOverride` | `<div>` dentro de `<body>` | sí, parte de la caché de página |
| `section.appearance.themeScope` | `<section data-theme>` | sí |
| cookie `cv-theme` | `<html data-theme>` | **solo con `draftMode().isEnabled`** |

El override de página va en un envoltorio dentro de `<body>`, no en `<html>`: así el shell estático (y el conjunto de fuentes precargadas) depende solo del tema de sitio.

**Overrides de tokens:** whitelist validada con Zod cuyos valores son enums ligados a primitivas, no strings libres. Se emiten como un `<style>` en `<head>` dentro del layout cacheado → sin FOUC, sin JS de cliente y **acotado por construcción** (7 claves = como mucho 7 declaraciones). Restaurar = borrar la clave.

**Preview:** el draft mode de Next hace que los ámbitos cacheados se re-ejecuten en cada petición, así que la vista previa es fresca sin fontanería de caché, mientras producción sigue estática.

**Fuentes:** hoy `<html>` precarga las 8 familias para un tema que usa 3. Debe cargar solo las del tema activo más la familia del script del locale (falta una árabe). El mapeo tema↔fuente se genera desde `tokens.json` en vez de mantenerse a mano en `app.css`.

---

## 5. Contenido e i18n

**Regla:** si la cadena la añade alguien en un pull request, es un mensaje de `next-intl`; si la añade un editor en `/admin`, es un campo localizado de Payload. Ninguna cadena visible vive en un componente.

| Payload (localizado) | next-intl |
|---|---|
| Títulos, descripciones y specs de producto | Microcopy: "Añadir al carrito", "Cerrar" |
| Contenido de secciones, etiquetas de CTA | Etiquetas de formulario y mensajes de validación |
| Navegación, footer, mega-menú | Textos de accesibilidad (`aria-label`) |
| SEO, Open Graph | Formato de moneda, fecha y número |
| Legales (AR primero, ADR-09) | Plurales, nombres de pasos del checkout |

Las **etiquetas** de specs viven en un diccionario global, no como texto libre por producto: si no, el comparador no puede alinear filas entre SKUs.

**Locale ≠ Market.** Un `region` compone ambos y tiene URL propia e indexable: `/es`, `/en-gb`, `/en-ae`, `/ar-ae`. UK y EAU comparten idioma pero difieren en moneda, impuestos, envíos y SEO. Una cookie de mercado no se puede indexar y forzaría render dinámico de toda página con precio.

---

## 6. Commerce

**Catálogo en colecciones Payload propias** detrás de `CommerceService` (ADR-18). El plugin oficial `@payloadcms/plugin-ecommerce` existe pero está en beta, no cubre impuestos ni envíos —que sí necesitamos— y tiene fallos abiertos de multi-moneda.

**Solo servidor**, en cuatro capas que se refuerzan: access control de Payload · schema Postgres no expuesto al Data API · RLS sin política permisiva para roles anónimos · **y un test que lo demuestra** conectando con la clave publicable y comprobando que no ve nada. Sin ese test las tres primeras capas son aspiraciones.

**La máquina de estados** se conecta así en el adaptador: abrir transacción → bloquear la fila del pedido → **insertar primero la fila de `payments`** apoyándose en `UNIQUE(provider, provider_event_id)` (un duplicado revienta ahí, sin efectos) → `transition()` puro → persistir → ejecutar solo los efectos **transaccionales** → encolar los de **outbox** en la misma transacción → commit → drenar el outbox.

Esa separación es una corrección al contrato original, que pedía todos los efectos dentro de la transacción: un rollback no puede *des-enviar* un email, y una llamada a la pasarela dentro de la transacción retiene un lock durante un viaje de red. `SIDE_EFFECT_EXECUTION` clasifica cada efecto y un test verifica que ninguno queda sin clasificar.

---

## 7. Verificación

| Nivel | Cubre |
|---|---|
| `pnpm arch` | Las fronteras de §1, cada una probada contra su violación |
| `pnpm stylelint` | Nada de hex crudo, nada de propiedades físicas |
| Lint con tipos | `no-floating-promises`, `no-misused-promises`, Rules of Hooks |
| Vitest | Dominio, `Money`, contrato semántico, **contraste AA en 3 temas**, compilador de tokens |
| Suites de contrato | Todo adaptador prueba que el puerto es implementable |
| Playwright *(WP16)* | Checkout por mercado y proveedor, RMA, desistimiento |
| Storybook + visual *(WP16)* | Secciones × 3 temas × LTR/RTL |
| axe *(WP16)* | AA en los 3 temas y en RTL |

Las suites de contrato son la pieza de mayor apalancamiento: se exportan desde el dominio como factorías, y cualquier adaptador futuro corre exactamente los mismos tests. Es lo que convierte "cambiar Stripe por Adyen sin tocar el dominio" (ADR-13) en algo verificado en vez de prometido.

---

## 8. Estado y secuencia

Hecho: monorepo · tokens con contrato semántico y contraste garantizado · primitivas sin escape hatches · puertos implementables con suites de contrato · `Money` · máquina de estados con outbox y códigos de razón · fronteras verificadas · CI · **Payload 3.88 embebido** (admin en `/admin`, schema `payload` en Supabase con RLS, `push:false` — solo migraciones, colecciones `users`/`media`, globals `ThemeSettings`/`MarketSettings`, localización es/en/ar).

Pendiente, en orden (cada paquete = una sesión):

| WP | Trabajo | Requiere | Reversible |
|---|---|---|---|
| ~~6~~ | ~~Payload embebido + Supabase schema `payload`, admin logueable~~ **hecho 19-ago** | — | — |
| ~~4/5~~ | ~~Rutas `[region]`, `next-intl`, `dir`/`lang`, hreflang~~ **hecho 19-ago** (+ proxy de negociación, sitemap, robots, llms.txt, JSON-LD) | — | — |
| 9 | ~~Tema desde CMS con `cacheTag`~~ **hecho 19-ago** · quedan overrides Zod de tokens + preview en draft mode | 6, 4 | sí |
| 7 | Registro de secciones + controles de apariencia + 3 secciones | 9 | parcial |
| 8 | `pages` + composición + versiones + live preview | 7 | sí |
| 10/11 | Catálogo + precios/inventario solo-servidor + RLS | 6 | **no** + aprobación humana |
| 12 | `commerce-payload` contra las suites de contrato | 10, 11 | sí |
| 13 | Plantillas + PDP/PLP | 8, 12 | parcial |
| 14 | Resto de secciones | 7, 13 | parcial |
| 15 | `payments-stripe` + webhook + outbox | 12 | **no** + aprobación humana |
| 16 | Playwright, axe, regresión visual, jobs de CI separados | 7, 14 | sí |

**Los WP 6, 4/5, 10/11 y 15 son los caros de cambiar después.** El resto es aditivo.
