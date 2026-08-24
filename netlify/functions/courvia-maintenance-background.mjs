import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const ORIGIN = "https://courvia-studios-neon.netlify.app";
const DERIVATION_CONTEXT = "courvia-maintenance-v1";

function bearer() {
  const secret = process.env.PAYLOAD_SECRET?.trim();
  if (!secret) throw new Error("PAYLOAD_SECRET is required for Courvia maintenance");
  return createHmac("sha256", secret).update(DERIVATION_CONTEXT).digest("hex");
}

function matches(candidate, expected) {
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export default async (request) => {
  const token = bearer();
  const authorization = request.headers.get("authorization") ?? "";
  if (!matches(authorization, `Bearer ${token}`)) {
    throw new Error("unauthorized maintenance background invocation");
  }

  const response = await fetch(`${ORIGIN}/next/cron`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status !== 200 && response.status !== 207) {
    throw new Error(`Courvia maintenance route returned HTTP ${response.status}`);
  }
};

export const config = {
  background: true,
};
