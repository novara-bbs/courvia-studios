# Arquitectura Courvia

> Cómo está construida la plataforma y **por qué**. CLAUDE.md manda en las reglas duras; este documento explica la estructura. Ante conflicto, gana CLAUDE.md y se corrige aquí.
>
> Principio rector (CLAUDE.md §2): **construimos la experiencia Courvia, no una nueva Shopify.**

---

## 1. Las seis capas

Cada capa solo conoce las de abajo. La dirección de dependencias **la verifica CI** (`pnpm arch`), no la confianza.

> **Cómo se comprueba que la comprobación funciona.** Durante meses estas reglas no verificaban nada: escritas como `to: { path: "^@courvia/ui" }`, casaban con el especificador desnudo, pero dependency-cruiser compara contra la ruta **resuelta** en cuanto el import resuelve — y resuelve en cuanto la dependencia está declarada en `package.json`, que es justo lo que hace quien añade el import. Cazaban, por tanto, solo las violaciones que ni habrían instalado. Once reglas medidas rompiendo cada frontera a propósito: funcionaba una. Están reescritas contra ambas formas y `packages/config/arch-rules.test.ts` impide la recaída. La lección general: **una regla que nadie ha visto fallar es un comentario.**

| Capa | Paquete | Posee | No puede |
|---|---|---|---|
| **L0 Tokens** | `@courvia/design-tokens` | Valores de diseño (DTCG) → variables `--cv-*`. Temas como ámbitos `[data-theme]` anidables. | Depender de ningún paquete del repo (debe seguir siendo portable a Figma o a una app nativa). |
| **L1 Primitivas** | `@courvia/ui` | Semántica DOM y accesibilidad de los átomos. | Conocer el framework, el CMS, el dominio ni recibir `className`/`style`. |
| **L2 Secciones** | `@courvia/sections` + `@courvia/appearance` | Las unidades editables: contenido + apariencia + render. `appearance` posee el vocabulario de controles (enums ligados a tokens, ADR-016), su schema Zod y la hoja CSS generada. | Hacer E/S. Una sección es función pura de `(contenido, apariencia)`. |
| **L3 Plantillas** | Payload `templates` *(WP13)* | Layout de PDP / listado editado una vez para todos los productos. | — |
| **L4 Documentos** | Payload collections *(WP6+)* | Persistencia, campos localizados, borradores y versiones. | Importar componentes de tienda al bundle del admin. |
| **L5 Ajustes** | Payload globals | `ThemeSettings`, `SiteSettings`, `Navigation`, `MarketSettings`. | — |

Transversal: **`@courvia/platform`** (deportes, locales, mercados, monedas, regiones, ids de pasarela). Sin dependencias, del que beben todos. Existe porque la capa de i18n no debe importar el dominio de commerce para saber qué idiomas hay.

Dominio y adaptadores:

```
apps/web ──→ sections ──→ ui ──→ design-tokens
    │            └──→ appearance ──→ design-tokens
    ├──→ platform         (también lo importan dominio y adaptadores)
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

### Un token que no existe no puede pasar desapercibido

`var(--cv-space-5)` estuvo en producción: la escala va 1,2,3,4,6,8,12,16,24 y no tiene paso 5, así que la declaración era inválida en tiempo de cómputo, el `padding` caía al 0 del reset y el texto de las tarjetas se apoyaba en el borde. Ni stylelint (nunca ha leído `tokens.json`) ni los tests de contraste (comparan pares de tokens, no hojas de estilo) podían verlo, y el único test que sí miraba hojas de estilo cubría dos de las tres del repo — precisamente no `sections.css`.

Ahora la guarda recorre las tres y pregunta dos cosas: un nombre usado **sin fallback** tiene que existir, y un nombre **con forma de token** (`--cv-space-…`, `--cv-color-…`) tiene que existir aunque lleve fallback, porque esa forma es una afirmación sobre la escala y el fallback solo la disimula. Las propiedades que declara la capa de apariencia (`--cv-section-measure`, `--cv-reveal-name`, `--cv-scrim`) cuentan como declaradas: no son tokens y no van a serlo.

### Anidamiento

Como los temas son bloques `[data-theme]` de igual especificidad y neutralizan lo que no definen, **un tema dentro de otro funciona**. Esto es lo que permite el modelo aprobado: tema de sitio → override por página → override por sección.

---

## 3. La superficie editable

Referencias reales: **Shopify OS 2.0** (secciones + plantillas JSON), **WordPress `theme.json`** (`settings.blocks` con `custom:false`) y **Builder.io**, cuya formulación es la que seguimos: *las barreras son arquitectónicas, no de política* — un editor no puede romper el sistema de diseño porque solo puede usar lo que ingeniería registró.

### Registro de secciones (WP7)

Un archivo por sección produce las cuatro caras desde **una** declaración, evitando el triple mantenimiento:

```
packages/sections/src/
  blocks/<slug>/index.tsx  # defineSection({ type, labels, group, thumbnail,
                           #                 fields, appearance, fixture, render })
  dsl/                     # DSL neutral de campos + proyección a Zod, más el
                           #   vocabulario que ve el editor: groups.ts (las cuatro
                           #   baldas), thumbnail.ts (el sketch de cada sección),
                           #   href.ts (qué destino se puede escribir) y
                           #   common-fields.ts (formas repetidas, como el par
                           #   texto+destino de un CTA)
  render/                  # SectionRenderer / SectionList (la resiliencia vive aquí)
  registry.ts              # SECTIONS — el registro que consumen tienda y admin
  sections.css             # estilos de sección centralizados (solo tokens y propiedades lógicas)
