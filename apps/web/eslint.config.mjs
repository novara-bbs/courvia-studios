import base, { designSystemGuardrails, next, react, typeAware } from "@courvia/config/eslint";

export default [...base, ...react, ...next, ...typeAware, ...designSystemGuardrails];
