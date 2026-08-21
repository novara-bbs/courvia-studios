/**
 * Editor-facing copy for the design controls.
 *
 * `controls.ts` owns the VOCABULARY (enum values bound to tokens); this file
 * owns what a human reads when choosing one. They are separate because they
 * fail differently: dropping a value from `controls.ts` is a content
 * migration, while a better wording is a text change — and because a control
 * table that also carried three languages of prose would stop being readable
 * as a table.
 *
 * Nothing here widens the surface: an option still stores its enum value.
 * The only thing that changes is that the panel stops showing the editor the
 * raw one. That distinction is the whole point of ADR-016 — the barrier is
 * architectural, so it survives being made friendly.
 *
 * Lives in this package rather than in the CMS layer because the CMS layer
 * is a PROJECTION (apps/web/src/payload/blocks.ts is generated from the
 * registry, never hand-written): a string typed there would be a string
 * living outside the system that owns it.
 */
import { CONTROLS, CONTROL_NAMES } from "./controls";
import type { ControlName } from "./controls";

/**
 * The languages the admin panel is read in. Deliberately a local constant
 * rather than an import from @courvia/platform: `pnpm arch` keeps this
 * package to design-tokens only, so that it stays generatable into CSS with
 * nothing else installed.
 */
export const ADMIN_LOCALES = ["es", "en", "ar"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];

/** One string in every admin language. All three are required: a partial
 *  record is how a panel ends up half-Spanish for an English editor. */
export type LocalizedText = Record<AdminLocale, string>;

export interface ControlCopy {
  label: LocalizedText;
  /** One line under the control: what it changes, in measurable terms. */
  help: LocalizedText;
  /** One entry per enum value — a bijection with CONTROLS[name].values,
   *  asserted by copy.test.ts so a new value cannot ship unlabelled. */
  values: Record<string, LocalizedText>;
}

/** Header of the collapsible that holds every design control. */
export const APPEARANCE_GROUP_COPY: { label: LocalizedText; help: LocalizedText } = {
  label: { es: "Diseño", en: "Design", ar: "التصميم" },
  help: {
    es: "Controles ligados a los tokens de marca. No hay valores libres: el sistema garantiza contraste y coherencia.",
    en: "Controls bound to the brand tokens. No free values: the system guarantees contrast and consistency.",
    ar: "أدوات مرتبطة برموز الهوية. لا قيم حرة: النظام يضمن التباين والاتساق.",
  },
};

const SPACE_VALUES: Record<string, LocalizedText> = {
  none: { es: "Sin espacio", en: "No space", ar: "بلا مسافة" },
  sm: { es: "Pequeño", en: "Small", ar: "صغير" },
  md: { es: "Medio", en: "Medium", ar: "متوسط" },
  lg: { es: "Grande", en: "Large", ar: "كبير" },
  xl: { es: "Muy grande", en: "Extra large", ar: "كبير جدًا" },
};

