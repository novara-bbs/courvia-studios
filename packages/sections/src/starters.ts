/**
 * Page starters: the composition an editor gets instead of an empty array.
 *
 * The empty state is where a block-based CMS loses people. A new page today
 * offers nineteen block types and no opinion about which four go together,
 * so the first thing a marketer does is guess — and a guessed page is how a
 * design system ends up with a landing that has three headlines and no call
 * to action. Shopify solved it by making a section's `preset` MANDATORY;
 * WordPress ships patterns as files with a header. Both put the composition
 * in the theme, authored by whoever owns the design, and neither lets the
 * editor manage a library of them. This is that, for one brand.
 *
 * Deliberately NOT a feature an editor administers. A starter library that
 * the panel can create, edit and share is the multi-client half of a page
 * builder, and it costs a schema, an access model and a migration path to
 * serve exactly one brand. These are files, reviewed in a pull request, and
 * changing one is a diff.
 *
 * Two things travel differently from ordinary content and both are here for
 * a reason:
 *
 *  - Every visible string is a `LocalizedText`, because a starter is written
 *    once and used by editors working in three content languages. Handing a
 *    Spanish placeholder to someone editing the English page is the same
 *    failure as a Spanish panel for an English editor.
 *  - Rich text is declared as PARAGRAPHS, not as editor state. This package
 *    may not touch the editor's format (dsl/fields.ts), so the app converts
 *    them — the same injection the renderer already uses for serialization.
 */
import type { LocalizedText } from "@courvia/appearance";

/** Localized prose for a rich-text field, one entry per paragraph. */
export interface StarterProse {
  paragraphs: LocalizedText[];
}

export type StarterValue =
  | LocalizedText
  | StarterProse
  | StarterValue[]
  | boolean
  | number
  | string
  | { [key: string]: StarterValue };

export interface StarterBlock {
  blockType: string;
  /** Payload's per-instance label. It names the block in the panel AND is
   *  the anchor `anchorNav` targets, so a starter with an index has to fill
   *  it — the two halves are the same string by design. */
  blockName?: string;
  [field: string]: StarterValue | undefined;
}

export interface Starter {
  /** Stable key: it identifies the starter in the picker and nowhere else,
   *  so renaming one is not a content migration. */
  id: string;
  name: LocalizedText;
  /** One line about when to reach for it. Not a description of the blocks —
   *  the picker lists those from the registry. */
  summary: LocalizedText;
  blocks: StarterBlock[];
}

const LOCALES = ["ar", "en", "es"] as const;

function isLocalizedText(value: object): value is LocalizedText {
  const keys = Object.keys(value);
  return (
    keys.length === LOCALES.length &&
    LOCALES.every((locale) => typeof (value as Record<string, unknown>)[locale] === "string")
  );
}

function isProse(value: object): value is StarterProse {
  const paragraphs = (value as StarterProse).paragraphs;
  return Array.isArray(paragraphs);
}

/**
 * One starter, resolved for one content language and one editor.
 *
 * `toRichText` is injected exactly like `RenderContext.renderRichText`: the
 * shape of a rich-text document belongs to the app that chose the editor,
 * and a starter that hard-coded Lexical JSON would tie this package to it
 * forever.
 */
export function resolveStarter(
  starter: Starter,
  locale: keyof LocalizedText,
  toRichText: (paragraphs: string[], locale: keyof LocalizedText) => unknown,
): Record<string, unknown>[] {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (typeof value !== "object" || value === null) return value;
    if (isLocalizedText(value)) return value[locale];
    if (isProse(value)) {
      return toRichText(
        value.paragraphs.map((paragraph) => paragraph[locale]),
        locale,
      );
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, walk(item)]),
    );
  };
  return starter.blocks.map((block) => walk(block) as Record<string, unknown>);
}

/**
 * The section types a starter writes, in order.
 *
 * Types, not labels, and that is the whole point of the split: this module
 * is imported by a CLIENT component in the admin, and reaching into
 * `SECTIONS` for a label would drag nineteen storefront render functions
 * into the panel's bundle — the one thing L4 may not do (ARCHITECTURE.md
 * §1). Measured, not assumed: with that import present, the section markup
 * appeared in the chunks /admin/login itself downloads. The labels are
 * looked up where the registry already lives, on the server, and travel to
 * the picker as data.
 */
export function starterBlockTypes(starter: Starter): string[] {
  return starter.blocks.map((block) => block.blockType);
}

/* -------------------------------------------------------------------- */

