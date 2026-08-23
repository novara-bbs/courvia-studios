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
import type { CollectionConfig, PayloadRequest, TextFieldSingleValidation, Where } from "payload";
import { revalidateTag } from "next/cache";

import {
  REDIRECT_CODES,
  RESERVED_ROUTES,
  isReservedPath,
  isValidPath,
  normalizePath,
  wouldCycle,
} from "../routing/region-routes";
import type { RedirectRule } from "../routing/region-routes";
import { anyone, isAdmin, isAuthenticated } from "./access";
import { panelTextFor } from "./admin-copy";

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

/**
 * Everything this collection refuses, in the panel's three languages.
 *
 * A `validate` returns a finished string that Payload never passes through
 * `getTranslation`, so these are resolved by hand (`admin-copy.ts`) against
 * `req.i18n.language` — the language of the panel, not of the content.
 */
const REDIRECT_ERROR = {
  required: { es: "Obligatorio.", en: "Required.", ar: "حقل مطلوب." },
  fromShape: {
    es: "Ruta relativa a la región: /algo o /algo/otro, en kebab-case y sin dominio.",
    en: "A region-relative path: /something or /something/else, kebab-case, no domain.",
    ar: "مسار نسبي داخل المنطقة: ‎/شيء أو ‎/شيء/آخر، بصيغة kebab-case وبلا نطاق.",
  },
  homeIsNotMovable: {
    es: "La portada de la región no se puede redirigir.",
    en: "A region's home page cannot be redirected.",
    ar: "لا يمكن تحويل الصفحة الرئيسية للمنطقة.",
  },
  selfLoop: {
    es: "Origen y destino son la misma URL: eso es un bucle.",
    en: "Source and destination are the same URL: that is a loop.",
    ar: "المصدر والوجهة الرابط نفسه: هذه حلقة مغلقة.",
  },
  reserved: {
    es: "Esa ruta la sirve una página del código (/robots, /comparar, /c/…): no se puede redirigir.",
    en: "That path is served by a page in the code (/robots, /comparar, /c/…): it cannot be redirected.",
    ar: "هذا المسار تخدمه صفحة في الشيفرة (‎/robots و‎/comparar و‎/c/…): لا يمكن تحويله.",
  },
  livePage: {
    es: "Existe una página publicada en {path}: la redirección la dejaría inaccesible.",
    en: "A published page already lives at {path}: this redirect would make it unreachable.",
    ar: "توجد صفحة منشورة على {path}: هذا التحويل سيجعلها غير قابلة للوصول.",
  },
  indirectLoop: {
    es: "Ese destino vuelve al origen dando un rodeo: sería un bucle.",
    en: "That destination comes back to the source the long way round: it would be a loop.",
    ar: "تعود هذه الوجهة إلى المصدر عبر مسار غير مباشر: ستنشأ حلقة مغلقة.",
  },
  toShape: {
    es: "Destino interno: /algo o /algo/otro. Sin dominios ni URLs absolutas.",
    en: "An internal destination: /something or /something/else. No domains, no absolute URLs.",
    ar: "وجهة داخلية: ‎/شيء أو ‎/شيء/آخر. بلا نطاقات ولا روابط مطلقة.",
  },
} as const;

/**
 * ¿Sirve el sitio esta URL ahora mismo?
 *
 * `_status` solo se compara cuando la colección tiene borradores: `categories`
 * no los tiene y sus documentos no llevan esa columna, así que exigir
 * `published` ahí no encontraría nunca nada — y una categoría viva quedaría
 * tapada por una redirección sin que nada avisara.
 */
async function livesIn(
  req: PayloadRequest,
  collection: "pages" | "products" | "categories",
  slug: string,
): Promise<boolean> {
  const where: Where =
    collection === "categories"
      ? { slug: { equals: slug } }
      : { slug: { equals: slug }, _status: { equals: "published" } };
  const found = await req.payload.count({ collection, where, overrideAccess: true, req });
  return found.totalDocs > 0;
}

