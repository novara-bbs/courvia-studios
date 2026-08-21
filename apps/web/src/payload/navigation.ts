/**
 * Site chrome as content (L5 settings): header and footer links editable
 * without code. Hrefs are region-relative paths ("/robots", "/privacidad")
 * — the components prefix the active region, so one menu serves the four
 * regions and the localization lives in the labels.
 */
import { revalidateTag } from "next/cache";
import type { Field, GlobalConfig } from "payload";

import { anyone, isAuthenticated } from "./access";
import { panelTextFor } from "./admin-copy";
import type { LocalizedText, PanelLanguageSource } from "./admin-copy";
import { previewRegion, previewUrl } from "./preview";

/**
 * What a destination field says when it refuses.
 *
 * A `validate` returns a finished string, which Payload never runs through
 * `getTranslation` — so it is resolved by hand against the PANEL's language
 * (`admin-copy.ts`), the same way `hrefValidate` does in `blocks.ts`.
 */
const HREF_ERROR: LocalizedText = {
  es: "Ruta relativa a la región, empezando por / (p. ej. /robots)",
  en: "A region-relative path, starting with / (e.g. /robots)",
  ar: "مسار نسبي داخل المنطقة يبدأ بـ ‎/ (مثال: ‎/robots)",
};

/** Region-relative, no whitespace, no domain. The one shape a menu link may
 *  take, since the components prefix the region themselves. */
const HREF_PATTERN = /^\/[^\s]*$/;

function hrefValidate(required: boolean) {
  return (value: string | null | undefined, options: PanelLanguageSource): string | true => {
    // Emptiness is `required`'s business on the fields that declare it, and
    // an unfilled optional CTA is not a malformed destination.
    if (!required && (value === null || value === undefined || value === "")) return true;
    return typeof value === "string" && HREF_PATTERN.test(value)
      ? true
      : panelTextFor(HREF_ERROR, options);
  };
}

const linkFields: Field[] = [
  {
    name: "label",
    type: "text",
    label: { es: "Texto", en: "Label", ar: "النص" },
    required: true,
    localized: true,
  },
  {
    name: "href",
    type: "text",
    label: { es: "Destino", en: "Destination", ar: "الوجهة" },
    required: true,
    validate: hrefValidate(true),
  },
];

/** Every array of links reads the same in the row header of the panel. */
const linkRowLabels = {
  singular: { es: "Enlace", en: "Link", ar: "رابط" },
  plural: { es: "Enlaces", en: "Links", ar: "الروابط" },
};

export const Navigation: GlobalConfig = {
  slug: "navigation",
  label: { es: "Navegación", en: "Navigation", ar: "التنقّل" },
  /**
   * The menu gets a history (see the long note in `theme-settings.ts` for
   * why history and not drafts).
   *
   * This is the global where undo matters most day to day: the header is
   * four or five rows, an editor reorganises it in one sitting, and until
   * now the previous arrangement existed nowhere. `_navigation_v` keeps the
   * last 30 saves and the Versions tab restores any of them.
   */
  versions: { drafts: false, max: 30 },
  admin: {
    description: {
      es: "Menú de cabecera y enlaces de pie. Rutas relativas a la región. «Vista previa» abre el sitio con lo último guardado: este global no tiene borrador, pero cada guardado deja una versión restaurable.",
      en: "Header menu and footer links. Region-relative paths. Preview opens the site as last saved: this global has no draft, but every save leaves a version you can restore.",
      ar: "قائمة الرأس وروابط التذييل. مسارات نسبية داخل المنطقة. تفتح «معاينة» الموقع بآخر ما حُفظ: لا مسودة لهذه الإعدادات، لكن كل حفظ يترك نسخة قابلة للاستعادة.",
    },
    preview: (_data, { locale }) => previewUrl(`/${previewRegion(locale)}`),
  },
  access: { read: anyone, update: isAuthenticated, readVersions: isAuthenticated },
  hooks: {
    afterChange: [
      () => {
        try {
          revalidateTag("navigation", "max");
        } catch {
          /* CLI context */
        }
      },
    ],
  },
  fields: [
    {
      name: "header",
      type: "array",
      label: { es: "Menú principal", en: "Main menu", ar: "القائمة الرئيسية" },
      labels: linkRowLabels,
      admin: {
        description: {
          es: "Enlaces del menú principal, en orden.",
          en: "Main menu links, in order.",
          ar: "روابط القائمة الرئيسية، بالترتيب.",
        },
      },
      fields: linkFields,
    },
    {
      name: "headerCta",
      type: "group",
      label: { es: "Botón destacado", en: "Featured button", ar: "الزر البارز" },
      admin: {
        description: {
          es: "Botón destacado a la derecha del menú (p. ej. «Pide una demo»). Sin texto no se muestra.",
          en: "The featured button at the end of the menu (e.g. “Book a demo”). With no label it is not shown.",
          ar: "الزر البارز في نهاية القائمة (مثل «اطلب عرضًا»). لا يظهر بدون نص.",
        },
      },
      fields: [
        {
          name: "label",
          type: "text",
          label: { es: "Texto", en: "Label", ar: "النص" },
          localized: true,
        },
        {
          name: "href",
          type: "text",
          label: { es: "Destino", en: "Destination", ar: "الوجهة" },
          validate: hrefValidate(false),
        },
      ],
    },
    {
      name: "footerGroups",
      type: "array",
      label: { es: "Columnas del pie", en: "Footer columns", ar: "أعمدة التذييل" },
      labels: {
        singular: { es: "Columna", en: "Column", ar: "عمود" },
        plural: { es: "Columnas", en: "Columns", ar: "الأعمدة" },
      },
      maxRows: 5,
      admin: {
        description: {
          es: "Columnas del pie con título (Comprar · Empresa · Ayuda…). El canon de las tiendas serias: 3-5 columnas por intención del visitante.",
          en: "Titled footer columns (Shop · Company · Help…). The pattern serious stores use: 3-5 columns, one per visitor intent.",
          ar: "أعمدة التذييل مع عناوينها (التسوّق · الشركة · المساعدة…). النمط المعتاد في المتاجر الجادّة: من 3 إلى 5 أعمدة بحسب نيّة الزائر.",
        },
      },
      fields: [
        {
          name: "label",
          type: "text",
          label: { es: "Título de la columna", en: "Column title", ar: "عنوان العمود" },
          required: true,
          localized: true,
        },
        {
          name: "links",
          type: "array",
          label: { es: "Enlaces", en: "Links", ar: "الروابط" },
          labels: linkRowLabels,
          fields: linkFields,
        },
      ],
    },
    {
      name: "footer",
      type: "array",
      label: { es: "Fila legal del pie", en: "Footer legal row", ar: "صف التذييل القانوني" },
      labels: linkRowLabels,
      admin: {
        description: {
          es: "Fila inferior del pie (legales), junto al copyright y el selector de región.",
          en: "The bottom row of the footer (legal links), next to the copyright and the region picker.",
          ar: "الصف السفلي من التذييل (الروابط القانونية)، بجوار حقوق النشر ومحدِّد المنطقة.",
        },
      },
      fields: linkFields,
    },
  ],
};
