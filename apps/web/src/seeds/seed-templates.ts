/**
 * La plantilla de ficha de producto, en el CMS y no solo en Git.
 *
 * `DEFAULT_PRODUCT_TEMPLATE` (src/catalog/product-template.ts) es el ÚLTIMO
 * eslabón de la cadena de tres: la plantilla que el producto señala, la
 * plantilla por defecto del CMS, y ese array. El array tiene que quedarse —
 * es lo que impide que una base de datos recién creada sirva un `<main>`
 * vacío para todo el catálogo.
 *
 * Pero mientras la tabla `templates` esté vacía, el array es lo ÚNICO que
 * manda, y eso convierte «la ficha de producto es editable» en una promesa
 * que solo cumple quien sepa de antemano qué cinco secciones hay que crear y
 * en qué orden. Un editor abre Plantillas, ve una lista vacía y no tiene por
 * dónde empezar. Esa distancia entre lo declarado y lo usable era el hallazgo
 * (#16 de la auditoría).
 *
 * Esta semilla la cierra: crea la plantilla por defecto con exactamente los
 * bloques del array, así que el panel enseña de entrada la ficha que ya se
 * está sirviendo, y reordenarla o intercalarle una sección de marketing es un
 * arrastre. Cambiar nada no cambia nada — la salida es idéntica antes y
 * después de sembrarla, y eso es lo que la hace segura de correr.
 *
 *   pnpm --filter @courvia/web seed:templates
 *
 * IDEMPOTENTE, y de la única forma que sirve aquí: si ya hay una plantilla
 * `product` marcada por defecto, no la toca. Sobrescribirla borraría el
 * trabajo de un editor, que es justo lo que esta semilla existe para
 * habilitar.
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { getPayload } = await import("payload");
const { default: config } = await import("../../payload.config");
const { DEFAULT_PRODUCT_TEMPLATE } = await import("../catalog/product-template");

const payload = await getPayload({ config });

const existing = await payload.find({
  collection: "templates",
  where: { kind: { equals: "product" }, isDefault: { equals: true } },
  limit: 1,
  depth: 0,
  overrideAccess: true,
});

if (existing.docs.length > 0) {
  console.log("Ya hay una plantilla de producto por defecto; no se toca.");
  process.exit(0);
}

const created = await payload.create({
  collection: "templates",
  overrideAccess: true,
  data: {
    name: "Ficha estándar",
    kind: "product",
    isDefault: true,
    // El MISMO array que sirve la recaída. Si alguien añade una sección
    // vinculada allí y no aquí, las bases sembradas y las que no divergen —
    // por eso se importa en vez de copiarse.
    blocks: [...DEFAULT_PRODUCT_TEMPLATE] as never,
  },
});

console.log(
  `Plantilla «Ficha estándar» creada (id ${String(created.id)}) con ${String(DEFAULT_PRODUCT_TEMPLATE.length)} secciones.`,
);
process.exit(0);
