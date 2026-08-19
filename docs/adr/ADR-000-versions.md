# ADR-000 · Versiones pineadas del stack

- **Estado:** aceptado
- **Fecha:** 2026-08-19
- **Contexto:** CLAUDE.md §3 exige pinear versiones exactas en S0 tras verificarlas contra fuentes oficiales (no de memoria). Todas las versiones de abajo se consultaron contra el registro npm el 2026-08-19.

## Decisión

| Herramienta | Versión pineada | Verificación (npm, 2026-08-19) |
|---|---|---|
| Node.js | **22.x** (contenedor: 22.22.2) | `engines`: `^22.11.0 \|\| ^24.0.0` (CLAUDE.md: Node 22/24) |
| pnpm | **11.22.0** | `latest`; activado vía corepack (`packageManager`) |
| Turborepo | **2.10.11** | `latest` |
| TypeScript | **5.9.3** | Ver justificación abajo (no 7.0.2) |
| Next.js | **16.3.1** | `latest` de la serie 16.x estable |
| React / React DOM | **19.2.8** | `latest`; dentro del peer range de Next 16 (`^19.0.0`) |
| Payload | **3.88.0** *(objetivo; se instala en su tarea)* | `latest`; `@payloadcms/next@3.88.0` acepta `next >=16.2.6 <17` ✔ compatible con 16.3.1 |
| Vitest | **4.1.11** | `latest` |
| tsx | **4.23.12** | `latest` |
| Zod | **4.4.3** *(objetivo; se instala en su tarea)* | `latest`; re-verificar al instalarlo |
| @types/node | **22.20.1** | Última 22.x, alineada con el runtime Node 22 (el `latest` 26.x tipa APIs que no existen en 22) |
| ESLint | **10.8.1** | `latest`; soportado por typescript-eslint (`^10.0.0`) |
| typescript-eslint | **8.67.0** | `latest` |
| next-intl | **4.13.7** *(objetivo; se instala en su tarea)* | `latest` |

## Justificación de las decisiones no obvias

1. **TypeScript 5.9.3, no 7.0.2.** El `latest` del registro es TS 7 (compilador nativo), pero `typescript-eslint@8.67.0` declara `peerDependencies: typescript >=4.8.4 <6.1.0`. Adoptar TS 7 hoy rompería el lint del monorepo y arriesga incompatibilidades con el resto del ecosistema (Payload genera tipos, Next transpila). Se pinea la última 5.x de mantenimiento y se abre gate de upgrade cuando typescript-eslint y Payload declaren soporte de TS ≥6/7.
2. **Payload 3.88.0 como objetivo, no instalado aún.** La compatibilidad con Next 16.3.1 está verificada por peer range, pero Payload solo se instala en su tarea del roadmap (necesita decisión de schema en Supabase). Re-verificar `latest` en ese momento.
3. **pnpm por `packageManager` + corepack**, de modo que CI y cualquier máquina usan exactamente 11.22.0 con independencia del pnpm global instalado.
4. **Sin rangos abiertos**: todas las dependencias se guardan exactas (`save-exact=true` en `.npmrc`); las subidas de versión son diffs de lockfile revisables, nunca implícitas.

## Consecuencias

- Los upgrades son explícitos y auditables (renovar este ADR o anotarlo al cierre de sprint).
- TS 7 queda como upgrade futuro condicionado al ecosistema; ningún código del monorepo debe depender de features exclusivas de TS ≥6.
