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
}

export async function createLead(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = leadSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message") ?? undefined,
    sportInterest: formData.get("sportInterest") || undefined,
    productId: formData.get("productId") || undefined,
    consent: formData.get("consent"),
    region: formData.get("region"),
    sourcePath: formData.get("sourcePath") ?? undefined,
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    // Honeypot hits redirect like a success: no signal for the bot.
    if (typeof formData.get("website") === "string" && formData.get("website") !== "") {
      redirect(`/${String(formData.get("region") ?? "es")}/gracias`);
    }
    return { status: "invalid" };
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
