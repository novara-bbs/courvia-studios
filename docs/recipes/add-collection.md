# Receta · Añadir una colección de Payload

Así se han añadido las colecciones existentes (catálogo, leads, commerce). Referencias reales: `apps/web/src/payload/catalog.ts` (acceso público vs solo-servidor, hooks de revalidación) y `apps/web/src/payload/commerce.ts` (solo-servidor estricto).

## Decisiones previas

- **¿Quién la lee?** Es la decisión que lo condiciona todo:
  - *Pública* (la tienda la navega por REST implícito): `read: anyone` o, con borradores, `read` filtrado por `_status: published` (ver `Products`).
  - *Solo-servidor* (precios, inventario, PII): `read: isAuthenticated` o `isAdmin`; la tienda la lee **solo** a través del adaptador (`CommerceService`, Local API con `overrideAccess`), nunca por REST/GraphQL público. Datos personales → lectura `isAdmin` (ver `Leads`).
- **¿La lee el frontend cacheado?** Entonces necesita hooks de revalidación (paso 1).
- Los nombres de `slug` y de campos se guardan en la base de datos: renombrarlos después es una migración.

## Pasos

1. **Define la colección en `apps/web/src/payload/`** (archivo propio o el del grupo temático):
   - `access`: política **explícita** por operación con los predicados de `access.ts` (`anyone`, `isAuthenticated`, `isAdmin`, `isAdminOrSelf`); ninguna colección hereda un default.
   - `admin.group` (`Catálogo`, `Comercio`, …), `admin.useAsTitle`, `defaultColumns` y `description` — la descripción documenta la política ("SOLO SERVIDOR…") donde el editor la ve.
   - `localized: true` en todo texto visible por el usuario; slugs con validación kebab-case; `index: true` en lo que se busca; `unique` donde el modelo lo exige (mejor aún, `indexes` compuestos como `prices` con `[variant, market]`).
   - Si el frontend la lee: hooks `afterChange`/`afterDelete` que revaliden los cache tags (ver `catalog-revalidation.ts`; `catalogHooks("product" | "variant")` si cuelga del catálogo). Con borradores, revalida solo cuando hay versión publicada por medio (ver `affectsPublished` en `catalog.ts`).
   - **Si tiene borradores, tiene previsualización, y las dos mitades van juntas.** `versions.drafts` sin `admin.livePreview.url` es escribir a ciegas; declarar la URL sin que la ruta lea borradores es peor, porque el iframe enseña lo publicado mientras el editor teclea en un borrador que se autoguarda. Las dos mitades son: un lector de borrador en la app (`getDraftPage`, `getDraftRobot`) y la rama `draftMode()` en la ruta, con `DraftModeBar` y `RefreshRouteOnSave`. La URL siempre a través de `previewUrl()` (`src/payload/preview.ts`), que entra por `/next/preview` — autenticado con `payload.auth`, sin secreto compartido. Los anchos de dispositivo salen de `admin.livePreview` en `payload.config.ts`: la colección solo pone la URL.
2. **Regístrala en `apps/web/payload.config.ts`**, en el array `collections`.
3. **Crea la migración** desde la raíz del repo: `pnpm migrate:new <nombre_snake_case>` (genera el archivo y sanea imports y firmas; el proyecto va con `push: false`, así que sin migración no hay tabla).
4. **Aplícala en local y regenera tipos:** `pnpm --filter @courvia/web migrate && pnpm --filter @courvia/web generate:types`. Commitea la migración (`.ts` **y** `.json`) **y también** `src/migrations/index.ts` (el generador lo regenera).
5. **Reglas duras al llegar a Supabase** (`.claude/rules/database.md`): las tablas viven en el schema `payload`, no expuesto al Data API, y llevan **RLS deny-all**. La aplicación a producción va **únicamente por el flujo aprobado con humano** — nunca desde una sesión de agente. Si la colección contiene dinero o PII, añádela a `SENSITIVE_TABLES` en `apps/web/src/server/data-api-exposure.test.ts`: es el test que demuestra que no se filtra con la clave publicable.
6. **Seed si procede:** script idempotente en `apps/web/src/seeds/` (se niega a tocar datos existentes; ver `seed-content.ts`) con su entrada `seed:*` en `apps/web/package.json`.
7. **Verifica:**

```bash
pnpm verify
```

## Prohibido

- Aplicar la migración a producción desde la sesión (ni por MCP ni por CLI). Solo CI con aprobación explícita.
- Exponer por REST público una colección con precios, inventario, pedidos o datos personales.
- Editar a mano `src/migrations/index.ts` sin commitear el resto de archivos generados: van juntos o la migración no existe.
