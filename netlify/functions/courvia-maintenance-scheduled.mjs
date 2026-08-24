import { createHmac } from "node:crypto";

const ORIGIN = "https://courvia-studios-neon.netlify.app";
const DERIVATION_CONTEXT = "courvia-maintenance-v1";

function bearer() {
  const secret = process.env.PAYLOAD_SECRET?.trim();
  if (!secret) throw new Error("PAYLOAD_SECRET is required for Courvia maintenance");
  return createHmac("sha256", secret).update(DERIVATION_CONTEXT).digest("hex");
}

export default async () => {
  const response = await fetch(`${ORIGIN}/.netlify/functions/courvia-maintenance-background`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer()}` },
  });
  if (response.status !== 202) {
    throw new Error(`Could not enqueue Courvia maintenance: HTTP ${response.status}`);
  }
};

export const config = {
  schedule: "0 * * * *",
};
