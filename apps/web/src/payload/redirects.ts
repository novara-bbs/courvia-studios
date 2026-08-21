/**
 * Redirects: the memory of every URL this site used to have.
 *
 * Region-relative, not per region, and that is the whole design decision.
 * A page's `slug` is a single unique column shared by every locale and every
 * market (`/es/tecnologia`, `/en-gb/tecnologia`, `/en-ae/tecnologia` are one
 * document), so renaming it breaks four URLs at once. One row that says
 * `/tecnologia → /tecnologia-tempo` fixes all four and cannot drift between
 * them; four rows would be four chances to fix three. If a genuinely
 * region-specific redirect is ever needed, an optional `region` field is an
 * additive change — the reverse (collapsing four rows into one later) is a
 * data migration.
 *
 * Everything an editor can type is refused at the point of writing rather
 * than survived at request time: a loop, a destination outside the site, a
 * source that shadows a real route or a live page.
 */
import type { CollectionConfig, PayloadRequest, TextFieldSingleValidation } from "payload";
import { revalidateTag } from "next/cache";

import {
  REDIRECT_CODES,
  isReservedPath,
  isValidPath,
  normalizePath,
  wouldCycle,
} from "../routing/region-routes";
import type { RedirectRule } from "../routing/region-routes";
import { anyone, isAdmin, isAuthenticated } from "./access";

/** The proxy reads the manifest; the manifest is cached under this tag. */
export function revalidateRedirects(): void {
  try {
    revalidateTag("redirects", "max");
  } catch {
    // Outside the Next runtime (CLI, seeds) there is no cache to mark.
  }
}

/** Every OTHER rule, so a row never has to reason about itself. */
async function otherRules(
  req: PayloadRequest,
  id: number | string | undefined,
): Promise<RedirectRule[]> {
  const result = await req.payload.find({
    collection: "redirects",
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    req,
    ...(id === undefined ? {} : { where: { id: { not_equals: id } } }),
    select: { from: true, to: true, code: true },
  });
  return result.docs.map((doc) => ({
    from: normalizePath(doc.from),
    to: normalizePath(doc.to),
    code: doc.code === "302" ? "302" : "301",
  }));
}

const validateFrom: TextFieldSingleValidation = async (value, { data, id, req }) => {
  if (typeof value !== "string" || value.trim() === "") return "Obligatorio.";
  const from = normalizePath(value);
  if (!isValidPath(from)) {
    return "Ruta relativa a la región: /algo o /algo/otro, en kebab-case y sin dominio.";
  }
  if (from === "/") return "La portada de la región no se puede redirigir.";

  // `data` is the whole document being validated; Payload types it as
  // Partial<unknown> because the collection has no generated interface at
  // config-build time.
  const raw = (data as { to?: unknown } | undefined)?.to;
  const to = typeof raw === "string" ? normalizePath(raw) : null;
  if (to !== null && to === from) return "Origen y destino son la misma URL: eso es un bucle.";

  // A route in the app always wins over a row in a table, so a rule that
  // could never fire is a rule that lies to whoever reads the list.
  if (isReservedPath(from)) {
    return "Esa ruta la sirve una página del código (/robots, /comparar, /c/…): no se puede redirigir.";
  }

  const slug = from.slice(1);
  const live = await req.payload.count({
    collection: "pages",
    where: { slug: { equals: slug }, _status: { equals: "published" } },
    overrideAccess: true,
    req,
  });
  if (live.totalDocs > 0) {
    return `Existe una página publicada en ${from}: la redirección la dejaría inaccesible.`;
  }

  if (to !== null && wouldCycle(await otherRules(req, id), from, to)) {
    return "Ese destino vuelve al origen dando un rodeo: sería un bucle.";
  }
  return true;
};

const validateTo: TextFieldSingleValidation = (value) => {
  if (typeof value !== "string" || value.trim() === "") return "Obligatorio.";
  const to = normalizePath(value);
  // `//host` is a protocol-relative URL: it looks like a path and lands on
  // someone else's domain. An open redirect is not a feature we are adding.
  if (!isValidPath(to)) {
    return "Destino interno: /algo o /algo/otro. Sin dominios ni URLs absolutas.";
  }
  return true;
};

export const Redirects: CollectionConfig = {
  slug: "redirects",
  labels: { singular: "Redirección", plural: "Redirecciones" },
  admin: {
    useAsTitle: "from",
    group: "Contenido",
    defaultColumns: ["from", "to", "code", "source", "updatedAt"],
    description:
      "Rutas relativas a la región (/tecnologia, no /es/tecnologia): una fila cubre es, en-gb, en-ae y ar-ae. Al renombrar el slug de una página se crea sola.",
  },
  access: {
    // URLs that used to exist are not a secret — they are the same public
    // information the sitemap publishes. Writing is another matter.
    read: anyone,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [
      ({ doc }) => {
        revalidateRedirects();
        return doc;
      },
    ],
    afterDelete: [() => revalidateRedirects()],
  },
  fields: [
    {
      name: "from",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "URL antigua, sin el prefijo de región. Ej.: /tecnologia",
      },
      validate: validateFrom,
    },
    {
      name: "to",
      type: "text",
      required: true,
      admin: { description: "URL nueva, sin el prefijo de región. Ej.: /tecnologia-tempo" },
      validate: validateTo,
    },
    {
      name: "code",
      type: "select",
      required: true,
      defaultValue: "301",
      options: REDIRECT_CODES.map((code) => ({
        value: code,
        label:
          code === "301"
            ? "301 · permanente (la URL nueva hereda el posicionamiento)"
            : "302 · temporal (la antigua sigue siendo la buena)",
      })),
      admin: {
        description:
          "301 para un cambio definitivo de URL. 302 solo mientras algo esté de paso: un 302 no traslada el posicionamiento.",
      },
    },
    {
      name: "source",
      type: "select",
      required: true,
      defaultValue: "manual",
      options: [
        { value: "manual", label: "Escrita a mano" },
        { value: "slug-change", label: "Automática: cambio de slug" },
      ],
      admin: {
        readOnly: true,
        description: "Quién creó la fila. Las automáticas se reescriben solas al volver a renombrar.",
      },
    },
  ],
};
