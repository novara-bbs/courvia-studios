/**
 * The confirmation a lead gets, and today the only email the storefront
 * sends on its own initiative.
 *
 * It exists because the waitlist is the site's single conversion and,
 * until now, filling it in returned `/gracias` and then silence
 * (docs/gap-analysis.md, núcleo #5). The copy follows the `volt` voice of
 * `.claude/rules/content-voice.md`: second person, a coach rather than a
 * salesperson, no exclamation marks, no emoji, and it says plainly that a
 * person writes the real reply — the thank-you page already promises that,
 * and an autoresponder that pretends otherwise contradicts it.
 *
 * Pure: it takes values and returns a rendered message. No database, no
 * environment, no clock — so the whole of it is covered by a unit test that
 * reads like the email.
 */
import type { LocaleId, RegionId } from "@courvia/platform";

import { emailTranslator } from "./messages";
import { renderEmail } from "./render";
import type { EmailBlock, RenderedEmail } from "./render";

/** What the visitor was asking for. Mirrors the `intent` field of `leads`. */
export type LeadIntent = "demo" | "waitlist" | "preorder";

export interface LeadConfirmationInput {
  name: string;
  locale: LocaleId;
  region: RegionId;
  intent: LeadIntent;
  /** The configuration the visitor ticked, when they ticked one. */
  variantSku: string | null;
  /** Public origin, from `siteUrl()`. Passed in to keep this module pure. */
  origin: string;
}

/**
 * Same path `create-lead.ts` writes into the stored RGPD art. 7.1 consent
 * evidence. Repeated deliberately rather than invented a second time: if
 * that convention ever moves (docs/gap-analysis.md extras #4 wants it
 * configurable), both places must move together and a grep for the segment
 * has to find them both.
 */
const PRIVACY_SEGMENT = "privacidad";

export function leadConfirmationEmail(input: LeadConfirmationInput): RenderedEmail {
  const t = emailTranslator(input.locale);
  const privacyUrl = `${input.origin}/${input.region}/${PRIVACY_SEGMENT}`;

  const blocks: EmailBlock[] = [
    { kind: "text", value: t("lead.greeting", { name: input.name }) },
    { kind: "text", value: t("lead.intro", { ask: t(`lead.ask.${input.intent}`) }) },
  ];

  if (input.variantSku !== null && input.variantSku !== "") {
    blocks.push({ kind: "text", value: t("lead.configuration", { sku: input.variantSku }) });
  }

  blocks.push(
    { kind: "heading", value: t("lead.nextTitle") },
    { kind: "list", items: [t("lead.nextCourt"), t("lead.nextGoal")] },
    { kind: "text", value: t("lead.reply") },
    { kind: "text", value: t("lead.signature") },
    { kind: "note", value: t("lead.privacy", { privacyUrl }) },
  );

  return renderEmail({
    locale: input.locale,
    subject: t("lead.subject"),
    preheader: t("lead.preheader"),
    blocks,
  });
}