```

Decisión deliberada: **el DSL neutral de campos del registro es la fuente**, y de él se proyecta todo lo demás. Las secciones no pueden importar Payload (la frontera las mantiene funciones puras de `(contenido, apariencia)`), así que los campos se declaran una vez en ese vocabulario y se proyectan dos veces: al contrato Zod que valida el render y, en `apps/web/src/payload/blocks.ts`, a la config de bloque de Payload que ve el editor. Esa config **nunca se escribe a mano**: es una proyección, no una fuente. El test del registro (`packages/sections/src/registry.test.ts`) mantiene honestas las proyecciones: labels singular y plural en los tres idiomas del admin, **copy por campo** —etiqueta, ayuda, nombre de cada opción de un `select`, nombre de fila de cada `array`— en esos mismos tres, balda declarada, miniatura que se dibuja y que no repite la de otra sección, fixture de oro que satisface su propio contrato, controles de ritmo declarados y rechazo de contenido sin sus campos requeridos.

**Cuántas secciones caben: 24, y 12 por balda** ([ADR-028](adr/ADR-028-section-ceiling.md)). Hoy hay 19 y WP13 suma cuatro vinculadas. La cifra anterior (10-12, CLAUDE.md §5) se escribió cuando el selector era una lista plana de nombres; agrupar y dibujar cambió lo que cuesta encontrar una sección, no lo que cuesta mantenerla. El mismo test lo vigila.

### Controles de apariencia atados a tokens

El vocabulario vive en `packages/appearance/src/controls.ts` y cada sección declara qué controles expone. **Todo control es un enum ligado a un token; ninguno acepta un número, un color o un string libre.** Implementados hoy:

| Control | Valores | Mapea a |
|---|---|---|
| `spaceBlockStart` / `spaceBlockEnd` | `none · sm · md · lg · xl` | `--cv-space-*` (`padding-block`) |
| `background` | `none · surface · raised · inverse · accent` | roles semánticos; `inverse` y `accent` reasignan también texto y borde |
| `width` | `prose · content · full` | `--cv-section-measure` (mide la **columna**, no la banda) |
| `align` | `start · center` (lógico, nunca `left`/`right`) | `text-align`, RTL-seguro |
| `columns` | `2 · 3 · 4` | `--cv-section-columns` |
| `mediaPosition` | `start · end` (lógico) | orden de la rejilla en `mediaText` |
| `height` | `auto · tall · full` | `min-block-size` de la escena |
| `overlay` | `none · soft · strong · gradient` | velo sobre la media, para que el texto encima pase AA |
| `divider` | `none · hairline · soft` | `border-block-start` entre bandas |
| `reveal` | `none · rise · settle` | animación de entrada, **solo transform** |
| `hiddenOn` | `never · mobile · desktop` | visibilidad por breakpoint |
| `themeScope` | `inherit · volt · carbon · club` | `data-theme` anidado |

Trece controles. La fuente de verdad es `controls.ts`, no esta tabla: un test comprueba que todo valor con CSS tiene su regla **y** que ninguna regla sobrevive a un valor retirado.

`reveal` es **solo transform** por una razón aprendida rompiéndola: la primera versión animaba opacidad y una banda entera se quedó invisible en producción. Si la animación no llega a ejecutarse, el peor resultado admisible son 24 px de desplazamiento, nunca contenido que no se ve.

Previstos, **no implementados** (cada uno entrará como una entrada más en esa tabla con su CSS, nunca como valor libre): `gap` · `accentUse` · `radius` · `elevation`.

**Deliberadamente ausentes** — y esta lista *es* el diseño: selectores de color, hex, familias tipográficas, tamaños en px, padding libre, `className`, `style`, CSS a medida, z-index, opacidad.

#### Banda y contenedor: dos elementos, dos trabajos

Una sección se renderiza como **dos** elementos, y la separación es la condición para que exista composición:

```
<section data-cv-section data-bg data-space-* …>   ← la BANDA: pinta y marca el ritmo
  <div class="cv-section-inner">                   ← el CONTENEDOR: mide y centra
    …lo que devuelve render()…
