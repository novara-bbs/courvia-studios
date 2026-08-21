/* Payload admin shell — standard @payloadcms/next mounting. */
import config from "@payload-config";
import "@payloadcms/next/css";
/*
 * Order matters, and only in one direction: Payload's sheet first, ours
 * after. `tokens.css` only declares `--cv-*` custom properties — it paints
 * nothing and overrides no Payload rule — so it is safe to load next to a
 * third-party bundle we do not control; admin.css is what actually applies
 * them, unlayered so it wins over `@layer payload-default`.
 */
import "@courvia/design-tokens/tokens.css";
import "./admin.css";
import type { ServerFunctionClient } from "payload";
import { handleServerFunctions, RootLayout } from "@payloadcms/next/layouts";
import type { ReactNode } from "react";

import { importMap } from "./admin/importMap";

const serverFunction: ServerFunctionClient = async function (args) {
  "use server";
  return handleServerFunctions({ ...args, config, importMap });
};

export default function PayloadLayout({ children }: { children: ReactNode }) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  );
}
