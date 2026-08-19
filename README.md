# courvia-studios
Courvia Studios and Courvi Sports is a lifestyle brand focus on raquet sports and selling ball robots and other sports equipment

## Desarrollo

Documento maestro: [`CLAUDE.md`](./CLAUDE.md) (arquitectura, reglas duras, roadmap). Decisiones nuevas: [`docs/adr/`](./docs/adr/).

```bash
corepack enable          # activa el pnpm pineado en package.json
pnpm install
pnpm build               # turbo: tokens CSS → Next build
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @courvia/web dev   # storefront en http://localhost:3000
```

Requisitos: Node 22 o 24 (`.nvmrc`), pnpm 11 vía corepack.

## Estructura

| Ruta | Qué es |
|---|---|
| `apps/web` | Storefront Next.js 16 (App Router; Payload embebido llegará en su tarea) |
| `packages/design-tokens` | Tokens DTCG canónicos + build a CSS variables (`--cv-*`, temas `volt`/`carbon`/`club`) |
| `packages/ui` | Componentes sobre tokens semánticos (nunca hex crudos) |
| `packages/commerce-domain` | Puertos `CommerceService`/`PaymentProvider`, `PaymentEvent` normalizados, máquina de estados de pedidos |
| `packages/commerce-stripe-supabase` | Adaptador Stripe+Supabase (workspace preparado; implementación en S2) |
| `packages/config` | tsconfig/eslint compartidos |
| `brand/` | Activos de marca originales (congelados; ver `brand/README.md`) |
| `docs/` | ADRs, máquina de estados y documentación operativa |
