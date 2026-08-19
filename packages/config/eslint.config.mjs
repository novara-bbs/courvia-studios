// Shared ESLint flat config. Each package re-exports this from its own
// eslint.config.mjs (optionally extending it).
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/** Rules that need type information — off by default, opted into per package. */
export const typeAware = tseslint.config({
  // Scoped to sources: the flat-config file itself belongs to no tsconfig,
  // and the project service refuses to parse it.
  files: ["**/src/**/*.ts", "**/src/**/*.tsx", "**/app/**/*.ts", "**/app/**/*.tsx"],
  languageOptions: {
    parserOptions: { projectService: true },
  },
  rules: {
    // In a codebase of async server components and server actions these are
    // the two rules that actually catch bugs; both were off until now.
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/require-await": "error",
  },
});

/** Rules for anything rendering React. */
export const react = tseslint.config({
  files: ["**/*.tsx"],
  plugins: { "react-hooks": reactHooks },
  rules: reactHooks.configs.recommended.rules,
});

/** Rules for the Next.js app. */
export const next = tseslint.config({
  files: ["**/*.ts", "**/*.tsx"],
  plugins: { "@next/next": nextPlugin },
  rules: {
    ...nextPlugin.configs.recommended.rules,
    ...nextPlugin.configs["core-web-vitals"].rules,
  },
});

/**
 * Bans the escape hatches that would turn the token-bound design system into
 * a suggestion. Applied to primitives and (later) sections — the two places
 * CMS content reaches the DOM.
 */
export const designSystemGuardrails = tseslint.config({
  files: ["**/*.tsx"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "JSXAttribute[name.name='style']",
        message:
          "Inline styles let content express arbitrary CSS. Use a declared variant or an appearance control (ADR-16).",
      },
      {
        selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
        message: "Render rich text through the sanitised renderer, never raw HTML.",
      },
    ],
  },
});

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/.turbo/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
