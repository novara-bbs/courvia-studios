# ADR-015 · El tema activo es contenido del CMS, no una cookie de visitante

- **Estado:** aceptado · **Fecha:** 2026-08-19
- **Desvía de:** la implementación de S0, no del documento maestro (CLAUDE.md §5 ya decía "Global `ThemeSettings` de Payload, una sola fuente de verdad").

## Contexto

El esqueleto de S0 resolvía el tema leyendo una cookie `cv-theme` en el layout raíz, con un conmutador público en la home. Dos problemas:

1. **Contradice §5.** Los tres temas son *contextos de marca* (volt = sitio principal, carbon = fabricante, club = Courvia Club), no una preferencia del visitante. Quien elige el tema es quien edita la marca, en `/admin`.
2. **Bloquea PPR para toda la tienda.** La guía de migración de Next 16 lo dice literalmente: cuando una cookie gobierna un atributo de `<html>` en el layout raíz, leerla en servidor vuelve todo el subárbol dependiente de la petición y no queda hijo que envolver en `<Suspense>`. Con precios y catálogo por delante, renunciar al shell estático es caro.

## Decisión

Precedencia, de menor a mayor: default compilado → `ThemeSettings.activeTheme` (global de Payload, leído en un ámbito `use cache` con `cacheTag("theme")`) → override de página → `appearance.themeScope` de sección. La cookie sobrevive **solo** dentro de draft mode, para la vista previa.

El override de página se estampa en un envoltorio dentro de `<body>`, no en `<html>`, para que el shell estático y el conjunto de fuentes precargadas dependan solo del tema de sitio.

Los overrides de token son una whitelist Zod cuyos valores son enums ligados a primitivas; se emiten como un `<style>` en `<head>` dentro del layout cacheado: sin FOUC, sin JS de cliente y acotado por construcción.

Se retira el conmutador público de tema. La exploración de los tres temas vive en Storybook y en la preview del admin.

## Consecuencias

- La tienda vuelve a ser estática/PPR; publicar un cambio de tema invalida por tag.
- Los temas anidados (página, sección) siguen funcionando porque los bloques `[data-theme]` tienen igual especificidad y neutralizan lo que no definen.
- Coste: la vista previa necesita una ruta de draft mode con token firmado.
