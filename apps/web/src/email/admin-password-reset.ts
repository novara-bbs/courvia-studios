/**
 * The password-reset email for the back office.
 *
 * Payload has always had the flow — `/admin/forgot` writes a token and calls
 * `payload.sendEmail` — and until this task there was no email adapter
 * underneath it, so the panel accepted the request, said "check your inbox"
 * and nothing was ever sent (docs/gap-analysis.md, núcleo #5). The adapter
 * fixes the delivery; this file fixes the message, which by default is
 * Payload's own English boilerplate.
 *
 * Applied as a WRAPPER in payload.config.ts rather than edited into
 * `src/payload/users.ts`: that collection is about who may do what, and this
 * is about what an email says. Composing them at the config root keeps the
 * copy with the rest of the copy.
 *
 * Locale: the panel is internal and its content is written in Spanish (every
 * collection description in this repo is), so the reset email uses the
 * default locale. Admin users carry no locale field to consult, and
 * inventing one to translate one email would be the worse trade.
 */
import { DEFAULT_LOCALE } from "@courvia/platform";
import type { CollectionConfig } from "payload";

import { siteUrl } from "../seo/site-url";
import { emailTranslator } from "./messages";
import { renderEmail } from "./render";

/**
 * How long a reset link is good for, in the unit the copy quotes. Declared
 * here rather than left to Payload's default so the message can state it and
 * stay true: an email that says "one hour" while the token lives for two is
 * a support ticket. Minutes is the source and milliseconds are derived, so
 * the two cannot be edited apart.
 */
export const PASSWORD_RESET_EXPIRATION_MINUTES = 60;
const MS_PER_MINUTE = 60_000;
const PASSWORD_RESET_EXPIRATION_MS = PASSWORD_RESET_EXPIRATION_MINUTES * MS_PER_MINUTE;

interface ResetArgs {
  req?: { payload: { config: { routes: { admin: string } } } };
  token?: string;
  user?: unknown;
}

function stringField(user: unknown, field: "name" | "email"): string {
  if (typeof user !== "object" || user === null) return "";
  const value = (user as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

/** Where the panel serves the reset form. Read from the config so a project
 *  that moves the admin route does not mail a dead link. */
function resetUrl(args: ResetArgs | undefined): string {
  const adminRoute = args?.req?.payload.config.routes.admin ?? "/admin";
  return `${siteUrl()}${adminRoute}/reset/${args?.token ?? ""}`;
}

function body(args: ResetArgs | undefined) {
  const t = emailTranslator(DEFAULT_LOCALE);
  return renderEmail({
    locale: DEFAULT_LOCALE,
    subject: t("passwordReset.subject"),
    preheader: t("passwordReset.preheader"),
    blocks: [
      { kind: "text", value: t("passwordReset.greeting", { name: stringField(args?.user, "name") }) },
      {
        kind: "text",
        value: t("passwordReset.intro", { email: stringField(args?.user, "email") }),
      },
      { kind: "text", value: t("passwordReset.action", { url: resetUrl(args) }) },
      {
        kind: "text",
        value: t("passwordReset.expiry", { minutes: PASSWORD_RESET_EXPIRATION_MINUTES }),
      },
      { kind: "text", value: t("passwordReset.signature") },
      { kind: "note", value: t("passwordReset.ignore") },
    ],
  });
}

/** The subject, exported so a test can assert it without a Payload instance. */
export function passwordResetSubject(): string {
  return emailTranslator(DEFAULT_LOCALE)("passwordReset.subject");
}

export function passwordResetHtml(args?: ResetArgs): string {
  return body(args).html;
}

/**
 * Returns the collection with Courvia's reset email attached. Everything
 * else about `auth` keeps Payload's defaults.
 */
export function withAdminPasswordReset(users: CollectionConfig): CollectionConfig {
  return {
    ...users,
    auth: {
      ...(typeof users.auth === "object" ? users.auth : {}),
      forgotPassword: {
        expiration: PASSWORD_RESET_EXPIRATION_MS,
        generateEmailSubject: () => passwordResetSubject(),
        generateEmailHTML: (args) => passwordResetHtml(args as ResetArgs | undefined),
      },
    },
  };
}
