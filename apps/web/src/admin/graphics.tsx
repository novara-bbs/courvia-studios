import { Anybody } from "next/font/google";

/**
 * The display family the volt theme uses for headlines. The panel does not
 * load the storefront's font stack — a back office in a webfont is slower
 * for no gain — so exactly one element gets one family: the wordmark on the
 * login screen, which is the first thing anyone sees of this project.
 *
 * `preload: false` for the same reason app/(frontend)/fonts.ts sets it: the
 * face is fetched when a rule actually applies it, not on every panel route.
 */
const anybody = Anybody({ subsets: ["latin"], preload: false, variable: "--cv-admin-font-display" });

/**
 * The Courvia mark: the ball, and the trajectory it just came off.
 *
 * The same geometry as app/icon.svg — the site's favicon — because two
 * drawings of one mark drift. Colours are NOT attributes: they are classes
 * filled in by app/(payload)/admin.css from `--cv-*` tokens, which is what
 * keeps the mark inside the rule that forbids raw hex in components and
 * makes stylelint able to check it at all.
 */
function BrandMark(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="cv-mark"
      focusable="false"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect className="cv-mark__plate" height="64" rx="14" width="64" />
      <path
        className="cv-mark__arc"
        d="M10 46 Q32 14 54 46"
        strokeDasharray="1 7"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
      <circle className="cv-mark__ball" cx="50" cy="43" r="7" />
    </svg>
  );
}

/**
 * `admin.components.graphics.Icon` — the mark alone, in the panel header.
 * Payload sizes its container, so the svg fills it.
 */
export function CourviaIcon(): React.ReactElement {
  return <BrandMark />;
}

/**
 * `admin.components.graphics.Logo` — the login screen.
 *
 * Mark plus wordmark. The wordmark is a real text node rather than paths:
 * it stays selectable, it scales with the user's font size, and it is the
 * brand name, not copy, so it does not belong in the translation catalogue
 * (the strings around it do — see translations.ts).
 */
export function CourviaLogo(): React.ReactElement {
  return (
    <div className={`cv-logo ${anybody.variable}`}>
      <BrandMark />
      <span className="cv-logo__word">Courvia</span>
    </div>
  );
}
