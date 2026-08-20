import { defineSection } from "../../dsl/define-section";

/**
 * The deliberate escape hatch — and the shape of it is the whole argument.
 *
 * Every builder ships a raw-HTML block (Shopify's Custom Liquid, Gutenberg's
 * Custom HTML, Webflow's Code Embed). Each one also punches straight through
 * the design system: arbitrary markup means arbitrary colour, physical
 * margins that break RTL, and a script tag with the site's own origin. So
 * Courvia's escape hatch takes a PROVIDER and an ID, never markup: the URL
 * is built here from an allowlist and the id is pattern-checked, which
 * covers the honest use case (a launch video) with no injection surface.
 */
const PROVIDERS = {
  youtube: {
    pattern: /^[A-Za-z0-9_-]{6,24}$/,
    src: (id: string) => `https://www.youtube-nocookie.com/embed/${id}`,
  },
  vimeo: {
    pattern: /^[0-9]{6,12}$/,
    src: (id: string) => `https://player.vimeo.com/video/${id}`,
  },
} as const;

type ProviderId = keyof typeof PROVIDERS;

export const embed = defineSection({
  type: "embed",
  labels: { es: "Vídeo incrustado", en: "Embedded video", ar: "فيديو مضمّن" },
  fields: {
    provider: { kind: "select", required: true, options: ["youtube", "vimeo"] },
    /** Just the id — "dQw4w9WgXcQ", not a URL and never markup. */
    videoId: { kind: "text", required: true, max: 24 },
    /** Accessible name for the frame; screen readers announce it. */
    title: { kind: "text", required: true, localized: true, max: 120 },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "width", "reveal", "themeScope"],
  fixture: { provider: "youtube", videoId: "aqz-KESearI", title: "Tempo R1 en pista" },
  render: (content, ctx) => {
    const provider = content.provider as ProviderId;
    const videoId = content.videoId as string;
    const title = content.title as string;
    const definition = PROVIDERS[provider];
    if (definition === undefined || !definition.pattern.test(videoId)) {
      return ctx.preview ? (
        <p className="cv-section-problem">
          Identificador de vídeo inválido para «{provider}»: {videoId}
        </p>
      ) : null;
    }
    return (
      <div className="cv-embed">
        <iframe
          src={definition.src(videoId)}
          title={title}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  },
});
