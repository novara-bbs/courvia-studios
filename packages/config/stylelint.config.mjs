/**
 * CSS guardrails. CLAUDE.md §3 says "only semantic tokens, never raw hex" and
 * §5 mandates logical properties from day one for RTL; neither was enforced,
 * so both were one careless PR away from being false.
 */
export default {
  rules: {
    // No raw colours: every colour must come from a token.
    "declaration-property-value-disallowed-list": {
      "/^(color|background|background-color|border.*color|fill|stroke|box-shadow)$/": [
        /#[0-9a-fA-F]{3,8}\b/,
        /\brgba?\(/,
        /\bhsla?\(/,
      ],
    },
    // No physical properties: they silently break RTL.
    "property-disallowed-list": [
      "margin-left",
      "margin-right",
      "padding-left",
      "padding-right",
      "border-left",
      "border-right",
      "left",
      "right",
      "float",
      "clear",
    ],
  },
};