```

La banda **no tiene medida propia**: es tan ancha como la deje su contenedor de página, y por eso `background: surface` puede llegar al borde en vez de flotar como un rectángulo con fondo de página a los lados. El contenedor lleva `max-inline-size: var(--cv-section-measure)` y el padding lateral. Es lo que hacen Webflow (Section + Container), Dawn (`<section class="color-scheme">` + `.page-width`) y `theme.json` (`contentSize` dentro de un grupo `full`) — y lo que ya hacía el propio footer de esta app (`.site-footer` / `.site-footer-inner`) mientras las secciones no.

Consecuencias que conviene tener presentes:

- `width` gobierna **la columna**, no la banda: con `full` la columna se abre hasta el viewport; con `content` la banda sigue sangrando y solo el contenido para a 1180.
- La **medida de lectura** no sale de ahí. `--cv-section-measure` vale `none` en `full`, así que la prosa se acota con `--cv-measure-prose` (un token), nunca con la medida de la banda. Un test lo impide.
- `reveal` anima el **contenedor**. Animar la banda movía el elemento que pinta y abría una costura de hasta 24 px entre dos fondos contiguos; la banda conserva la línea temporal (`view-timeline`) para que la coreografía no cambie.
- Una sección que sangra —la escena— sale del padding del contenedor con un inset lógico negativo y **da a su copy una columna centrada propia**: una banda a sangre sin columna deja el titular a 24 px del cristal en una pantalla de 2560 px.
- El filete de `divider` pasa a trazarse de borde a borde, que es lo que hace un separador de bandas.

**Cómo se renderiza.** Como atributos `data-*` en el envoltorio de la sección, con una hoja CSS generada desde la misma tabla de enums. Tres consecuencias que lo hacen seguro para siempre:

1. La superficie CSS es **acotada y conocida en build** (una veintena de reglas hoy; crece solo al añadir un control, nunca con el contenido). Sin estilos inline, sin CSS-in-JS.
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

### La cabecera y el ancla comparten un número, no una convención

`--cv-header-block-size` es el contrato: la cabecera lo toma como
**`block-size`** —no como `min-block-size`, porque un mínimo se puede exceder
y se excedía— y `html` reserva `scroll-padding-block-start: calc(esa variable
+ --cv-space-4)`. Un ancla y la barra que la tapa dejan así de poder
divergir.

Antes divergían de forma medible: la cabecera envolvía en tres filas y
llegaba a **196 px** a 320, **155** a 390 y **71** a partir de 620, mientras
la reserva era un literal. En móvil el destino de un ancla aterrizaba **74 px
por debajo** del borde de la cabecera, así que el titular al que apuntaba
quedaba invisible. Con la barra a 64 px fijos en los nueve anchos medidos, la
diferencia es 0.

De ahí salen dos reglas que parecen detalles y no lo son:

- **El panel del menú abierto va en `position: absolute`.** Si empujara la
  barra, la altura real dejaría de coincidir con la reservada y el ancla
  volvería a mentir.
- **La barra no envuelve.** El precio está declarado: una etiqueta de CTA muy
  larga escrita en el CMS desbordaría a 320 px. Hoy caben las cuatro regiones
  (`Pide una demo` · `Book a demo` · `اطلب عرضًا`), verificado sin desbordes.
  La navegación de escritorio sí está protegida: desplaza dentro de su caja.

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

### Qué URL existe, y quién lo decide (ADR-026)

Bajo `cacheComponents` una página **no puede fijar su propio status**: el
shell estático ya salió como 200 cuando el componente descubre que el slug no
existe, así que ni `notFound()` ni `permanentRedirect()` pueden emitir un 404
o un 301. Medido en esta versión y documentado por la propia Next
(`03-file-conventions/loading.md`: *«run this check in proxy»*).

Por eso la decisión vive **delante** del render:

```
proxy.ts ──HTTP──> /next/routing   (manifiesto: slugs, productos, categorías, redirecciones)
   │                    ↑ cacheado con las etiquetas "pages" · "catalog" · "redirects"
   ├─ ¿se movió?  → NextResponse.redirect(destino, 301|302)
   ├─ ¿no existe? → NextResponse.rewrite("/_not-found")   → 404 + global-not-found.tsx
   └─ si no       → next()
