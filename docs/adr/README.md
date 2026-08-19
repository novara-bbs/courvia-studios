# ADRs — Architecture Decision Records

Registro de decisiones estructurales **nuevas o que se desvíen de CLAUDE.md**. Las decisiones ya aprobadas en el documento maestro (ADR-01…14 resumidas en CLAUDE.md §20.1) no requieren ADR adicional; si alguna se revisa, el cambio se documenta aquí y se actualiza CLAUDE.md para que repo y documento no digan cosas distintas.

## Índice

| ADR | Título | Estado |
|---|---|---|
| [ADR-000](./ADR-000-versions.md) | Versiones pineadas del stack | aceptado |
| [ADR-015](./ADR-015-theme-from-cms.md) | El tema activo es contenido del CMS, no una cookie | aceptado |
| [ADR-016](./ADR-016-section-registry.md) | Registro de secciones y controles de apariencia atados a tokens | aceptado |
| [ADR-017](./ADR-017-package-split-by-port.md) | Un paquete por puerto, nunca por proveedor | aceptado |
| [ADR-018](./ADR-018-catalog-in-own-collections.md) | Catálogo en colecciones propias, no en el plugin oficial | aceptado |
| [ADR-019](./ADR-019-platform-vocabulary.md) | `@courvia/platform` para el vocabulario transversal | aceptado |

## Convención

- Archivo: `ADR-NNN-slug.md` · secciones: Estado · Fecha · Contexto · Decisión · Justificación · Consecuencias.
- Un ADR por decisión; los cambios de una decisión previa crean un ADR nuevo que la reemplaza (no se reescribe la historia).
