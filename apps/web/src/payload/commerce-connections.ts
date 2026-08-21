/**
 * Dónde vive la propiedad de una transacción (ADR-029, Fase 2).
 *
 * Hasta ahora `apps/web/src/server/container.ts` resolvía el dueño desde una
 * constante y lo decía en voz alta: «`NATIVE_CONNECTION` es la conexión
 * activa escrita en configuración… la sustituye una consulta al binding
 * activo del sitio». Este fichero es esa consulta y las filas que la
 * responden.
 *
 * Cuatro entidades y una regla por cada una:
 *
 *  - `commerce-connections` — a qué motor concreto está conectado un
 *    storefront. **Metadatos, jamás un secreto**: `secretRef` nombra una
 *    variable de entorno o una ruta de gestor, y la base de datos rechaza
 *    cualquier cosa que se parezca a un token (ver la migración).
 *
 *  - `commerce-bindings` — cuál de esas conexiones sirve los carritos
 *    NUEVOS de un sitio. **No se edita en sitio**: cambiar de motor es
 *    insertar una revisión nueva. Eso no es una convención de este comentario,
 *    son tres cosas en Postgres: las columnas de identidad son inmutables por
 *    trigger, el estado solo avanza (verified → active → draining → retired) y
 *    un índice único parcial deja como mucho UN binding activo por sitio.
 *
 *  - `commerce-product-refs` — qué producto externo corresponde a un producto
 *    editorial. Se une por la **clave editorial** (`products.editorialKey`),
 *    nunca por el slug —que se renombra— ni por el handle ni por el SKU. Para
 *    Shopify el `externalProductId` es el GID, y la base de datos comprueba su
 *    forma.
 *
 *  - `carts` — HOY solo el esqueleto de propiedad. La Fase 4 construye el
 *    carrito de verdad (líneas, totales, caducidad); lo que se adelanta aquí
 *    son las cuatro columnas de dueño, para que el carrito nazca con dueño en
 *    vez de que haya que añadírselo después a filas que ya existen.
 *
 * Nada de esto conoce Shopify: no hay cliente, no hay credenciales y el
 * composition root no monta un runtime `shopify`. Una conexión Shopify puede
 * existir como fila `draft`; servir tráfico, no.
 */
import { randomUUID } from "node:crypto";

import { ENGINE_KINDS } from "@courvia/commerce-domain";
import { revalidateTag } from "next/cache";
import type { BasePayload, CollectionConfig, Field, PayloadRequest, Where } from "payload";

import { bindingTag } from "../catalog/cache-tags";
import { isAdmin, nobodyWrites } from "./access";

/**
 * Una revisión nueva del binding cambia qué conexión sirve el catálogo, y las
 * lecturas cacheadas resuelven esa conexión una vez y la guardan bajo
 * `cacheLife("max")`. Sin esto, activar un motor nuevo no se notaría en el
 * storefront durante un año.
 */
function revalidateBinding(siteKey: unknown): void {
  try {
    revalidateTag(bindingTag(typeof siteKey === "string" ? siteKey : DEFAULT_SITE_KEY), "max");
  } catch {
    // Fuera del runtime de Next (CLI, seeds, migraciones) no hay caché que marcar.
  }
}

/* ------------------------------------------------------------------ */
/* Vocabulario                                                        */
/* ------------------------------------------------------------------ */

/**
 * Los estados de ADR-029. Viven aquí y no en `@courvia/commerce-domain`
 * porque esta fase no puede tocar ese paquete; cuando el carrito y el
 * catálogo dual los necesiten (Fases 3-4), su sitio natural es el dominio.
 *
 * El ORDEN es semántico, no cosmético: es el rango que usan los triggers de
 * la migración para decidir si una transición avanza o retrocede.
 */
