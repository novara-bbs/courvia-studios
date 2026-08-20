/**
 * Whether this process can send an email, and what happens when it cannot.
 *
 * The shape is deliberately the same as `src/payload/storage.ts`, because
 * the problem is the same one: a capability that is correct to fake on a
 * laptop and catastrophic to fake in a deployment. Uploads that vanish at
 * the next deploy and a waitlist confirmation that was never sent fail
 * identically — successfully, silently, and only visible to the person who
 * did not get what they asked for.
 *
 * So, three states and no fourth:
 *
 *   - **Credentials present** → Resend. See `resend.ts` for why that
 *     provider and why not its packaged adapter.
 *   - **Absent, on a laptop or in CI** → return no adapter at all, which is
 *     Payload's own behaviour: it installs a console adapter that logs the
 *     recipient and the subject instead of sending. Nothing is lost, because
 *     nothing was expected to arrive.
 *   - **Absent, on a deployment** → a fail-closed adapter that THROWS on
 *     every send, plus one loud line in the boot log. A thrown send is what
 *     turns the outbox row red, the dispatcher's retries visible and the
 *     failure countable; swallowing it would leave a lead thinking somebody
 *     is about to write back.
 *
 * Partial configuration counts as none. An API key without a verified `from`
 * address produces a 4xx per message forever, which is the worst of the
 * three states: it looks configured and delivers nothing.
 *
 * Known limit, stated the same way storage.ts states its own: the signals
 * are `VERCEL` and a production `NODE_ENV`. A container pipeline that
 * exposes neither is treated as a laptop.
 */
import type { PayloadEmailAdapter } from "payload";

import { resendAdapter } from "./resend";

export interface EmailConfig {
  apiKey: string;
  /** `Courvia <hola@courvia.com>`; the domain must be verified at the provider. */
  from: string;
}

/**
 * Empty and unset are the same thing: a Vercel variable can exist with a
 * blank value. Named `env` on purpose — `env-contract.test.ts` only sees an
 * indirect read through an accessor with that name, which is the convention
 * `storage.ts` and `build-env.ts` already follow.
 */
function env(name: string): string | undefined {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? undefined : raw.trim();
}

/** The provider credentials, or null when this deployment has none. */
export function readEmailConfig(): EmailConfig | null {
  const apiKey = env("RESEND_API_KEY");
  const from = env("EMAIL_FROM");
  if (apiKey === undefined || from === undefined) return null;
  return { apiKey, from };
}

/**
 * True where a message that is not delivered is a broken promise: any Vercel
 * build or runtime, and a self-hosted server running in production mode.
 * The build phase is excluded — nothing sends during `next build`, and the
 * warning would only be noise in CI.
 */
export function deliveryIsRequired(): boolean {
  if (env("VERCEL") !== undefined) return true;
  return env("NODE_ENV") === "production" && env("NEXT_PHASE") === undefined;
}

/** True when a send would be quietly discarded if we let it through. */
export function emailWouldBeLost(): boolean {
  return deliveryIsRequired() && readEmailConfig() === null;
}

const UNCONFIGURED_MESSAGE =
  "RESEND_API_KEY/EMAIL_FROM are not set on this deployment: email delivery is DISABLED. See docs/deployment.md.";

/** Refuses every send, loudly. Never silently succeeds. */
function failClosedAdapter(): PayloadEmailAdapter {
  return () => ({
    name: "unconfigured",
    defaultFromAddress: "",
    defaultFromName: "",
    sendEmail: () => Promise.reject(new Error(UNCONFIGURED_MESSAGE)),
  });
}

/** The adapter for payload.config.ts, or undefined to keep Payload's console. */
export function emailAdapter(): PayloadEmailAdapter | undefined {
  const config = readEmailConfig();
  if (config !== null) return resendAdapter(config);
  if (deliveryIsRequired()) {
    // Loud, once, at boot: the deployment log is where an operator looks
    // when a lead reports that the confirmation never arrived.
    console.error(`[email] ${UNCONFIGURED_MESSAGE}`);
    return failClosedAdapter();
  }
  return undefined;
}