```

El proxy no habla con Postgres —se empaqueta aparte y corre antes que la
app—, y **falla abierto**: sin manifiesto, todo vuelve al comportamiento
anterior (la página renderiza; un slug ausente sirve el 404 localizado con
200 + `noindex`). Un manifiesto vacío se rechaza por la misma razón: es
indistinguible de un build sin base de datos, y creérselo sería responder 404
en el sitio entero.

---

## 6. Commerce

**Catálogo en colecciones Payload propias** detrás de `CommerceService` (ADR-18). El plugin oficial `@payloadcms/plugin-ecommerce` existe pero está en beta, no cubre impuestos ni envíos —que sí necesitamos— y tiene fallos abiertos de multi-moneda.

**Solo servidor**, en cuatro capas que se refuerzan: access control de Payload · schema Postgres no expuesto al Data API · RLS sin política permisiva para roles anónimos · **y un test que lo demuestra** conectando con la clave publicable y comprobando que no ve nada. Sin ese test las tres primeras capas son aspiraciones.

**La máquina de estados** se conecta así en el adaptador: abrir transacción → bloquear la fila del pedido → **insertar primero la fila de `payments`** apoyándose en `UNIQUE(provider, provider_event_id)` (un duplicado revienta ahí, sin efectos) → `transition()` puro → persistir → ejecutar solo los efectos **transaccionales** → encolar los de **outbox** en la misma transacción → commit → drenar el outbox.

Esa separación es una corrección al contrato original, que pedía todos los efectos dentro de la transacción: un rollback no puede *des-enviar* un email, y una llamada a la pasarela dentro de la transacción retiene un lock durante un viaje de red. `SIDE_EFFECT_EXECUTION` clasifica cada efecto y un test verifica que ninguno queda sin clasificar.

**¿Y si algún día entra una plataforma externa?** Contestado con código, no con opinión: `packages/commerce-shopify` implementa `CommerceService` sobre la Storefront API y pasa `describeCatalogContract`, la misma suite que corre contra el adaptador propio. La mitad de catálogo es portable; la de checkout no existe para serlo, porque Shopify aloja su checkout y emite sus pedidos — ahí el adaptador lanza `NotImplementedError`, que es lo que el contrato del dominio autoriza. Qué muere (máquina de estados, outbox, puerto de pagos) y qué sobrevive (todo el CMS, temas, secciones, i18n, SEO, leads) está en [`docs/adr/ADR-024-commerce-portability.md`](adr/ADR-024-commerce-portability.md). Ninguna ruta puede importar ese paquete: es un estudio verificado, no una integración.

---

## 7. Verificación

| Nivel | Cubre |
|---|---|
| `pnpm arch` | Las fronteras de §1, cada una probada contra su violación **con la dependencia declarada** (ver el aviso de §1) |
| `pnpm stylelint` | Nada de hex crudo, nada de propiedades físicas |
| Lint con tipos | `no-floating-promises`, `no-misused-promises`, Rules of Hooks |
| Vitest | Dominio, `Money`, contrato semántico, **contraste AA en 3 temas**, compilador de tokens, **invariantes de `sections.css`** (medida de lectura acotada, 1.0 solo en versales, tracking por token, la entrada anima el contenedor y no la banda) |
| Suites de contrato | Todo adaptador prueba que el puerto es implementable |
| Playwright *(WP16)* | Checkout por mercado y proveedor, RMA, desistimiento |
| Storybook + visual *(WP16)* | Secciones × 3 temas × LTR/RTL |
| axe *(WP16)* | AA en los 3 temas y en RTL |

Las suites de contrato son la pieza de mayor apalancamiento: se exportan desde el dominio como factorías, y cualquier adaptador futuro corre exactamente los mismos tests. Es lo que convierte "cambiar Stripe por Adyen sin tocar el dominio" (ADR-13) en algo verificado en vez de prometido.

---

## 8. Estado y secuencia

Hecho: monorepo · tokens con contrato semántico y contraste garantizado · primitivas sin escape hatches · puertos implementables con suites de contrato · `Money` · máquina de estados con outbox y códigos de razón · fronteras verificadas · CI (con Postgres real: migra + siembra + test de contrato del adaptador) · **Payload 3.88 embebido** (admin en `/admin`, schema `payload` en Supabase con RLS, `push:false` — solo migraciones, localización es/en/ar) · **catálogo completo** (`categories`/`products`/`variants`/`prices`/`inventory`/`leads`; precios/inventario/leads solo-servidor; precios fijos por mercado en unidades menores) · **adaptador `commerce-payload`** pasando la suite de contrato contra Postgres real vía el composition root · **rutas `/robots` y `/robots/[slug]`** cacheadas por tags con revalidación desde hooks · **captación de leads** (server action validada, honeypot, consentimiento) · **live preview + draft mode en páginas y en productos** (`/next/preview` autenticado con payload.auth, sin secreto compartido; la PDP lee el borrador con `getDraftRobot` y la mitad de commerce —variantes, precios, existencias— sigue siendo la viva, porque no tiene versiones) · **SEO por página + redirecciones editoriales + 404 real** (ADR-026: cadena de respaldo en un módulo, tarjeta OG generada desde tokens, `redirects` creadas al renombrar y resueltas en el proxy).

Pendiente, en orden (cada paquete = una sesión):

| WP | Trabajo | Requiere | Reversible |
|---|---|---|---|
| ~~6~~ | ~~Payload embebido + Supabase schema `payload`, admin logueable~~ **hecho 19-ago** | — | — |
| ~~4/5~~ | ~~Rutas `[region]`, `next-intl`, `dir`/`lang`, hreflang~~ **hecho 19-ago** (+ proxy de negociación, sitemap, robots, llms.txt, JSON-LD) | — | — |
| ~~9~~ | ~~Tema desde CMS con `cacheTag` + preview en draft mode~~ **hecho 19-ago** · quedan overrides Zod de tokens | 6, 4 | sí |
| ~~7~~ | ~~Registro de secciones + controles de apariencia + Hero/RichText/CTABand~~ **hecho 19-ago** | 9 | — |
| ~~8~~ | ~~`pages` + composición + versiones + live preview~~ **hecho 19-ago** | 7 | — |
| ~~10/11~~ | ~~Catálogo + precios/inventario solo-servidor + RLS~~ **hecho 19-ago** (aprobación explícita del propietario) | 6 | — |
| ~~12~~ | ~~`commerce-payload` contra las suites de contrato~~ **hecho 19-ago** (catálogo; checkout rechaza `NotImplementedError` hasta S2) | 10, 11 | — |
| 13 | Plantillas (PDP editable como plantilla, secciones *binding*) + comparador | 8, 12 | parcial |
| 14 | Resto de secciones (SpecsTable/LeadForm/etc. como bloques) | 7, 13 | parcial |
| ~~15a~~ | ~~Fontanería de pagos: orders/payments/outbox/returns, checkout transaccional, webhook `/next/webhooks/{provider}`, registro multi-proveedor, Stripe verify+normalize~~ **hecho 19-ago** (circuito completo verde con el proveedor fake) | 12 | — |
| 15b | Conectar Stripe: SDK + createSession/refund + credenciales | 15a | **no** + aprobación humana |
| 16 | Playwright, axe, regresión visual, jobs de CI separados | 7, 14 | sí |

**Los WP 6, 4/5, 10/11 y 15 son los caros de cambiar después.** El resto es aditivo.