const CTA_DEMO = {
  label: { es: "Pide una demo", en: "Book a demo", ar: "اطلب عرضًا" },
  href: "/contacto",
};

/**
 * Landing de producto — the page that has to convince.
 *
 * The order is the argument: what it does, how to read the page, the three
 * decisions that explain the product, how it gets used, the measured
 * figures, the two questions everyone asks, one exit. The `blockName`s are
 * not decoration either: `anchorNav` targets them.
 */
const productLanding: Starter = {
  id: "product-landing",
  name: {
    es: "Landing de producto",
    en: "Product landing",
    ar: "صفحة منتج",
  },
  summary: {
    es: "Para presentar un robot: qué cambia en tu juego, por dentro, las cifras y una sola salida.",
    en: "To present a robot: what changes in your game, what is inside, the figures and one way out.",
    ar: "لعرض روبوت: ما الذي يتغيّر في لعبك، وما بداخله، والأرقام، ومخرج واحد.",
  },
  blocks: [
    {
      blockType: "stage",
      blockName: "Portada",
      level: "h1",
      eyebrow: { es: "Gama", en: "Range", ar: "التشكيلة" },
      heading: {
        es: "Una frase sobre lo que mejora en tu juego",
        en: "One line about what improves in your game",
        ar: "جملة واحدة عمّا يتحسّن في لعبك",
      },
      lead: {
        es: "Dos líneas como mucho. Qué hace el robot y para quién, sin adjetivos que no se puedan medir.",
        en: "Two lines at most. What the robot does and who it is for, with no adjective you cannot measure.",
        ar: "سطران على الأكثر. ما يفعله الروبوت ولمن، بلا صفات لا تُقاس.",
      },
      ctas: [
        {
          label: { es: "Ver la ficha", en: "See the spec sheet", ar: "انظر البطاقة الفنية" },
          href: "/robots",
        },
        CTA_DEMO,
      ],
      appearance: { height: "tall", overlay: "gradient", spaceBlockEnd: "md" },
    },
    {
      blockType: "anchorNav",
      blockName: "Índice",
      label: { es: "En esta página", en: "On this page", ar: "في هذه الصفحة" },
      items: [
        {
          text: { es: "Lo que hace distinto", en: "What sets it apart", ar: "ما يميّزه" },
          anchor: "lo-que-hace-distinto",
        },
        { text: { es: "Por dentro", en: "Inside", ar: "من الداخل" }, anchor: "por-dentro" },
        { text: { es: "Datos", en: "Figures", ar: "الأرقام" }, anchor: "datos" },
        { text: { es: "Preguntas", en: "Questions", ar: "أسئلة" }, anchor: "preguntas" },
      ],
      appearance: { spaceBlockStart: "none", spaceBlockEnd: "lg" },
    },
    {
      blockType: "bento",
      blockName: "Lo que hace distinto",
      heading: {
        es: "Tres decisiones, no una lista de características",
        en: "Three decisions, not a feature list",
        ar: "ثلاثة قرارات، لا قائمة خصائص",
      },
      items: [
        {
          span: "lg",
          eyebrow: { es: "La grande", en: "The big one", ar: "الأهم" },
          title: {
            es: "La decisión que explica el producto",
            en: "The decision that explains the product",
            ar: "القرار الذي يفسّر المنتج",
          },
          body: {
            es: "Una pieza ancha para lo que de verdad diferencia. Si todo es importante, nada lo es.",
            en: "A wide tile for what actually sets it apart. If everything matters, nothing does.",
            ar: "بطاقة عريضة لما يميّزه فعلًا. إذا كان كل شيء مهمًّا فلا شيء مهم.",
          },
        },
        {
          span: "md",
          eyebrow: { es: "Apoyo", en: "Support", ar: "سند" },
          title: { es: "Segunda decisión", en: "Second decision", ar: "القرار الثاني" },
          body: {
            es: "Un dato con unidad vale más que tres adjetivos.",
            en: "One figure with a unit beats three adjectives.",
            ar: "رقم بوحدته أقوى من ثلاث صفات.",
          },
        },
        {
          span: "md",
          eyebrow: { es: "Apoyo", en: "Support", ar: "سند" },
          title: { es: "Tercera decisión", en: "Third decision", ar: "القرار الثالث" },
          body: {
            es: "Si no se mide, no se afirma.",
            en: "If it is not measured, it is not claimed.",
            ar: "ما لا يُقاس لا يُقال.",
          },
        },
      ],
      appearance: { background: "surface", divider: "hairline", reveal: "rise" },
    },
    {
      blockType: "steps",
      blockName: "Por dentro",
      heading: {
        es: "De la caja a la primera bola",
        en: "Box to first ball",
        ar: "من الصندوق إلى أول كرة",
      },
      lead: {
        es: "El montaje es parte del producto. Si cuesta, se entrena menos.",
        en: "Setup is part of the product. If it costs effort, you drill less.",
        ar: "التركيب جزء من المنتج. إن كان شاقًّا قلّ التدريب.",
      },
      items: [
        {
          title: { es: "Primer paso", en: "First step", ar: "الخطوة الأولى" },
          body: {
            es: "Una acción por paso, en presente.",
            en: "One action per step, in the present tense.",
            ar: "فعل واحد لكل خطوة، بصيغة المضارع.",
          },
        },
        {
          title: { es: "Segundo paso", en: "Second step", ar: "الخطوة الثانية" },
          body: {
            es: "La numeración la pone el diseño; no la escribas.",
            en: "The numbering is done by the design; do not type it.",
            ar: "الترقيم يضعه التصميم؛ لا تكتبه.",
          },
        },
        {
          title: { es: "Tercer paso", en: "Third step", ar: "الخطوة الثالثة" },
          body: {
            es: "Cuatro pasos como mucho.",
            en: "Four steps at most.",
            ar: "أربع خطوات على الأكثر.",
          },
        },
      ],
      appearance: { columns: "3", divider: "hairline" },
    },
    {
      blockType: "specTable",
      blockName: "Datos",
      heading: { es: "Lo que se mide", en: "What we measure", ar: "ما يُقاس" },
      lead: {
        es: "Elige los productos y la tabla se rellena sola. Cada cifra llega con su estado de verificación.",
        en: "Pick the products and the table fills itself. Every figure arrives with its verification state.",
        ar: "اختر المنتجات ويمتلئ الجدول وحده. كل رقم يصل بحالة تحقّقه.",
      },
      products: [],
      appearance: { background: "surface", reveal: "rise" },
    },
    {
      blockType: "faq",
      blockName: "Preguntas",
      heading: {
        es: "Preguntas frecuentes",
        en: "Frequently asked questions",
        ar: "الأسئلة المتكرّرة",
      },
      items: [
        {
          question: {
            es: "¿Qué te preguntan siempre antes de comprar?",
            en: "What do they always ask before buying?",
            ar: "ما الذي يُسأل دائمًا قبل الشراء؟",
          },
          answer: {
            paragraphs: [
              {
                es: "Esa es la primera. Respóndela sin rodeos y con la cifra si la hay.",
                en: "That is the first one. Answer it plainly, with the figure if there is one.",
                ar: "هذا هو السؤال الأول. أجب عنه مباشرة، وبالرقم إن وُجد.",
              },
            ],
          },
        },
        {
          question: {
            es: "¿Y lo que preguntan justo después?",
            en: "And what do they ask right after?",
            ar: "وما الذي يُسأل بعده مباشرة؟",
          },
          answer: {
            paragraphs: [
              {
                es: "Garantía, repuestos y plazo suelen ser la segunda y la tercera.",
                en: "Warranty, spare parts and lead time are usually second and third.",
                ar: "الضمان وقطع الغيار ومدة التسليم هي الثانية والثالثة عادة.",
              },
            ],
          },
        },
      ],
      appearance: { background: "surface" },
    },
    {
      blockType: "ctaBand",
      blockName: "Cierre",
      heading: {
        es: "Una llamada, una acción",
        en: "One call, one action",
        ar: "نداء واحد، فعل واحد",
      },
      body: {
        es: "Sin dos botones que compiten.",
        en: "No two buttons competing.",
        ar: "بلا زرّين يتنافسان.",
      },
      cta: [CTA_DEMO],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
};

/**
 * Lanzamiento — the page for a product that cannot be bought yet.
 *
 * Its job is honesty under pressure: state, not dates; a list, not a
 * pre-order. The timeline and the waitlist are the two blocks that make that
 * possible, which is why they are the ones the starter puts on the page.
 */
const launch: Starter = {
  id: "launch",
  name: { es: "Lanzamiento", en: "Launch", ar: "إطلاق" },
  summary: {
    es: "Para lo que aún no se vende: en qué punto está, qué falta y cómo entrar en la lista.",
    en: "For what is not on sale yet: where it stands, what is left and how to join the list.",
    ar: "لما لم يُطرح بعد: أين وصل، وما تبقّى، وكيف تنضمّ إلى القائمة.",
  },
  blocks: [
    {
      blockType: "stage",
      blockName: "Portada",
      level: "h1",
      eyebrow: { es: "Lanzamiento", en: "Launch", ar: "إطلاق" },
      heading: {
        es: "Lo que estamos construyendo",
        en: "What we are building",
        ar: "ما الذي نبنيه",
      },
      lead: {
        es: "Sin fechas que no puedas cumplir y sin precio hasta que exista. Cuenta en qué punto está y qué falta.",
        en: "No dates you cannot keep and no price until there is one. Say where it stands and what is left.",
        ar: "بلا مواعيد لا تستطيع الوفاء بها وبلا سعر حتى يوجد. قل أين وصل وما تبقّى.",
      },
      ctas: [
        {
          label: { es: "Entra en la lista", en: "Join the list", ar: "انضمّ إلى القائمة" },
          href: "/contacto",
        },
      ],
      appearance: { height: "tall", overlay: "gradient", spaceBlockEnd: "md" },
    },
    {
      blockType: "statBand",
      blockName: "Cifras",
      heading: { es: "Dónde estamos", en: "Where we are", ar: "أين نحن" },
      items: [
        {
          value: "—",
          label: {
            es: "Cifra que ya puedes defender",
            en: "A figure you can already defend",
            ar: "رقم تستطيع الدفاع عنه الآن",
          },
          note: { es: "objetivo de diseño", en: "design target", ar: "هدف تصميمي" },
        },
        {
          value: "—",
          label: { es: "Segunda cifra", en: "Second figure", ar: "الرقم الثاني" },
          note: { es: "objetivo de diseño", en: "design target", ar: "هدف تصميمي" },
        },
        {
          value: "—",
          label: { es: "Tercera cifra", en: "Third figure", ar: "الرقم الثالث" },
          note: { es: "objetivo de diseño", en: "design target", ar: "هدف تصميمي" },
        },
      ],
      appearance: { background: "surface" },
    },
    {
      blockType: "timeline",
      blockName: "Validación",
      heading: {
        es: "El camino, con su estado",
        en: "The road, with its state",
        ar: "الطريق وحالته",
      },
      items: [
        {
          label: { es: "FASE 1", en: "PHASE 1", ar: "المرحلة ١" },
          title: { es: "Hecho", en: "Done", ar: "منجز" },
          body: {
            es: "Lo que ya está cerrado.",
            en: "What is already closed.",
            ar: "ما أُغلق فعلًا.",
          },
          state: "done",
        },
        {
          label: { es: "FASE 2", en: "PHASE 2", ar: "المرحلة ٢" },
          title: { es: "En curso", en: "In progress", ar: "قيد التنفيذ" },
          body: {
            es: "Lo que se está haciendo ahora.",
            en: "What is being done now.",
            ar: "ما يجري الآن.",
          },
          state: "current",
        },
        {
          label: { es: "FASE 3", en: "PHASE 3", ar: "المرحلة ٣" },
          title: { es: "Siguiente", en: "Next", ar: "التالي" },
          body: {
            es: "Lo que viene, sin fecha si no la hay.",
            en: "What comes next, with no date if there is none.",
            ar: "ما سيأتي، بلا تاريخ إن لم يكن.",
          },
          state: "next",
        },
      ],
      appearance: { reveal: "rise" },
    },
    {
      blockType: "waitlist",
      blockName: "Lista",
      heading: { es: "Entra en la lista", en: "Join the list", ar: "انضمّ إلى القائمة" },
      body: {
        es: "Sin pago y sin compromiso. Escribimos cuando haya algo que contar, no antes.",
        en: "No payment and no commitment. We write when there is something to say, not before.",
        ar: "بلا دفع ولا التزام. نكتب حين يكون هناك ما يُقال، لا قبل ذلك.",
      },
      intent: "waitlist",
      appearance: { background: "surface" },
    },
    {
      blockType: "faq",
      blockName: "Preguntas",
      heading: {
        es: "Lo que preguntan los primeros",
        en: "What the early ones ask",
        ar: "ما يسأله الأوائل",
      },
      items: [
        {
          question: {
            es: "¿Cuándo estará disponible?",
            en: "When will it be available?",
            ar: "متى سيتوفّر؟",
          },
          answer: {
            paragraphs: [
              {
                es: "Di lo que sabes y no inventes un trimestre. La honestidad aquí se cobra en confianza más tarde.",
                en: "Say what you know and do not invent a quarter. Honesty here is paid back in trust later.",
                ar: "قل ما تعرفه ولا تخترع ربع سنة. الصدق هنا يُردّ ثقةً لاحقًا.",
              },
            ],
          },
        },
        {
          question: {
            es: "¿Cuánto va a costar?",
            en: "What will it cost?",
            ar: "كم سيكلّف؟",
          },
          answer: {
            paragraphs: [
              {
                es: "Si no hay precio, dilo. Un precio que luego cambia cuesta más que no darlo.",
                en: "If there is no price, say so. A price that later changes costs more than no price.",
                ar: "إن لم يكن هناك سعر فقل ذلك. سعر يتغيّر لاحقًا أغلى من غيابه.",
              },
            ],
          },
        },
      ],
      appearance: { background: "surface" },
    },
  ],
};

/**
 * Página de empresa — who we are, in four blocks.
 *
 * No figures and no product: this is the one page where the brand talks
 * about itself, and the shortest structure that does not turn into a
 * brochure is a headline, three principles, one line of voice and an exit.
 */
const company: Starter = {
  id: "company",
  name: { es: "Página de empresa", en: "Company page", ar: "صفحة الشركة" },
  summary: {
    es: "Para contar quién eres: un titular, tres principios con consecuencia y una salida.",
    en: "To say who you are: a headline, three principles with consequences and one way out.",
    ar: "لتقول من أنت: عنوان، وثلاثة مبادئ بنتائجها، ومخرج واحد.",
  },
  blocks: [
    {
      blockType: "hero",
      blockName: "Portada",
      level: "h1",
      eyebrow: { es: "Courvia", en: "Courvia", ar: "كورفيا" },
      heading: {
        es: "Un título que diga quién eres, no qué vendes",
        en: "A headline that says who you are, not what you sell",
        ar: "عنوان يقول من أنت، لا ماذا تبيع",
      },
      lead: {
        es: "Una frase. Si necesitas tres, todavía no sabes cuál es.",
        en: "One sentence. If you need three, you have not found it yet.",
        ar: "جملة واحدة. إن احتجت ثلاثًا فلم تجدها بعد.",
      },
      appearance: { spaceBlockEnd: "md" },
    },
    {
      blockType: "featureGrid",
      blockName: "Cómo trabajamos",
      heading: { es: "Cómo trabajamos", en: "How we work", ar: "كيف نعمل" },
      items: [
        {
          title: { es: "Un principio", en: "A principle", ar: "مبدأ" },
          body: {
            es: "Con su consecuencia práctica, no con su eslogan.",
            en: "With its practical consequence, not its slogan.",
            ar: "بنتيجته العملية، لا بشعاره.",
          },
        },
        {
          title: { es: "Otro principio", en: "Another principle", ar: "مبدأ آخر" },
          body: {
            es: "Tres bastan. Cinco ya nadie los lee.",
            en: "Three is enough. Nobody reads five.",
            ar: "ثلاثة تكفي. خمسة لا يقرأها أحد.",
          },
        },
        {
          title: { es: "El tercero", en: "The third", ar: "الثالث" },
          body: {
            es: "Si vale para cualquier empresa, sobra.",
            en: "If it would fit any company, drop it.",
            ar: "إن صلح لأي شركة فاحذفه.",
          },
        },
      ],
      appearance: { background: "surface", columns: "3" },
    },
    {
      blockType: "quote",
      blockName: "Voz",
      quote: {
        es: "Una frase que puedas repetir en una feria sin que suene a folleto.",
        en: "A line you could repeat at a trade show without it sounding like a brochure.",
        ar: "جملة تستطيع تكرارها في معرض دون أن تبدو كمنشور دعائي.",
      },
      author: { es: "Equipo Courvia", en: "Team Courvia", ar: "فريق كورفيا" },
      appearance: { align: "center" },
    },
    {
      blockType: "ctaBand",
      blockName: "Cierre",
      heading: {
        es: "A dónde quieres que vayan",
        en: "Where you want them to go",
        ar: "إلى أين تريدهم أن يذهبوا",
      },
      body: { es: "Una sola salida.", en: "One exit only.", ar: "مخرج واحد فقط." },
      cta: [
        {
          label: { es: "Ver el catálogo", en: "Browse the catalogue", ar: "تصفّح الكتالوج" },
          href: "/robots",
        },
      ],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
};

export const STARTERS: readonly Starter[] = [productLanding, launch, company];
