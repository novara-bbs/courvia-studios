import base, {
  designSystemGuardrails,
  next,
  react,
  satoriInlineStyles,
  typeAware,
} from "@courvia/config/eslint";

export default [
  ...base,
  ...react,
  ...next,
  ...typeAware,
  ...designSystemGuardrails,
  // The Open Graph card is painted by satori, not by a browser: inline style
  // is the only styling input it has. Named file by file on purpose.
  ...satoriInlineStyles(["src/seo/og-card.tsx"]),
];
