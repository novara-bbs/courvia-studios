"use server";

/**
 * Lead capture, the only write path for the `leads` collection: anonymous
 * REST is closed (server-only access), so the form posts here and this
 * action writes through the Local API. Amounts of trust involved: none —
 * everything re-validates on the server (§4).
 */
import config from "@payload-config";
import { REGION_DEFINITIONS, REGIONS, SPORTS } from "@courvia/platform";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPayload } from "payload";
import { z } from "zod";

import {
  LEAD_DUPLICATE_RULE,
  LEAD_PER_IP_RULE,
  clientIpKey,
  contentKey,
  rateLimitStore,
} from "../server/rate-limit";

const leadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  message: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  sportInterest: z.enum(SPORTS).optional(),
  intent: z.enum(["demo", "waitlist", "preorder"]).default("demo"),
  variantSku: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  productId: z.coerce.number().int().positive().optional(),
  consent: z.literal("on"),
  region: z.enum(REGIONS),
  sourcePath: z.string().startsWith("/").max(300).optional(),
  // Honeypot: humans never see it, bots fill it. Filled → pretend success.
  website: z.literal("").optional(),
});

export interface LeadFormState {
  status: "idle" | "invalid" | "throttled";
  /** Echoed back on failure so React 19's automatic form reset does not wipe
   *  what the visitor typed. Only the free-text fields, never the checkbox. */
  values?: { name: string; email: string; message: string };
}

/** A region we control, for redirects. Never trust the raw field: an
 *  unvalidated value interpolated into a path is an open-redirect gadget
 *  (e.g. "/\\evil.com"). */
function safeRegion(raw: FormDataEntryValue | null): (typeof REGIONS)[number] {
  return typeof raw === "string" && (REGIONS as readonly string[]).includes(raw)
    ? (raw as (typeof REGIONS)[number])
    : "es";
}

/** The failure shape, with the reason the visitor is entitled to.
 *
 *  `invalid` and `throttled` are kept apart because they are not the same
 *  message: telling somebody whose name and email are perfectly fine to
 *  "check the name and email" is simply untrue, and it makes them retry at
 *  once, burning the tokens that would have let them through. The
 *  anti-oracle argument for a single opaque response holds for the duplicate
 *  gate — it must not reveal whether an address already asked for a demo —
 *  but not here: somebody who just sent six submissions already knows they
 *  sent six submissions. */
function rejected(formData: FormData, status: "invalid" | "throttled" = "invalid"): LeadFormState {
  return {
    status,
    values: {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      message: String(formData.get("message") ?? ""),
    },
  };
}

export async function createLead(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  // Before anything costly, and long before the first write: a server action
  // is an ordinary unauthenticated POST, and the honeypot below only catches
  // a bot that fills every field it finds. See src/server/rate-limit.ts for
  // what this tier does and does not stop.
  const perIp = await rateLimitStore.consume(await clientIpKey("lead:ip"), LEAD_PER_IP_RULE);
  if (!perIp.allowed) return rejected(formData, "throttled");

  const parsed = leadSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message") ?? undefined,
    sportInterest: formData.get("sportInterest") || undefined,
    intent: formData.get("intent") || undefined,
    variantSku: formData.get("variantSku") || undefined,
    productId: formData.get("productId") || undefined,
    consent: formData.get("consent"),
    region: formData.get("region"),
    sourcePath: formData.get("sourcePath") ?? undefined,
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    // Honeypot hits redirect like a success: no signal for the bot. The
    // region is validated against the registry, never echoed raw.
    if (typeof formData.get("website") === "string" && formData.get("website") !== "") {
      redirect(`/${safeRegion(formData.get("region"))}/gracias`);
    }
    return rejected(formData);
  }

  const { region, productId, website: _website, consent: _consent, ...lead } = parsed.data;
  const def = REGION_DEFINITIONS[region];

  // Cheap second gate, on content rather than address: the same person
  // asking the same thing inside the window is a double submit — a
  // double-click, a back button, a retry after the redirect — and a second
  // row would just make sales chase one lead twice.
  //
  // "The same thing" has to include the PRODUCT. Keyed on (email, intent)
  // alone, somebody who asks for a Tempo demo and four minutes later a Rally
  // demo gets a thank-you page and no second lead: sales never learns the
  // second ask existed and the visitor believes it was sent. The double
  // click this gate is for resubmits identical form data, so it still
  // collapses. Lowercased so Ana@ and ana@ are one person; hashed, so no
  // address ever lives in the map.
  const duplicateKey = contentKey(
    "lead:dup",
    lead.email.toLowerCase(),
    lead.intent,
    lead.variantSku ?? "",
    productId === undefined ? "" : String(productId),
  );
  // Only PEEKED here. Spending the token before the write would mean a
  // transient database failure shows the visitor an error, and their retry
  // — the one that would have worked — gets swallowed as a duplicate: a
  // success page for a lead that was never stored. It is committed after
  // the row exists.
  if (!(await rateLimitStore.peek(duplicateKey, LEAD_DUPLICATE_RULE)).allowed) {
    redirect(`/${region}/gracias`);
  }

  // RGPD art. 7.1: consent must be demonstrable, so we persist the exact
  // text the visitor accepted — recomputed HERE from the locale catalog, not
  // read from the form, so a tampered hidden field cannot rewrite history.
  const t = await getTranslations({ locale: def.locale, namespace: "catalog" });
  const consentText = `${t("leadConsent")} ${t("leadPrivacy")}: /${region}/privacidad`;

  const payload = await getPayload({ config });
  const created = await payload.create({
    collection: "leads",
    overrideAccess: true,
    data: {
      ...lead,
      market: def.market,
      locale: def.locale,
      consent: true,
      consentText,
      status: "new",
      ...(productId === undefined ? {} : { product: productId }),
    },
  });

  // The row exists: now the duplicate token is spent. Between the peek above
  // and here, a concurrent double-submit could slip a second lead through —
  // an acceptable trade against losing a real one, which is what charging
  // for a write that failed would do.
  await rateLimitStore.consume(duplicateKey, LEAD_DUPLICATE_RULE);

  // Notification via the outbox queue (dispatch happens outside, per
  // payments.md). Deliberately NOT atomic with the lead: the lead row is the
  // source of truth and must survive a failed notification insert.
  try {
    await payload.create({
      collection: "outbox",
      overrideAccess: true,
      data: {
        effect: "notify_sales_lead",
        lead: created.id,
        status: "pending",
        attempts: 0,
        payload: {
          email: lead.email,
          market: def.market,
          variantSku: lead.variantSku ?? null,
          sourcePath: lead.sourcePath ?? null,
        },
      },
    });
  } catch (error) {
    console.error("lead notification enqueue failed", error);
  }

  redirect(`/${region}/gracias`);
}
