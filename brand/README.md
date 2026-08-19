# brand/ — Activos originales de marca

Archivo de los activos de identidad tal y como los entregó el propietario (19 ago 2026). **No se editan**: son la referencia congelada de la exploración de marca. Su transformación en artefactos de código vive en `packages/design-tokens`.

| Archivo | Rol |
|---|---|
| `courvia-tokens.json` | **Fuente canónica** de los valores de design tokens (formato DTCG). Manda sobre cualquier otro artefacto en valores exactos. |
| `courvia-guia-de-marca.pdf` / `.docx` | Guía de marca: reglas visuales y aplicaciones (manda en reglas de uso). |
| `courvia-brand-boards.html` | Board interactivo de las 3 direcciones. Referencia derivada, no canónica. |

**Nota de ingestión:** el lote original mencionaba también `courvia-tokens.css`; ese archivo **no llegó a entregarse** y, por decisión del propietario, no se recrea a mano: es un artefacto derivado que genera `packages/design-tokens` a partir del JSON canónico (`pnpm --filter @courvia/design-tokens build`).

**Mapeo de temas:** las claves del JSON (`volt-precision` · `carbon-drive` · `club-real`) se exponen en la web con los alias cortos `volt` · `carbon` · `club` (atributo `data-theme`, ver CLAUDE.md §5).
