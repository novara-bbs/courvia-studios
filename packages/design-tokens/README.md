# @courvia/design-tokens

Tokens de diseño canónicos (formato DTCG) + script tipado que los compila a CSS variables.

- `tokens.json` — copia de trabajo de `brand/courvia-tokens.json` (la fuente canónica). Un test de paridad falla si divergen: cualquier cambio de tokens se hace primero en `brand/` y se copia aquí en el mismo commit.
- `pnpm build` → `dist/tokens.css`:
  - primitivos globales en `:root` como `--cv-<ruta>` (p. ej. `--cv-color-volt-400`);
  - un bloque por tema con el alias corto de `data-theme` (`volt` · `carbon` · `club` → claves canónicas `volt-precision` · `carbon-drive` · `club-real`);
  - `volt` se aplica también a `:root` a pelo (default dark-first, sin FOUC);
  - las referencias a primitivos se emiten como `var(--cv-…)`, los literales tal cual.
- Consumo: `import "@courvia/design-tokens/tokens.css"` (requiere build previo; `turbo` lo ordena vía `dependsOn: ^build`) y `import { THEME_ALIASES, DEFAULT_THEME } from "@courvia/design-tokens"`.

Nota: el `courvia-tokens.css` del lote de marca original no llegó a entregarse; este package es quien genera el CSS derivado (decisión registrada en `brand/README.md`). Sin Style Dictionary de momento (ADR-12): script propio mientras la única plataforma sea web.
