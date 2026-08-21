/**
 * Plantillas (WP13, `docs/ARCHITECTURE.md` §1 L3 y §3).
 *
 * Una plantilla es el layout de una ficha de producto **editado una vez para
 * todas**. Sus bloques son los mismos del registro de secciones, más las
 * cinco **vinculadas** —que no tienen campos de contenido y leen el producto
 * del contexto de render—, así que un editor reordena la galería, el raíl y
 * la ficha técnica, e intercala secciones de marketing entre ellas, sin
 * tocar código y sin escribir un layout por SKU.
 *
 * TRES DECISIONES QUE NO SON OBVIAS.
 *
 * 1. **Sin versiones ni borradores.** Una plantilla gobierna N páginas
 *    publicadas a la vez; «publicar» la plantilla publicaría a la vez el
 *    layout de todo el catálogo, y previsualizarla exigiría elegir un
 *    producto de muestra. Los productos y las páginas sí llevan versiones
 *    porque cada documento es una URL. Esto no lo es.
 *
 * 2. **`isDefault` en vez de una convención.** «La plantilla por defecto de
 *    su tipo» tenía que ser un dato, no «la primera que se creó»: la recaída
 *    de un producto sin plantilla asignada la consulta en cada render, y una
 *    regla que depende del orden de inserción es una regla que nadie puede
 *    cambiar desde el panel. Marcar una desmarca las demás de su tipo (hook
 *    de abajo), así que la respuesta a «¿cuál es la de por defecto?» es
 *    siempre una.
 *
 * 3. **`kind` es un select de un solo valor hoy.** No es un adorno: la
 *    recaída busca por tipo, y el día que exista una plantilla de categoría
 *    o de post el campo ya está ahí y las consultas ya filtran. Un booleano
 *    `isProductTemplate` habría costado una migración para decir lo mismo.
 */
import type { CollectionConfig } from "payload";
import { revalidateTag } from "next/cache";

import { isAdmin, isAuthenticated } from "./access";
import { buildBlocks } from "./blocks";

/** Los tipos de plantilla que existen. Uno hoy; ver la nota 3 de arriba. */
export const TEMPLATE_KINDS = ["product"] as const;

/**
 * La etiqueta de caché de todas las plantillas.
 *
 * Una sola para todas y no una por documento, a propósito: cambiar la
 * plantilla por defecto cambia el layout de cada producto que no tenga una
 * asignada, así que la invalidación fina no existiría — habría que enumerar
 * los productos afectados en cada escritura. Las plantillas se editan una vez
 * cada mucho; el catálogo entero se relee y ya está.
 */
export const TEMPLATES_TAG = "templates";

function revalidateTemplates(): void {
  try {
    revalidateTag(TEMPLATES_TAG, "max");
  } catch {
    // Fuera del runtime de Next (CLI, seeds) no hay caché que marcar.
  }
}

export const Templates: CollectionConfig = {
  slug: "templates",
  labels: { singular: "Plantilla", plural: "Plantillas" },
  admin: {
    useAsTitle: "name",
    group: { es: "Contenido", en: "Content", ar: "المحتوى" },
    defaultColumns: ["name", "kind", "isDefault", "updatedAt"],
    description: {
      es: "El layout de una ficha de producto, editado una vez para todas. Las secciones «de producto» no tienen contenido propio: enseñan el producto de la página en la que caigan.",
      en: "The layout of a product page, edited once for all of them. The product sections hold no content of their own: they show whatever product the page is about.",
      ar: "تخطيط صفحة المنتج، يُحرَّر مرة واحدة للجميع. أقسام المنتج لا تحمل محتوى خاصًا بها: تعرض منتج الصفحة التي توضع فيها.",
    },
  },
  /**
   * Solo servidor. Una plantilla no es contenido público —la sirve el render,
   * que lee por Local API con `overrideAccess`— y exponerla por REST anónimo
   * publicaría el layout de fichas que todavía no existen.
   */
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        // Una sola por tipo. El guardarraíl va aquí y no en la lectura
        // porque en la lectura sería una desambiguación silenciosa —el
        // editor vería dos casillas marcadas y una sola surtiendo efecto—,
        // y porque escribir en los hermanos con `isDefault: false` no vuelve
        // a disparar esta rama: no hay bucle.
        if (doc.isDefault === true) {
          await req.payload.update({
            collection: "templates",
            where: { kind: { equals: doc.kind }, isDefault: { equals: true }, id: { not_equals: doc.id } },
            data: { isDefault: false },
            overrideAccess: true,
            req,
          });
        }
        revalidateTemplates();
        return doc;
      },
    ],
    afterDelete: [() => revalidateTemplates()],
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      admin: { description: "Cómo la reconoce quien la asigna: «Ficha estándar», «Lanzamiento»." },
    },
    {
      name: "kind",
      type: "select",
      required: true,
      defaultValue: "product",
      options: [{ label: { es: "Producto", en: "Product", ar: "منتج" }, value: "product" }],
      admin: { description: "Qué tipo de página describe. Fija a qué documentos se puede asignar." },
    },
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          "La que usa cualquier producto sin plantilla asignada. Marcarla desmarca la anterior de su mismo tipo.",
      },
    },
    {
      name: "blocks",
      type: "blocks",
      label: "Secciones",
      // `bound: true` = también las secciones vinculadas. Es la única
      // superficie que las ofrece; `pages` llama a buildBlocks() sin
      // opciones y no las ve (src/payload/blocks.ts explica por qué).
      blocks: buildBlocks({ bound: true }),
      admin: {
        description:
          "El orden es el orden en pantalla. Las secciones de producto (cabecera, relato, ficha técnica, gama, formulario) no piden contenido: lo toman del producto.",
      },
    },
  ],
};