const validateFrom: TextFieldSingleValidation = async (value, options) => {
  const { data, id, req } = options;
  const say = (copy: (typeof REDIRECT_ERROR)[keyof typeof REDIRECT_ERROR]): string =>
    panelTextFor(copy, options);
  if (typeof value !== "string" || value.trim() === "") return say(REDIRECT_ERROR.required);
  const from = normalizePath(value);
  if (!isValidPath(from)) return say(REDIRECT_ERROR.fromShape);
  if (from === "/") return say(REDIRECT_ERROR.homeIsNotMovable);

  // `data` is the whole document being validated; Payload types it as
  // Partial<unknown> because the collection has no generated interface at
  // config-build time.
  const raw = (data as { to?: unknown } | undefined)?.to;
  const to = typeof raw === "string" ? normalizePath(raw) : null;
  if (to !== null && to === from) return say(REDIRECT_ERROR.selfLoop);

  /*
   * Una ruta del código siempre gana a una fila de una tabla, así que una
   * regla que nunca podría dispararse es una regla que miente a quien lee la
   * lista.
   *
   * Pero «ruta del código» tiene dos formas y aquí solo se miraba una.
   * `/comparar` la sirve un fichero y siempre existe. `/robots/tempo-r1` la
   * sirve un fichero **para los slugs que el catálogo tenga publicados**, y
   * `isReservedPath` sin manifiesto contesta `true` para cualquiera de ellos —
   * conservador y correcto en el proxy, y equivocado aquí.
   *
   * La consecuencia era que renombrar un producto no podía escribir su
   * redirección: la validación rechazaba la regla por proteger una URL que
   * acababa de dejar de existir. Desde ADR-026 el proxy sirve **404 reales**,
   * así que eso no era una redirección ausente sino una puerta cerrada en la
   * dirección que Google tenía indexada.
   *
   * Se resuelve preguntando a la colección hija, que es la única que sabe la
   * respuesta. Y de paso la validación deja de ser solo sobre `pages`.
   */
  const segments = from.slice(1).split("/");
  const [head, tail] = segments;
  const child = head === undefined ? undefined : RESERVED_ROUTES[head]?.child;

  if (segments.length === 2 && child != null && tail !== undefined) {
    // `/robots/{slug}` o `/c/{slug}`: existe solo si el documento existe.
    if (await livesIn(req, child, tail)) {
      return say(REDIRECT_ERROR.livePage).replace("{path}", from);
    }
  } else if (isReservedPath(from)) {
    return say(REDIRECT_ERROR.reserved);
  } else if (await livesIn(req, "pages", from.slice(1))) {
    return say(REDIRECT_ERROR.livePage).replace("{path}", from);
  }

  if (to !== null && wouldCycle(await otherRules(req, id), from, to)) {
    return say(REDIRECT_ERROR.indirectLoop);
  }
  return true;
};

const validateTo: TextFieldSingleValidation = (value, options) => {
  const say = (copy: (typeof REDIRECT_ERROR)[keyof typeof REDIRECT_ERROR]): string =>
    panelTextFor(copy, options);
  if (typeof value !== "string" || value.trim() === "") return say(REDIRECT_ERROR.required);
  const to = normalizePath(value);
  // `//host` is a protocol-relative URL: it looks like a path and lands on
  // someone else's domain. An open redirect is not a feature we are adding.
  if (!isValidPath(to)) return say(REDIRECT_ERROR.toShape);
  return true;
};

