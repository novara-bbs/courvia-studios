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
 * The guardrail the header of `packages/commerce-domain/src/money.ts` has
 * claimed since it was written — "a lint rule forbids `*` and `/` on
 * `Money.amount` outside this file" — and which did not exist until now. The
 * SEO markup was meanwhile shipping `(offer.price.amount / 100).toFixed(2)`,
 * i.e. the exact line the imaginary rule described.
 *
 * Scaling an amount is a currency decision (`CURRENCY_MINOR_UNITS`), and one
 * that fails silently: a hardcoded 100 is right for EUR/GBP/AED and off by
 * 100x for the first zero-decimal currency we add. Multiply a quantity with
 * `multiply()`, render with `format()` or `toDecimalString()`.
 */
const moneyArithmetic = [
  {
    // Either operand: `a.amount / 100` and `100 * a.amount` both match. The
    // non-null assertion in `price!.amount` sits below the MemberExpression,
    // so it does not break the `>` relationship.
    selector: "BinaryExpression[operator=/^[*/]$/] > MemberExpression[property.name='amount']",
    message:
      "Do not multiply or divide a Money amount outside money.ts. Scale is a currency decision (CURRENCY_MINOR_UNITS): use multiply(), format() or toDecimalString() from @courvia/commerce-domain.",
  },
  {
    selector: "AssignmentExpression[operator=/^[*/]=$/] > MemberExpression[property.name='amount']",
    message:
      "Do not multiply or divide a Money amount outside money.ts. Scale is a currency decision (CURRENCY_MINOR_UNITS): use multiply(), format() or toDecimalString() from @courvia/commerce-domain.",
  },
];

/** Applied to every package through the default config below. */
export const moneyGuardrails = tseslint.config({
  files: ["**/*.ts", "**/*.tsx"],
  // Both spellings of the one exempt file on purpose. ESLint resolves
  // `ignores` against the directory of the config that is running, and every
  // package re-exports this one from its own root — so while linting
  // commerce-domain the path is `src/money.ts`, with no package segment left
  // to match. Naming only the repo-root form would make money.ts fail its own
  // rule; the short form is what actually fires today.
  ignores: ["**/commerce-domain/src/money.ts", "src/money.ts"],
  rules: {
    "no-restricted-syntax": ["error", ...moneyArithmetic],
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
    // `no-restricted-syntax` is replaced, not merged, by the last config that
    // sets it. This block is applied after the default one, so it must repeat
    // the money selectors or every .tsx file in ui, sections and web silently
    // loses them — starting with product-json-ld.tsx, the file that had the
    // bug.
    "no-restricted-syntax": [
      "error",
      ...moneyArithmetic,
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
  ...moneyGuardrails,
);
