/**
 * Bloques compartidos (ADR-030, `docs/adr/ADR-030-shared-partials.md`).
 *
 * Un partial es un fragmento de secciones editado UNA VEZ y referenciado
 * —nunca copiado— desde cualquier página a través del bloque `partialRef`.
 * Cambiar aquí cambia cada sitio que lo use, la misma garantía que
 * `productShowcase` ya da al precio de un producto.
 *
 * SIN VERSIONES NI BORRADORES, por la misma razón que `Templates`
 * (templates.ts): un partial gobierna N páginas publicadas a la vez, así que
 * «publicar el borrador» publicaría de golpe el contenido de todas ellas. Los
 * documentos que sí llevan versión son las páginas —cada una es una URL— y
 * esto no lo es: cada guardado ya está publicado.
 *
 * `blocks: buildBlocks({ exclude: ["partialRef", "productShowcase"] })`.
 * `partialRef` fuera hace la recursión IMPOSIBLE de construir, no solo de
 * renderizar — el selector de bloques del propio editor nunca la ofrece al
 * editar un partial, así que un partial-dentro-de-un-partial no es un caso
 * que el renderer tenga que descartar en tiempo de ejecución.
 *
 * `productShowcase` fuera es OTRA cosa: no es una regla de ADR-030, es un
 * defecto preexistente que `pnpm migrate:new` sacó a la luz al generar la
 * migración de esta colección. Esa sección declara `dbName: "showcase"`
 * —un nombre de tabla sin prefijo de colección, para no pasar los 63
 * caracteres de Postgres— y `Templates` ya la ofrece hoy sin campos propios
 * (`buildBlocks({ bound: true })` no filtra nada). Payload solo modela UNA
 * fila de relación por nombre de tabla de bloque: con Pages y Templates
 * compartiendo «showcase» la migración generada REASIGNABA su FK de
 * `pages` a la última colección procesada, lo que habría roto los
 * `productShowcase` ya guardados en páginas publicadas al aplicarla. Nada
 * de esto lo causa esta colección; añadirla solo lo hizo visible. Arreglar
 * la colisión Pages/Templates de raíz —cada colección con su propia tabla—
 * es un cambio a `dbName` en `product-showcase/index.tsx` y su propia
 * migración, fuera del alcance de ADR-030. Aquí basta con no sumar un
 * tercer aspirante a esa misma tabla.
 */
import { revalidateTag } from "next/cache";
import type { CollectionConfig } from "payload";

import { isAdmin, isAuthenticated } from "./access";
import { buildBlocks } from "./blocks";

/**
 * La etiqueta de caché de UN partial. Deliberadamente por documento, al
 * contrario que `TEMPLATES_TAG`: una plantilla gobierna todo el catálogo que
 * no tenga una asignada, así que invalidarlas todas junto es lo correcto. Un
 * partial solo afecta a las páginas que lo referencian de verdad, y
 * enumerarlas en cada escritura obligaría al hook a conocer cada página que
 * lo usa. `getPartial` etiqueta su lectura con la misma clave.
 */
export function partialTag(id: string | number): string {
  return `partial:${String(id)}`;
}

function revalidatePartial(id: unknown): void {
  if (typeof id !== "string" && typeof id !== "number") return;
  try {
    revalidateTag(partialTag(id), "max");
  } catch {
    // Fuera del runtime de Next (CLI, seeds) no hay caché que marcar.
  }
}

export const Partials: CollectionConfig = {
  slug: "partials",
  labels: {
    singular: { es: "Bloque compartido", en: "Shared block", ar: "كتلة مشتركة" },
    plural: { es: "Bloques compartidos", en: "Shared blocks", ar: "كتل مشتركة" },
  },
  admin: {
    useAsTitle: "name",
    group: { es: "Contenido", en: "Content", ar: "المحتوى" },
    defaultColumns: ["name", "updatedAt"],
    description: {
      es: "Un fragmento de secciones que se referencia, no se copia: editarlo aquí cambia cada página que lo use.",
      en: "A fragment of sections that is referenced, never copied: editing it here changes every page that uses it.",
      ar: "جزء من الأقسام يُشار إليه لا يُنسخ: تعديله هنا يغيّر كل صفحة تستخدمه.",
    },
  },
  /**
   * Solo servidor, como `Templates`: un partial no es contenido público en sí
   * mismo —lo sirve el render, por Local API con `overrideAccess`— y
   * exponerlo por REST anónimo publicaría fragmentos que ninguna página
   * enseña todavía.
   */
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [
      ({ doc }) => {
        revalidatePartial(doc.id);
        return doc;
      },
    ],
    afterDelete: [
      ({ id }) => {
        revalidatePartial(id);
      },
    ],
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      admin: {
        description: {
          es: "Cómo lo reconoce quien lo elige en otra página: «CTA de garantía», «Aviso de envío EAU».",
          en: "How whoever picks it on another page recognises it: “Warranty CTA”, “UAE shipping notice”.",
          ar: "كيف يميّزه من يختاره في صفحة أخرى: «دعوة الضمان»، «إشعار الشحن لدولة الإمارات».",
        },
      },
    },
    {
      name: "blocks",
      type: "blocks",
      label: { es: "Secciones", en: "Sections", ar: "الأقسام" },
      // Ver la nota de cabecera: `partialRef` fuera por diseño (ADR-030),
      // `productShowcase` fuera por la colisión preexistente de tabla.
      blocks: buildBlocks({ exclude: ["partialRef", "productShowcase"] }),
      admin: {
        description: {
          es: "El orden es el orden en pantalla, dondequiera que se use este bloque compartido.",
          en: "The order here is the order on screen, wherever this shared block is used.",
          ar: "الترتيب هنا هو الترتيب على الشاشة أينما استُخدمت هذه الكتلة المشتركة.",
        },
      },
    },
  ],
};