export const CONTROL_COPY: Record<ControlName, ControlCopy> = {
  spaceBlockStart: {
    label: { es: "Espacio arriba", en: "Space above", ar: "مسافة أعلى" },
    help: {
      es: "Aire entre esta sección y la anterior, sobre la escala de la marca.",
      en: "Air between this section and the one above, on the brand scale.",
      ar: "المسافة بين هذا القسم وما قبله، وفق مقياس الهوية.",
    },
    values: SPACE_VALUES,
  },
  spaceBlockEnd: {
    label: { es: "Espacio abajo", en: "Space below", ar: "مسافة أسفل" },
    help: {
      es: "Aire entre esta sección y la siguiente, sobre la escala de la marca.",
      en: "Air between this section and the next, on the brand scale.",
      ar: "المسافة بين هذا القسم وما يليه، وفق مقياس الهوية.",
    },
    values: SPACE_VALUES,
  },
  background: {
    label: { es: "Fondo", en: "Background", ar: "الخلفية" },
    help: {
      es: "Un papel del tema, nunca un color. Invertido y acento reasignan el texto para que el contraste aguante.",
      en: "A theme role, never a colour. Inverted and accent rebind the text so contrast holds.",
      ar: "دور من السمة، لا لون. المعكوس واللون المميّز يعيدان ضبط النص للحفاظ على التباين.",
    },
    values: {
      none: { es: "Sin fondo", en: "No background", ar: "بلا خلفية" },
      surface: { es: "Superficie", en: "Surface", ar: "سطح" },
      raised: { es: "Superficie elevada", en: "Raised surface", ar: "سطح مرتفع" },
      inverse: { es: "Invertido", en: "Inverted", ar: "معكوس" },
      accent: { es: "Acento", en: "Accent", ar: "لون مميّز" },
    },
  },
  width: {
    label: { es: "Ancho de la columna", en: "Column width", ar: "عرض العمود" },
    help: {
      es: "Mide la columna, no la banda: el fondo llega al borde de todas formas.",
      en: "It measures the column, not the band: the background reaches the edge either way.",
      ar: "يقيس العمود لا الشريط: الخلفية تصل الحافة في الحالتين.",
    },
    values: {
      prose: { es: "Columna de lectura", en: "Reading measure", ar: "عمود قراءة" },
      content: { es: "Contenido (1180 px)", en: "Content (1180px)", ar: "محتوى (1180 بكسل)" },
      full: { es: "A todo el ancho", en: "Full width", ar: "بعرض كامل" },
    },
  },
  align: {
    label: { es: "Alineación", en: "Alignment", ar: "المحاذاة" },
    help: {
      es: "Lógica, no física: en árabe se invierte sola.",
      en: "Logical, not physical: it flips by itself in Arabic.",
      ar: "منطقية لا فيزيائية: تنعكس تلقائيًا في العربية.",
    },
    values: {
      start: { es: "Al inicio", en: "To the start", ar: "إلى البداية" },
      center: { es: "Centrado", en: "Centred", ar: "توسيط" },
    },
  },
  columns: {
    label: { es: "Columnas", en: "Columns", ar: "الأعمدة" },
    help: {
      es: "En móvil baja siempre a una columna.",
      en: "Always collapses to one column on mobile.",
      ar: "ينهار دائمًا إلى عمود واحد على الجوال.",
    },
    values: {
      "2": { es: "2 columnas", en: "2 columns", ar: "عمودان" },
      "3": { es: "3 columnas", en: "3 columns", ar: "3 أعمدة" },
      "4": { es: "4 columnas", en: "4 columns", ar: "4 أعمدة" },
    },
  },
  mediaPosition: {
    label: { es: "Lado de la imagen", en: "Image side", ar: "جهة الصورة" },
    help: {
      es: "Lógico, no físico: en árabe cambia de lado solo.",
      en: "Logical, not physical: it swaps sides by itself in Arabic.",
      ar: "منطقي لا فيزيائي: يتبدّل الجانب تلقائيًا في العربية.",
    },
    values: {
      start: { es: "Antes del texto", en: "Before the text", ar: "قبل النص" },
      end: { es: "Después del texto", en: "After the text", ar: "بعد النص" },
    },
  },
  height: {
    label: { es: "Altura de la banda", en: "Band height", ar: "ارتفاع الشريط" },
    help: {
      es: "Reserva pantalla para un momento de la página. El resto sigue el ritmo vertical.",
      en: "Reserves screen for one moment of the page. Everything else keeps the vertical rhythm.",
      ar: "يحجز مساحة الشاشة للحظة واحدة في الصفحة. الباقي يتبع الإيقاع الرأسي.",
    },
    values: {
      auto: { es: "Según el contenido", en: "Fits the content", ar: "حسب المحتوى" },
      tall: {
        es: "Alta · 62 % de pantalla",
        en: "Tall · 62% of screen",
        ar: "مرتفع · 62٪ من الشاشة",
      },
      full: {
        es: "Casi completa · 88 %",
        en: "Almost full · 88%",
        ar: "شبه كامل · 88٪",
      },
    },
  },
  overlay: {
    label: { es: "Velo sobre la imagen", en: "Scrim over the image", ar: "حجاب فوق الصورة" },
    help: {
      es: "Cubre la media para que el texto encima siga legible. El color sale del fondo del tema.",
      en: "Veils the media so type over it stays legible. The colour comes from the theme background.",
      ar: "يغطي الوسائط ليبقى النص فوقها مقروءًا. اللون مأخوذ من خلفية السمة.",
    },
    values: {
      none: { es: "Sin velo", en: "No scrim", ar: "بلا حجاب" },
      soft: { es: "Suave · 58 %", en: "Soft · 58%", ar: "خفيف · 58٪" },
      strong: { es: "Fuerte · 82 %", en: "Strong · 82%", ar: "قوي · 82٪" },
      gradient: {
        es: "Degradado · claro arriba, denso abajo",
        en: "Gradient · light at the top, dense below",
        ar: "تدرّج · خفيف أعلى وكثيف أسفل",
      },
    },
  },
  reveal: {
    label: { es: "Entrada al hacer scroll", en: "Scroll entrance", ar: "الظهور عند التمرير" },
    help: {
      es: "Solo desplazamiento, nunca opacidad: si la animación no llega a correr, la sección se ve igual.",
      en: "Transform only, never opacity: if the animation never runs, the section still shows.",
      ar: "تحريك فقط دون شفافية: إن لم تعمل الحركة يظل القسم ظاهرًا.",
    },
    values: {
      none: { es: "Sin animación", en: "No animation", ar: "بلا حركة" },
      rise: { es: "Sube 24 px", en: "Rises 24px", ar: "يصعد 24 بكسل" },
      settle: { es: "Se asienta · 98,5 %", en: "Settles · 98.5%", ar: "يستقر · 98٫5٪" },
    },
  },
  divider: {
    label: { es: "Filete superior", en: "Top rule", ar: "خط علوي" },
    help: {
      es: "Separa dos bandas que comparten fondo, sin inventar un color.",
      en: "Separates two bands that share a background, without inventing a colour.",
      ar: "يفصل شريطين يتشاركان الخلفية دون اختراع لون.",
    },
    values: {
      none: { es: "Sin filete", en: "No rule", ar: "بلا خط" },
      hairline: { es: "Línea fina", en: "Hairline", ar: "خط رفيع" },
      soft: { es: "Línea difuminada", en: "Faded line", ar: "خط باهت" },
    },
  },
  hiddenOn: {
    label: { es: "Visibilidad", en: "Visibility", ar: "الظهور" },
    help: {
      es: "Se oculta para todos, también para los lectores de pantalla.",
      en: "Hidden from everyone, screen readers included.",
      ar: "يُخفى عن الجميع، بما في ذلك قارئات الشاشة.",
    },
    values: {
      never: { es: "Siempre visible", en: "Always visible", ar: "ظاهر دائمًا" },
      mobile: { es: "Oculto en móvil", en: "Hidden on mobile", ar: "مخفي على الجوال" },
      desktop: { es: "Oculto en escritorio", en: "Hidden on desktop", ar: "مخفي على سطح المكتب" },
    },
  },
  themeScope: {
    label: { es: "Tema de la sección", en: "Section theme", ar: "سمة القسم" },
    help: {
      es: "Anida un tema de marca solo en esta sección; el resto de la página no cambia.",
      en: "Nests one brand theme inside this section only; the rest of the page is untouched.",
      ar: "يُدرج سمة هوية داخل هذا القسم فقط دون تغيير باقي الصفحة.",
    },
    values: {
      inherit: { es: "El de la página", en: "Page theme", ar: "سمة الصفحة" },
      volt: { es: "Volt · principal, oscuro", en: "Volt · main, dark", ar: "فولت · الأساسي، داكن" },
      carbon: {
        es: "Carbon · taller, claro",
        en: "Carbon · workshop, light",
        ar: "كاربون · الورشة، فاتح",
      },
      club: { es: "Club · comunidad", en: "Club · community", ar: "كلوب · المجتمع" },
    },
  },
};

export interface ControlOption {
  label: LocalizedText;
  value: string;
}

/**
 * The options a control offers, each already carrying its three languages.
 *
 * Built from `CONTROLS[name].values` rather than from the copy table, so the
 * ORDER an editor sees is the order the vocabulary declares and a value that
 * exists without copy throws here instead of rendering as itself. That throw
 * is the point: the previous projection fell back to `{ label: value }`, so
 * a missing label looked exactly like a deliberate one.
 */
export function controlOptions(name: ControlName): ControlOption[] {
  const copy = CONTROL_COPY[name];
  return CONTROLS[name].values.map((value) => {
    const label = copy.values[value];
    if (label === undefined) {
      throw new Error(`No editor copy for ${name}='${value}' (packages/appearance/src/copy.ts)`);
    }
    return { label, value };
  });
}

/** Every control, in declaration order, with its copy resolved. */
export function controlsWithCopy(): { name: ControlName; copy: ControlCopy }[] {
  return CONTROL_NAMES.map((name) => ({ name, copy: CONTROL_COPY[name] }));
}
