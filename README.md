# courvia-studios
Courvia Studios and Courvia Sports: a training brand for racquet sports — ball-throwing robots, equipment and content for tennis, padel and pickleball across Spain, the UK and the UAE.

## Desarrollo

Reglas permanentes: [`CLAUDE.md`](./CLAUDE.md) — se lee en cada sesión.
Arquitectura: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · Decisiones: [`docs/adr/`](./docs/adr/) · Recetas: [`docs/recipes/`](./docs/recipes/).

```bash
corepack enable          # activa el pnpm pineado en package.json
pnpm install
pnpm dev:db              # levanta el Postgres local en 127.0.0.1:5433 (ver docs/operations.md)
pnpm dev                 # storefront en http://localhost:3000 · admin en /admin
pnpm verify              # build · typecheck · lint · stylelint · arch · test
```

El admin (Payload) necesita Postgres: `pnpm dev:db` levanta el local (en Claude Code web lo hace solo el hook SessionStart). Copia `apps/web/.env.example` a `apps/web/.env.local`, aplica las migraciones con `pnpm --filter @courvia/web migrate` y siembra: primero el admin con `ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter @courvia/web seed:admin`, después el contenido con `pnpm seed` (catálogo → mercados → contenido). Los cambios de schema son siempre migraciones: `pnpm migrate:new <nombre>` (crea el archivo y lo sanea; ver `docs/operations.md`); no hay push de desarrollo.

Requisitos: Node 22 o 24 (`.nvmrc`), pnpm 11 vía corepack.

## Estructura

| Ruta | Qué es |
|---|---|
| `apps/web` | Storefront Next.js 16 (App Router) con Payload 3 embebido (`/admin`) |
| `packages/design-tokens` | Tokens DTCG canónicos + build a CSS variables (`--cv-*`, temas `volt`/`carbon`/`club`) |
| `packages/ui` | Componentes sobre tokens semánticos (nunca hex crudos) |
| `packages/commerce-domain` | Puertos `CommerceService`/`PaymentProvider`, `PaymentEvent` normalizados, máquina de estados de pedidos |
| `packages/platform` | Vocabulario transversal: deportes, locales, mercados, monedas, regiones |
| `packages/commerce-payload` | Adaptador de `CommerceService` (persistencia y catálogo) |
| `packages/payments-stripe` | Adaptador de `PaymentProvider` (pasarela) |
| `packages/config` | tsconfig/eslint compartidos |
| `brand/` | Activos de marca originales (congelados; ver `brand/README.md`) |
| `docs/` | ADRs, máquina de estados y documentación operativa |