export const CONNECTION_STATUSES = [
  "draft",
  "configured",
  "verified",
  "active",
  "draining",
  "retired",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Un binding nace ya verificado: no se enchufa un motor sin comprobarlo. */
export const BINDING_STATUSES = ["verified", "active", "draining", "retired"] as const;
export type BindingStatus = (typeof BINDING_STATUSES)[number];

export const PRODUCT_REFERENCE_STATUSES = ["draft", "verified", "active", "retired"] as const;
export type ProductReferenceStatus = (typeof PRODUCT_REFERENCE_STATUSES)[number];

/** El único storefront que existe. La columna existe para que un multisite
 *  futuro sea posible; el multisite en sí es otro ADR (plan §3). */
export const DEFAULT_SITE_KEY = "courvia";

/** La conexión nativa que inserta la migración de la Fase 2. */
export const NATIVE_CONNECTION_KEY = "native-primary";

/**
 * Forma obligatoria de `secretRef`. **Es una referencia, no un valor.**
 *
 * `env:NOMBRE` apunta a una variable de entorno; `vault:ruta/al/secreto` a un
 * gestor. Nada más pasa, y eso incluye pegar un token: `shpat_…` no empieza
 * por `env:` ni por `vault:`. La misma expresión está como CHECK en Postgres,
 * que es la mitad que no se puede saltar desde una API.
 */
export const SECRET_REF_PATTERN = /^(env|vault):[A-Za-z0-9_][A-Za-z0-9_./-]{0,63}$/;

/** Versión de API de un motor externo, tal y como la nombra Shopify. */
const API_VERSION_PATTERN = /^\d{4}-\d{2}$/;

/** Dominio de una tienda Shopify. Ni una URL ni un token. */
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Formas conocidas de secreto, para avisar EN EL PANEL antes de que la base
 * de datos lo rechace. La garantía es la de Postgres (misma lista, como
 * función `payload.looks_like_secret`); esto solo hace que el editor lea un
 * mensaje en vez de una excepción de driver.
 */
const SECRET_SHAPES =
  /(shp(at|ca|ss|pa)_|sk_(live|test)_|rk_(live|test)_|whsec_|xox[baprs]-|ghp_|AKIA[0-9A-Z]{16}|-----BEGIN)/;

function kebabValidate(value: string | null | undefined): true | string {
  return typeof value === "string" && KEBAB.test(value) ? true : "kebab-case";
}

/* ------------------------------------------------------------------ */
/* Conexiones                                                         */
/* ------------------------------------------------------------------ */

export const CommerceConnections: CollectionConfig = {
  slug: "commerce-connections",
  labels: { singular: "Conexión de comercio", plural: "Conexiones de comercio" },
  admin: {
    useAsTitle: "key",
    group: "Comercio",
    defaultColumns: ["key", "siteKey", "engine", "status", "updatedAt"],
    description:
      "A qué motor está conectado un storefront. Metadatos y referencias a secretos — NUNCA el secreto. Activar una conexión requiere aprobación humana (plan §7).",
  },
  // Configuración de infraestructura: ni pública ni editorial.
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    {
      name: "key",
      type: "text",
      required: true,
      unique: true,
      index: true,
      validate: kebabValidate,
      // Los pedidos guardan esta clave como hecho histórico: renombrarla
      // reescribiría a quién pertenece un pedido ya cobrado.
      access: { update: nobodyWrites },
      admin: {
        description: "Identificador estable. No se renombra: los pedidos lo guardan.",
      },
    },
    {
      name: "siteKey",
      type: "text",
      required: true,
      index: true,
      defaultValue: DEFAULT_SITE_KEY,
      validate: kebabValidate,
      access: { update: nobodyWrites },
      admin: { description: "Storefront al que pertenece." },
    },
    {
      name: "engine",
      type: "select",
      required: true,
      options: [...ENGINE_KINDS],
      access: { update: nobodyWrites },
      admin: { description: "native = Payload + Supabase + PSP · shopify = headless." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [...CONNECTION_STATUSES],
      admin: {
        description:
          "draft → configured → verified → active → draining → retired. A partir de verified solo avanza (lo impone un trigger).",
      },
    },
    {
      name: "apiVersion",
      type: "text",
      validate: (value: string | null | undefined) =>
        value === null || value === undefined || value === "" || API_VERSION_PATTERN.test(value)
          ? true
          : "Formato AAAA-MM (versión de API del motor)",
      admin: { description: "Solo motores externos. Formato 2026-07." },
    },
    {
      name: "shopDomain",
      type: "text",
      validate: (value: string | null | undefined) =>
        value === null || value === undefined || value === "" || SHOP_DOMAIN_PATTERN.test(value)
          ? true
          : "Dominio *.myshopify.com, sin protocolo",
      admin: { description: "Solo Shopify. tienda.myshopify.com — sin https:// y sin token." },
    },
    {
      name: "secretRef",
      type: "text",
      required: true,
      maxLength: 80,
      validate: (value: string | null | undefined) => {
        if (typeof value !== "string") return "Obligatorio";
        if (SECRET_SHAPES.test(value)) {
          return "Eso parece un secreto. Aquí va SU NOMBRE: env:MI_VARIABLE o vault:ruta.";
        }
        return SECRET_REF_PATTERN.test(value) ? true : "env:NOMBRE_DE_VARIABLE o vault:ruta/al/secreto";
      },
      admin: {
        description:
          "REFERENCIA al secreto, jamás el secreto: env:SHOPIFY_ADMIN_TOKEN, vault:courvia/stripe. La base de datos rechaza cualquier otra forma.",
      },
    },
    {
      name: "notes",
      type: "textarea",
      maxLength: 500,
      admin: { description: "Para operar: quién la creó, qué catálogo sirve, qué falta." },
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Bindings                                                           */
/* ------------------------------------------------------------------ */

export const CommerceBindings: CollectionConfig = {
  slug: "commerce-bindings",
  labels: { singular: "Binding de comercio", plural: "Bindings de comercio" },
  admin: {
    useAsTitle: "siteKey",
    group: "Comercio",
    defaultColumns: ["siteKey", "connection", "revision", "status", "updatedAt"],
    description:
      "Qué conexión sirve los carritos NUEVOS de un sitio. El binding activo NO se edita: se crea una revisión nueva y la anterior pasa a draining (ADR-029).",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: {
    afterChange: [({ doc }) => revalidateBinding(doc.siteKey)],
    afterDelete: [({ doc }) => revalidateBinding(doc.siteKey)],
  },
  fields: [
    {
      name: "siteKey",
      type: "text",
      required: true,
      index: true,
      defaultValue: DEFAULT_SITE_KEY,
      validate: kebabValidate,
      access: { update: nobodyWrites },
      admin: { description: "Debe coincidir con el siteKey de la conexión (lo comprueba un trigger)." },
    },
    {
      name: "connection",
      type: "relationship",
      relationTo: "commerce-connections",
      required: true,
      index: true,
      hasMany: false,
      access: { update: nobodyWrites },
      admin: { description: "La conexión a la que apunta esta revisión. No se cambia: se crea otra." },
    },
    /*
     * `connectionKey` y `engine` son los campos que ADR-029 nombra en
     * `CommerceBinding`, y aquí NO son columnas: Payload los resuelve por la
     * relación de arriba (`virtual`). Una copia almacenada sería un segundo
     * sitio donde vive el mismo hecho, y dos sitios acaban discrepando —
     * exactamente el problema que este fichero existe para evitar. Es el
     * mismo patrón que `prices.sku` (src/payload/catalog.ts).
     */
    {
      name: "connectionKey",
      type: "text",
      virtual: "connection.key",
      admin: { readOnly: true, description: "De la conexión enlazada. No es una columna." },
    },
    {
      name: "engine",
      type: "text",
      virtual: "connection.engine",
      admin: { readOnly: true, description: "De la conexión enlazada. No es una columna." },
    },
    {
      name: "revision",
      type: "number",
      required: true,
      min: 1,
      index: true,
      access: { update: nobodyWrites },
      admin: {
        description: "Entero que avanza. Cambiar de motor es insertar la siguiente revisión, no editar esta.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "verified",
      options: [...BINDING_STATUSES],
      admin: {
        description:
          "verified → active → draining → retired. Solo avanza, y solo puede haber UN active por sitio (índice único parcial).",
      },
    },
    {
      name: "activatedAt",
      type: "date",
      admin: { description: "Cuándo empezó a servir carritos nuevos." },
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Referencias de producto                                            */
/* ------------------------------------------------------------------ */

export const CommerceProductReferences: CollectionConfig = {
  slug: "commerce-product-refs",
  labels: { singular: "Referencia de producto", plural: "Referencias de producto" },
  admin: {
    useAsTitle: "externalProductId",
    group: "Comercio",
    defaultColumns: ["product", "connection", "externalProductId", "status", "verifiedAt"],
    description:
      "Enlaza un producto editorial con su producto en un motor. Se une por clave editorial y por id externo (GID en Shopify) — nunca por slug, handle o SKU.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    {
      name: "product",
      type: "relationship",
      relationTo: "products",
      required: true,
      index: true,
      hasMany: false,
      access: { update: nobodyWrites },
      admin: { description: "El producto editorial. La unión real es su editorialKey, no su slug." },
    },
    {
      /*
       * `editorialProductId` de ADR-029. Virtual sobre `products.editorialKey`
       * por el mismo motivo que arriba: un slug se renombra y un id de fila
       * no es editorial, así que la unión estable es la clave editorial — y
       * guardar una copia de ella sería inventarse un segundo original.
       */
      name: "editorialProductId",
      type: "text",
      virtual: "product.editorialKey",
      admin: { readOnly: true, description: "Clave editorial del producto enlazado. No es una columna." },
    },
    {
      name: "connection",
      type: "relationship",
      relationTo: "commerce-connections",
      required: true,
      index: true,
      hasMany: false,
      access: { update: nobodyWrites },
      admin: { description: "En qué conexión vive el producto externo." },
    },
    {
      name: "connectionKey",
      type: "text",
      virtual: "connection.key",
      admin: { readOnly: true, description: "De la conexión enlazada. No es una columna." },
    },
    {
      name: "engine",
      type: "text",
      virtual: "connection.engine",
      admin: { readOnly: true, description: "De la conexión enlazada. No es una columna." },
    },
    {
      name: "externalProductId",
      type: "text",
      required: true,
      index: true,
      access: { update: nobodyWrites },
      admin: {
        description:
          "Id opaco en el motor. Shopify: el GID completo (gid://shopify/Product/123) — un handle o un SKU NO valen y la base de datos los rechaza.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [...PRODUCT_REFERENCE_STATUSES],
    },
    {
      name: "verifiedAt",
      type: "date",
      admin: { description: "Cuándo se comprobó que el id externo existe y es ese producto." },
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Dueño de una transacción                                           */
/* ------------------------------------------------------------------ */

/**
 * Las cuatro columnas de `CommerceOwner`, tal y como las guarda una fila.
 *
 * Se almacenan DENORMALIZADAS —no como relación a la conexión— y es una
 * decisión, no un descuido: el dueño de un pedido es un hecho histórico. Si
 * fuera una relación, retirar o reconfigurar una conexión reescribiría a
 * quién perteneció una venta de hace un año. La migración añade una FK sobre
 * `connectionKey` para que la conexión no pueda desaparecer, y un trigger que
 * impide que las cuatro cambien después del INSERT.
 *
 * `bindingRevision` es procedencia y no permiso (ADR-029): se guarda para
 * auditar de qué revisión salió la fila, y ninguna autorización la mira.
 *
 * NINGUNA lleva `required: true`, y no es un olvido. `required` en Payload
 * genera un tipo obligatorio en `payload-types.ts`, y quien crea pedidos hoy
 * es `PayloadCommerceService.createCheckout`, en `@courvia/commerce-payload`
 * — un paquete que esta fase no puede tocar. Un `required` aquí rompería su
 * compilación sin añadir ninguna garantía real, porque la garantía la da la
 * migración: las cuatro columnas son NOT NULL en Postgres y un trigger impide
 * que cambien tras el INSERT. El hook de abajo es lo que hace que ese NOT
 * NULL nunca se note. Cuando `commerce-payload` pueda cambiar, ponerles
 * `required` es cosmético.
 */
export function commerceOwnerFields(): Field[] {
  return [
    {
      name: "siteKey",
      type: "text",
      index: true,
      access: { update: nobodyWrites },
      admin: { readOnly: true, description: "Storefront del que salió. Se fija al crear." },
    },
    {
      name: "engine",
      type: "select",
      options: [...ENGINE_KINDS],
      access: { update: nobodyWrites },
      admin: { readOnly: true, description: "Motor propietario. Inmutable." },
    },
    {
      name: "connectionKey",
      type: "text",
      index: true,
      access: { update: nobodyWrites },
      admin: {
        readOnly: true,
        description: "Conexión propietaria. Inmutable, y la operación va por ella.",
      },
    },
    {
      name: "bindingRevision",
      type: "number",
      min: 1,
      access: { update: nobodyWrites },
      admin: {
        readOnly: true,
        description: "Revisión del binding vigente al nacer. Procedencia, no permiso.",
      },
    },
  ];
}

/** El dueño tal y como lo devuelve una consulta. */
export interface ResolvedOwner {
  siteKey: string;
  engine: string;
  connectionKey: string;
  bindingRevision: number;
}

interface ConnectionDoc {
  id: number | string;
  key: string;
  siteKey: string;
  engine: string;
  status: string;
}

function isConnectionDoc(value: unknown): value is ConnectionDoc {
  if (typeof value !== "object" || value === null) return false;
  const doc = value as Record<string, unknown>;
  return typeof doc.key === "string" && typeof doc.engine === "string";
}

/**
 * El binding ACTIVO de un sitio, resuelto a un `CommerceOwner`.
 *
 * `null` = ese storefront no tiene ninguna conexión sirviendo carritos
 * nuevos. No se inventa una: un sitio sin binding activo no vende, y decirlo
 * es mejor que devolver la única conexión que hubiera a mano.
 */
export async function findActiveOwner(
  payload: BasePayload,
  siteKey: string,
  req?: PayloadRequest,
): Promise<ResolvedOwner | null> {
  const found = await payload.find({
    collection: "commerce-bindings",
    where: { siteKey: { equals: siteKey }, status: { equals: "active" } } satisfies Where,
    limit: 1,
    depth: 1,
    overrideAccess: true,
    ...(req === undefined ? {} : { req }),
  });
  const binding = found.docs[0];
  if (binding === undefined) return null;
  const connection = binding.connection;
  if (!isConnectionDoc(connection)) return null;
  return {
    siteKey: binding.siteKey,
    engine: connection.engine,
    connectionKey: connection.key,
    bindingRevision: binding.revision,
  };
}

/** Una conexión por su clave. `null` = no está configurada en este despliegue. */
export async function findConnection(
  payload: BasePayload,
  key: string,
): Promise<ConnectionDoc | null> {
  const found = await payload.find({
    collection: "commerce-connections",
    where: { key: { equals: key } } satisfies Where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const doc = found.docs[0];
  return doc === undefined ? null : doc;
}

/**
 * Añade el dueño a una colección transaccional y lo RELLENA al crear.
 *
 * Por qué un hook y no un `defaultValue`: el dueño no es un valor por
 * defecto, es el resultado de preguntar qué conexión sirve hoy a este sitio,
 * y esa pregunta necesita la base de datos y la transacción en curso. El
 * hook corre en `beforeValidate`, antes de que Payload valide `required`
 * (collections/operations/create.js: beforeValidate de colección va antes del
 * recorrido `beforeChange`, que es donde se valida), así que
 * `PayloadCommerceService.createCheckout` sigue creando pedidos sin saber
 * nada de esto.
 *
 * Si un llamante YA trae dueño, se respeta: eso es lo que permitirá a la
 * Fase 4 copiar el dueño del carrito al pedido en vez de volver a preguntar
 * por el activo — que sería el fallo exacto que ADR-029 prohíbe si el
 * carrito hubiera nacido en otra conexión.
 */
export function withCommerceOwner(collection: CollectionConfig): CollectionConfig {
  return {
    ...collection,
    fields: [...collection.fields, ...commerceOwnerFields()],
    hooks: {
      ...collection.hooks,
      beforeValidate: [
        ...(collection.hooks?.beforeValidate ?? []),
        async ({ data, req, operation }) => {
          if (operation !== "create" || data === undefined) return data;
          if (typeof data.connectionKey === "string" && data.connectionKey !== "") return data;
          const siteKey = typeof data.siteKey === "string" && data.siteKey !== "" ? data.siteKey : DEFAULT_SITE_KEY;
          const owner = await findActiveOwner(req.payload, siteKey, req);
          if (owner === null) {
            // Sin binding activo no hay a quién atribuir la fila. Fallar aquí
            // es preferible a escribir un pedido huérfano: el invariante 7
            // dice que un pedido se opera por SU conexión, y una fila sin
            // conexión no se puede operar por ninguna.
            throw new Error(
              `commerce_owner_unresolved: el sitio "${siteKey}" no tiene binding activo`,
            );
          }
          return { ...data, ...owner };
        },
      ],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Clave editorial de producto                                        */
/* ------------------------------------------------------------------ */

/**
 * La identidad de un producto que sobrevive a todo lo demás.
 *
 * No es el id (una fila cambia de base de datos en un restore o en un
 * export/import) ni el slug (se renombra, y `redirectOnSlugChange` en
 * src/payload/page-redirects.ts existe precisamente porque se renombra).
 * Es un UUID opaco que se genera una vez y no se toca: es lo que
 * `CommerceProductReference` usa para unir un producto editorial con su
 * producto en Shopify sin depender de handles ni de SKUs.
 *
 * Sin `required` por el mismo motivo que las columnas de dueño: `defaultValue`
 * lo rellena SIEMPRE (Payload calcula los defaults en cada create, incluido el
 * de la Local API), la columna es NOT NULL en Postgres, y marcarlo `required`
 * solo rompería la compilación de quien ya crea productos sin nombrarlo.
 */
export function editorialKeyField(): Field {
  return {
    name: "editorialKey",
    type: "text",
    unique: true,
    index: true,
    defaultValue: () => randomUUID(),
    access: { update: nobodyWrites },
    admin: {
      readOnly: true,
      position: "sidebar",
      description:
        "Identidad editorial estable. No es el id ni el slug: se genera una vez y sobrevive a renombrados y migraciones.",
    },
  };
}
