# ADR-025 · Regiones publicadas y regiones preparadas

- **Estado:** aceptado · **Fecha:** 2026-08-20 · **Nuevo**
- **Extiende** [ADR-020](./ADR-020-region-routing.md) (regiones en la URL) e
  **implementa** ADR-09 (árabe: legal primero, UI comercial después) en el
  código en lugar de dejarlo escrito en `docs/markets.md` §9.4.

## Contexto

`ar-ae` era una región como las otras tres: se generaba estáticamente, entraba
en el sitemap, se anotaba `hreflang="ar-AE"`, la enlazaba el selector del pie
y la sugería la negociación de idioma. El contenido sembrado, en cambio, era
solo `es`/`en`, así que todas esas URLs servían el **fallback en español bajo
`lang="ar"`**.

Eso no es una carencia, es una **afirmación falsa**. Search Console la lee
como alternativa de idioma incorrecta y hreflang se evalúa **por clúster**: el
castigo no se queda en `/ar-ae`, alcanza a `en-ae`, que es un mercado real en
el que pensamos vender. Y contradecía ADR-09, que dice explícitamente que la
fase 1 sirve EAU en inglés.

Las dos salidas malas:

- **Borrar `ar-ae` del registro.** Se lleva por delante el único árbol RTL que
  el build compila. Las propiedades lógicas CSS, el `dir` en `<html>`, el
  catálogo `ar.json` y el layout invertido dejarían de ejercitarse el mismo
  día, y se pudrirían en silencio hasta que alguien intentara publicarlos.
- **Traducir a máquina y publicar.** Prohibido por
  `.claude/rules/content-voice.md`, y peor para el SEO que no tener nada.

## Decisión

`RegionDefinition` gana un campo **obligatorio** `status: "published" |
"prepared"`.

- **`published`** — la región es real: entra en el sitemap, forma parte del
  clúster hreflang, la enlaza el selector, es indexable.
- **`prepared`** — la ruta, el layout, la dirección y el catálogo de mensajes
  existen y **los compila el build**; el contenido no. Se prerenderiza, es
  navegable escribiendo su URL, y **no se declara en ninguna parte**: sin fila
  en el sitemap, sin anotación hreflang (tampoco saliente), sin enlace en el
  selector público, sin cita en `llms.txt` ni en el 404 global, y con
  `noindex, nofollow` en todas sus páginas.

`ar-ae` queda `prepared`. **Publicar árabe es cambiar ese valor y nada más.**

De la tabla se derivan `PUBLISHED_REGIONS`, `PREPARED_REGIONS`,
`isPublishedRegion()` y `publishedRegionFor()`; ninguna superficie vuelve a
escribir una lista de regiones a mano.

### Estático, no derivado del contenido

La condición honesta sería "¿hay contenido real en este idioma?", y se
descarta a propósito. Vive en Postgres, y todos los consumidores de la
bandera —sitemap, metadatos, proxy, chrome— corren en build: preguntárselo a
la base de datos es exactamente el acoplamiento silencioso que estamos
quitando en otro frente. El sustituto disponible en build —"¿existe su
catálogo de mensajes?"— sería **peor que inútil**: los catálogos cubren solo
el chrome de la UI, así que un `ar.json` completo daría la región por
publicada mientras cada ficha de producto sigue renderizando el fallback
español. Salir a producción es una decisión editorial y legal (ADR-09 pone
primero los documentos legales en árabe); la toma una persona y la escribe.

Lo verificable en build sí se verifica: que toda región declare estado, que
`PUBLISHED` y `PREPARED` particionen el registro, que la región por defecto
—destino del `x-default`— esté publicada, y que las cuatro superficies no
nombren jamás una región preparada.

### Tres consecuencias que parecen detalles y no lo son

1. **`noindex`, nunca `Disallow` en `robots.txt`.** Una URL bloqueada no se
   descarga, así que el `noindex` no se llega a leer nunca y la URL puede
   quedarse indexada sin descripción. Para poder echar a una página hay que
   dejar que la rastreen.
2. **El `noindex` va en el layout de `[region]`, no en cada página.** Es la
   única clave de metadatos donde la herencia de Next juega a favor:
   indexabilidad es propiedad de la **región**, así que se declara una vez y
   no hay forma de olvidarla en la próxima ruta. El canonical y el hreflang
   siguen yendo página a página por la razón contraria de siempre.
3. **Una región preparada no emite hreflang ni siquiera saliente.** hreflang
   es recíproco: si las páginas publicadas ya no la nombran, anotar hacia
   ellas produce el error "no return tags" en vez de una cortesía.

### Selector y negociación

**El selector público no muestra una región preparada.** Para un rastreador
ese pie es un bloque de enlaces `hrefLang` repetido en cada página: dejarlo
volvería a declarar, sitio entero, el árabe que el sitemap acaba de dejar de
reclamar. Para una persona es peor todavía — pulsar «العربية» y aterrizar en
prosa castellana bajo `lang="ar"` es una promesa que no podemos cumplir.
Mientras corre `next dev` sigue a un clic, para poder mirar el RTL; en
cualquier build de producción se llega escribiendo la URL, que es todo lo que
necesitan un test o una revisión y no es una declaración a nadie.

**La negociación sigue sugiriendo y nunca forzando** (`docs/markets.md` §9),
pero sugiere solo regiones publicadas: `publishedRegionFor()` manda un
navegador en árabe a `/en-ae` —mismo mercado, idioma que sí publicamos— en vez
de a una página que hemos marcado `noindex` y cuyo cuerpo está en español. Un
enlace profundo a `/ar-ae` no se reescribe, como siempre.

## Consecuencias

- Publicar un idioma es un valor, no una cacería de literales por cuatro
  superficies. Y abrir una región nueva obliga a decidir: el campo es
  obligatorio, una región sin estado no compila.
- El trabajo de RTL sigue vivo y verificado: `generateStaticParams` mantiene
  las cuatro regiones, así que CI sigue compilando el árbol invertido.
- Coste asumido: se prerenderiza un árbol que nadie va a indexar. Es el precio
  de que la dirección del texto no se pudra, y es reversible el día que moleste.
- El estado es una bandera declarada. Si alguien la pone en `published` sin
  que exista el contenido, vuelve el problema entero — por eso el test que la
  fija cita ADR-09 y por eso el registro es el único sitio donde tocar.
