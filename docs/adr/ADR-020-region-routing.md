# ADR-020 · Regiones compuestas en la URL: `/es`, `/en-gb`, `/en-ae`, `/ar-ae`

- **Estado:** aceptado · **Fecha:** 2026-08-19
- **Concreta** CLAUDE.md §9 (subrutas por locale) resolviendo lo que el doc
  dejaba implícito: la unidad de ruta es la **región** (idioma × mercado), no
  el idioma.

## Contexto

UK y EAU comparten idioma (EN) pero difieren en moneda, impuestos, envíos y
SEO. Las dos alternativas malas: (a) `[locale]` + cookie de mercado — la
cookie no se indexa, no puede llevar hreflang y fuerza render dinámico de
toda página con precio; (b) ccTLDs — descartados ya en ADR-02.

## Decisión

Segmento raíz `[region]` con tabla cerrada en `@courvia/platform`
(`REGION_DEFINITIONS`): id, locale, market, currency, dir y hreflang. Cada
región es una URL indexable con su hreflang y su `x-default` (→ `/es`).

- El **proxy** solo prefija rutas sin región (negociación por
  `Accept-Language` que **sugiere, nunca fuerza**); un deep link a una región
  jamás se reescribe. El selector del pie enlaza las cuatro.
- `next-intl` sin su middleware: el locale llega explícito desde el segmento
  (`getTranslations({ locale })`), así que las páginas prerenderizan
  estáticas (PPR) — el patrón que la propia documentación de next-intl
  recomienda hoy frente a `setRequestLocale` (legacy).
- Añadir una región = una entrada en el registro + catálogo de mensajes si el
  idioma es nuevo (receta `add-market`).

## Consecuencias

- Las URLs quedan fijadas ANTES de indexar nada — cambiar esto después de
  tener tráfico es lo más caro del proyecto.
- El mercado viaja en la clave de caché gratis: precios cacheables por región.
- Coste: cuatro árboles de rutas en sitemap/hreflang que crecen con el
  catálogo; lo genera código, no mantenimiento manual.
