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
import { getPayload } from "payload";
import { z } from "zod";

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
  productId: z.coerce.number().int().positive().optional(),
  consent: z.literal("on"),
  region: z.enum(REGIONS),
  sourcePath: z.string().startsWith("/").max(300).optional(),
  // Honeypot: humans never see it, bots fill it. Filled → pretend success.
  website: z.literal("").optional(),
});

export interface LeadFormState {
  status: "idle" | "invalid";
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

export async function createLead(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = leadSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message") ?? undefined,
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
    return {
      status: "invalid",
      values: {
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        message: String(formData.get("message") ?? ""),
      },
    };
  }

  const { region, productId, website: _website, consent: _consent, ...lead } = parsed.data;
  const def = REGION_DEFINITIONS[region];

  const payload = await getPayload({ config });
  await payload.create({
    collection: "leads",
    overrideAccess: true,
    data: {
      ...lead,
      market: def.market,
      locale: def.locale,
      consent: true,
      ...(productId === undefined ? {} : { product: productId }),
    },
  });

  redirect(`/${region}/gracias`);
}
