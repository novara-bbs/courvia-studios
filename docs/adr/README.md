# ADRs — Architecture Decision Records

Registro de decisiones estructurales **nuevas o que se desvíen de CLAUDE.md**. Las decisiones ya aprobadas en el documento maestro (ADR-01…14 resumidas en CLAUDE.md §7) no requieren ADR adicional; si alguna se revisa, el cambio se documenta aquí y se actualiza CLAUDE.md para que repo y documento no digan cosas distintas.

## Índice

| ADR | Título | Estado |
|---|---|---|
| [ADR-000](./ADR-000-versions.md) | Versiones pineadas del stack | aceptado |
| [ADR-015](./ADR-015-theme-from-cms.md) | El tema activo es contenido del CMS, no una cookie | aceptado |
| [ADR-016](./ADR-016-section-registry.md) | Registro de secciones y controles de apariencia atados a tokens | aceptado |
| [ADR-017](./ADR-017-package-split-by-port.md) | Un paquete por puerto, nunca por proveedor | aceptado |
| [ADR-018](./ADR-018-catalog-in-own-collections.md) | Catálogo en colecciones propias, no en el plugin oficial | aceptado |
| [ADR-019](./ADR-019-platform-vocabulary.md) | `@courvia/platform` para el vocabulario transversal | aceptado |
| [ADR-020](./ADR-020-region-routing.md) | Regiones compuestas en la URL: `/es`, `/en-gb`, `/en-ae`, `/ar-ae` | aceptado |
| [ADR-021](./ADR-021-cms-commerce.md) | Commerce en el CMS: marcas, estados de lanzamiento y bloques de catálogo | aceptado |
| [ADR-022](./ADR-022-real-portfolio-evidence.md) | Catálogo real Tempo/Go/Rally con régimen de evidencia por cifra | aceptado |
| [ADR-023](./ADR-023-composition-vocabulary.md) | Vocabulario de composición: por qué no hay bloque de HTML libre | aceptado |
| [ADR-024](./ADR-024-commerce-portability.md) | Portabilidad del puerto de commerce: catálogo sí, checkout no | aceptado |
| [ADR-025](./ADR-025-prepared-regions.md) | Regiones publicadas y regiones preparadas (`ar-ae` no se declara) | aceptado |
| [ADR-026](./ADR-026-page-seo-and-redirects.md) | SEO por página, redirecciones editoriales y un 404 que devuelve 404 | aceptado |
| [ADR-027](./ADR-027-fulfilment-as-a-document.md) | El envío es un documento, no un botón | aceptado |
| [ADR-028](./ADR-028-section-ceiling.md) | El techo de secciones sube a 24, y un test lo vigila | aceptado |

## Convención

- Archivo: `ADR-NNN-slug.md` · secciones: Estado · Fecha · Contexto · Decisión · Justificación · Consecuencias.
- Un ADR por decisión; los cambios de una decisión previa crean un ADR nuevo que la reemplaza (no se reescribe la historia).
