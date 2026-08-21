/**
 * The panel's own copy, in the panel's own translation system.
 *
 * The design-system rule is that no user-visible string lives inside a
 * component (.claude/rules/design-system.md). In the storefront that means
 * next-intl; inside /admin next-intl does not run, so the equivalent is
 * Payload's `i18n.translations`: a `courvia` namespace merged into every
 * supported language, reachable from a server component as
 * `i18n.t('courvia:heading')`.
 *
 * One level deep on purpose. The keys are typed below by construction, and a
 * flat namespace is what makes that typing a two-line type instead of a
 * recursive one.
 */

/** Every string the panel's own components render. */
export interface CourviaAdminStrings {
  /** Mono, uppercased by CSS: the telemetry chip the brand uses as a signature. */
  eyebrow: string;
  heading: string;
  lead: string;
  pagesTitle: string;
  pagesHint: string;
  mediaTitle: string;
  mediaHint: string;
  siteTitle: string;
  siteHint: string;
  recentTitle: string;
  recentEmpty: string;
  /** The page-starter picker, shown only while a page has no blocks. */
  startersEyebrow: string;
  startersHeading: string;
  startersLead: string;
}

/**
 * The keys `i18n.t` accepts for our namespace.
 *
 * Payload types `t` against ITS OWN key union, which cannot know about a
 * namespace added through config, and `@payloadcms/translations` is not a
 * direct dependency of this app so its `NestedKeysStripped` is not
 * importable here. Both problems disappear by typing the prop ourselves:
 * components referenced through the import map are resolved by path, so
 * their props are never checked against Payload's `CustomComponent` — the
 * narrower type below is the one TypeScript enforces on us.
 */
export type CourviaAdminKey = `courvia:${keyof CourviaAdminStrings}`;

/** The shape a Courvia admin component needs out of the injected `i18n`. */
export interface CourviaAdminI18n {
  /** BCP-47 code of the panel language, for `Intl` formatting. */
  language: string;
  t: (key: CourviaAdminKey) => string;
}

/**
 * What `useTranslation()` gives a CLIENT component of ours.
 *
 * Same problem as `CourviaAdminKey` and the same answer: Payload types `t`
 * against its own key union, which cannot know about a namespace added
 * through config. Narrowing the hook's result once here keeps the cast out
 * of every component and keeps the keys checked.
 */
export interface CourviaTranslation {
  i18n: { language: string };
  t: (key: CourviaAdminKey) => string;
}

/**
 * Three languages, one voice — not three literal translations
 * (.claude/rules/content-voice.md). Second person, present tense, and the
 * next action rather than a welcome.
 */
export const courviaAdminTranslations: Record<"ar" | "en" | "es", { courvia: CourviaAdminStrings }> = {
  es: {
    courvia: {
      eyebrow: "Courvia · Panel",
      heading: "Empieza por la página que vas a tocar hoy.",
      lead: "Cada cambio se guarda como borrador. Compruébalo en la previsualización, también en móvil, y publícalo después.",
      pagesTitle: "Páginas",
      pagesHint: "Secciones, orden y SEO.",
      mediaTitle: "Mediateca",
      mediaHint: "Imágenes y vídeo, cada uno con su alt.",
      siteTitle: "Ver la web",
      siteHint: "Lo que ve un visitante ahora mismo.",
      recentTitle: "Editado hace poco",
      recentEmpty: "Todavía no hay páginas. Crea la primera.",
      startersEyebrow: "Página vacía",
      startersHeading: "Empieza por una composición, no por un bloque.",
      startersLead: "Escribe las secciones de golpe y luego cambia lo que quieras. Solo aparece mientras la página está vacía.",
    },
  },
  en: {
    courvia: {
      eyebrow: "Courvia · Panel",
      heading: "Start with the page you are touching today.",
      lead: "Every change is saved as a draft. Check it in preview, on a phone too, and publish after that.",
      pagesTitle: "Pages",
      pagesHint: "Sections, order and SEO.",
      mediaTitle: "Media",
      mediaHint: "Images and video, each with its alt text.",
      siteTitle: "Open the site",
      siteHint: "What a visitor sees right now.",
      recentTitle: "Edited recently",
      recentEmpty: "No pages yet. Create the first one.",
      startersEyebrow: "Empty page",
      startersHeading: "Start from a composition, not from a block.",
      startersLead: "It writes the sections in one go and you change whatever you want after. It only shows while the page is empty.",
    },
  },
  ar: {
    courvia: {
      eyebrow: "كورفيا · اللوحة",
      heading: "ابدأ بالصفحة التي ستعمل عليها اليوم.",
      lead: "كل تغيير يُحفَظ كمسودة. راجعه في المعاينة، وعلى الهاتف أيضًا، ثم انشره.",
      pagesTitle: "الصفحات",
      pagesHint: "الأقسام والترتيب وتحسين محركات البحث.",
      mediaTitle: "الوسائط",
      mediaHint: "الصور والفيديو، ولكلٍّ نصه البديل.",
      siteTitle: "افتح الموقع",
      siteHint: "ما يراه الزائر الآن.",
      recentTitle: "عُدِّلت مؤخرًا",
      recentEmpty: "لا توجد صفحات بعد. أنشئ الأولى.",
      startersEyebrow: "صفحة فارغة",
      startersHeading: "ابدأ بتركيبة، لا ببلوك واحد.",
      startersLead: "تكتب الأقسام دفعة واحدة ثم تغيّر ما تشاء. لا تظهر إلا والصفحة فارغة.",
    },
  },
};