export const Redirects: CollectionConfig = {
  slug: "redirects",
  labels: {
    singular: { es: "Redirección", en: "Redirect", ar: "تحويل" },
    plural: { es: "Redirecciones", en: "Redirects", ar: "التحويلات" },
  },
  /**
   * A deleted rule is a URL that starts answering 404 — including URLs
   * printed on a leaflet or linked from somewhere we do not control. Trash
   * makes that reversible, and it costs `from` its `unique: true` for the
   * same reason `pages.slug` loses it: a rule sitting in the bin would keep
   * its old URL locked against the person writing the correct rule for it.
   * The partial unique index in `trash.ts` is what keeps two LIVE rules from
   * claiming the same source.
   *
   * `applySlugRedirect` (page-redirects.ts) is unaffected: `payload.delete`
   * still removes a row for good, and its `find` calls skip the bin, so a
   * rename never resurrects a rule somebody threw away.
   */
  trash: true,
  admin: {
    useAsTitle: "from",
    group: { es: "Contenido", en: "Content", ar: "المحتوى" },
    defaultColumns: ["from", "to", "code", "source", "updatedAt"],
    description: {
      es: "Rutas relativas a la región (/tecnologia, no /es/tecnologia): una fila cubre es, en-gb, en-ae y ar-ae. Al renombrar el slug de una página se crea sola.",
      en: "Region-relative paths (/tecnologia, not /es/tecnologia): one row covers es, en-gb, en-ae and ar-ae. Renaming a page's slug writes one by itself.",
      ar: "مسارات نسبية داخل المنطقة (‎/tecnologia لا ‎/es/tecnologia): صف واحد يغطي es وen-gb وen-ae وar-ae. تُكتب تلقائيًا عند تغيير عنوان صفحة.",
    },
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
      label: { es: "URL antigua", en: "Old URL", ar: "الرابط القديم" },
      required: true,
      // NOT `unique: true`: uniqueness among LIVE rules is the partial index
      // `redirects_from_live_unique` declared in `trash.ts`. See the note on
      // the collection's `trash` above.
      index: true,
      admin: {
        description: {
          es: "URL antigua, sin el prefijo de región. Ej.: /tecnologia",
          en: "The old URL, without the region prefix. E.g. /tecnologia",
          ar: "الرابط القديم بدون بادئة المنطقة. مثال: ‎/tecnologia",
        },
      },
      validate: validateFrom,
    },
    {
      name: "to",
      type: "text",
      label: { es: "URL nueva", en: "New URL", ar: "الرابط الجديد" },
      required: true,
      admin: {
        description: {
          es: "URL nueva, sin el prefijo de región. Ej.: /tecnologia-tempo",
          en: "The new URL, without the region prefix. E.g. /tecnologia-tempo",
          ar: "الرابط الجديد بدون بادئة المنطقة. مثال: ‎/tecnologia-tempo",
        },
      },
      validate: validateTo,
    },
    {
      name: "code",
      type: "select",
      label: { es: "Código", en: "Status code", ar: "رمز الحالة" },
      required: true,
      defaultValue: "301",
      options: REDIRECT_CODES.map((code) => ({
        value: code,
        label:
          code === "301"
            ? {
                es: "301 · permanente (la URL nueva hereda el posicionamiento)",
                en: "301 · permanent (the new URL inherits the ranking)",
                ar: "301 · دائم (يرث الرابط الجديد ترتيب البحث)",
              }
            : {
                es: "302 · temporal (la antigua sigue siendo la buena)",
                en: "302 · temporary (the old URL is still the canonical one)",
                ar: "302 · مؤقت (يبقى الرابط القديم هو المعتمد)",
              },
      })),
      admin: {
        description: {
          es: "301 para un cambio definitivo de URL. 302 solo mientras algo esté de paso: un 302 no traslada el posicionamiento.",
          en: "301 for a definitive change of URL. 302 only while something is in transit: a 302 moves no ranking.",
          ar: "استخدم 301 لتغيير نهائي للرابط، و302 فقط أثناء وضع مؤقت: لا ينقل 302 ترتيب البحث.",
        },
      },
    },
    {
      name: "source",
      type: "select",
      label: { es: "Origen de la fila", en: "Row origin", ar: "مصدر الصف" },
      required: true,
      defaultValue: "manual",
      options: [
        {
          value: "manual",
          label: { es: "Escrita a mano", en: "Written by hand", ar: "كُتب يدويًا" },
        },
        {
          value: "slug-change",
          label: {
            es: "Automática: cambio de slug",
            en: "Automatic: slug change",
            ar: "تلقائي: تغيير العنوان في الرابط",
          },
        },
      ],
      admin: {
        readOnly: true,
        description: {
          es: "Quién creó la fila. Las automáticas se reescriben solas al volver a renombrar.",
          en: "Who created the row. Automatic ones rewrite themselves on the next rename.",
          ar: "من أنشأ الصف. تُعاد كتابة الصفوف التلقائية عند إعادة التسمية مرة أخرى.",
        },
      },
    },
  ],
};
