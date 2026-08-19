# courvia-studios
Courvia Studios and Courvia Sports: a training brand for racquet sports — ball-throwing robots, equipment and content for tennis, padel and pickleball across Spain, the UK and the UAE.

## Desarrollo

Reglas permanentes: [`CLAUDE.md`](./CLAUDE.md) — se lee en cada sesión.
Arquitectura: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · Decisiones: [`docs/adr/`](./docs/adr/) · Recetas: [`docs/recipes/`](./docs/recipes/).

```bash
corepack enable          # activa el pnpm pineado en package.json
pnpm install
pnpm verify              # build · typecheck · lint · stylelint · arch · test
pnpm dev                 # storefront en http://localhost:3000 (turbo compila los tokens antes)
```

Requisitos: Node 22 o 24 (`.nvmrc`), pnpm 11 vía corepack.

## Estructura

| Ruta | Qué es |
|---|---|
| `apps/web` | Storefront Next.js 16 (App Router; Payload embebido llegará en su tarea) |
| `packages/design-tokens` | Tokens DTCG canónicos + build a CSS variables (`--cv-*`, temas `volt`/`carbon`/`club`) |
| `packages/ui` | Componentes sobre tokens semánticos (nunca hex crudos) |
| `packages/commerce-domain` | Puertos `CommerceService`/`PaymentProvider`, `PaymentEvent` normalizados, máquina de estados de pedidos |
| `packages/platform` | Vocabulario transversal: deportes, locales, mercados, monedas, regiones |
| `packages/commerce-payload` | Adaptador de `CommerceService` (persistencia y catálogo) |
| `packages/payments-stripe` | Adaptador de `PaymentProvider` (pasarela) |
| `packages/config` | tsconfig/eslint compartidos |
| `brand/` | Activos de marca originales (congelados; ver `brand/README.md`) |
| `docs/` | ADRs, máquina de estados y documentación operativa |
