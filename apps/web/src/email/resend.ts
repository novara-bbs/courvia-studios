/**
 * Resend, behind Payload's email adapter interface.
 *
 * WHY RESEND, and why an adapter at all — CLAUDE.md §2 puts emailing in the
 * "buy, do not build" column, and what is being bought is the part that is
 * genuinely hard: deliverability, DKIM/SPF/DMARC alignment, bounce and
 * complaint handling, suppression lists, and a log an operator can search
 * when a customer says the mail never arrived. None of that is written here.
 * The repo-root `.env.example` already asked for `RESEND_API_KEY` and
 * docs/operations.md §15 already named it, so this settles a choice the
 * documentation had leant towards without making.
 *
 * Against Brevo, the deciding argument is the runtime: Brevo's Payload path
 * is nodemailer over SMTP, which opens a TCP connection from a serverless
 * function on every send and cannot run on the edge, while Resend is one
 * HTTPS POST. Swapping is one file: write another module of this shape and
 * change the branch in `adapter.ts` — the port is `EmailAdapter`, exactly as
 * gateways sit behind `PaymentProvider` (ADR-13/17).
 *
 * WHY NOT `@payloadcms/email-resend`, which exists and does roughly this:
 *
 *   1. It cannot send an idempotency key, and that key is load-bearing here.
 *      The outbox dispatcher claims a row, sends, and then marks it — if the
 *      process dies between the send and the mark, the retry MUST NOT mail
 *      the customer twice. Resend deduplicates on `Idempotency-Key` for 24
 *      hours, which closes exactly that window; nothing else can.
 *   2. Adding a dependency means editing `package.json` and the lockfile,
 *      and the whole of that package is the fetch call below.
 *
 * The credential is read nowhere in this file: it arrives as an argument
 * from `adapter.ts`, and it is never logged, never included in an error
 * message and never returned.
 */
import type { PayloadEmailAdapter, SendEmailOptions } from "payload";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** A mail provider that has not answered in ten seconds has not answered.
 *  The dispatcher's own budget is what stands behind this. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Resend's header. Values are capped at 256 characters by the API. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export interface ResendConfig {
  apiKey: string;
  /** `Courvia <hola@example.com>` or a bare address. Must be a domain
   *  verified in the Resend account, which is why it is configuration. */
  from: string;
}

/** Raised when the provider refuses a message. Carries the status so the
 *  dispatcher can tell a transient 5xx from a permanent 4xx. */
export class EmailDeliveryError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`Resend refused the message (HTTP ${status}): ${detail}`);
    this.name = "EmailDeliveryError";
    this.status = status;
  }
}

/** `Name <address>` split into its parts, for Payload's defaults. */
export function parseFromAddress(from: string): { address: string; name: string } {
  const match = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(from);
  if (match === null) return { address: from.trim(), name: "" };
  return { address: (match[2] ?? "").trim(), name: (match[1] ?? "").replace(/^"|"$/g, "").trim() };
}

type AddressLike = SendEmailOptions["to"];

/** Nodemailer accepts a string, an object or an array of either. Resend
 *  wants a flat list of strings. */
function addressList(value: AddressLike): string[] {
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (typeof item === "object" && typeof item.address === "string") {
      return [item.name === "" || item.name === undefined ? item.address : `${item.name} <${item.address}>`];
    }
    return [];
  });
}

/** We only ever send strings; a Buffer or a stream body is not something
 *  this app produces, and silently stringifying one would mail garbage. */
function textPart(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function idempotencyKey(headers: SendEmailOptions["headers"]): string | undefined {
  if (headers === undefined || headers === null || Array.isArray(headers)) return undefined;
  const value = (headers as Record<string, unknown>)[IDEMPOTENCY_HEADER];
  return typeof value === "string" && value !== "" ? value.slice(0, 256) : undefined;
}

/** The provider's error body, without assuming its shape survives a version. */
async function failureDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string") {
      return (body as { message: string }).message;
    }
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return response.statusText;
  }
}

export function resendAdapter(config: ResendConfig): PayloadEmailAdapter {
  const { address, name } = parseFromAddress(config.from);

  return () => ({
    name: "resend",
    defaultFromAddress: address,
    defaultFromName: name,
    sendEmail: async (message: SendEmailOptions): Promise<{ id: string }> => {
      const from = message.from === undefined ? config.from : addressList(message.from)[0] ?? config.from;
      const key = idempotencyKey(message.headers);

      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          ...(key === undefined ? {} : { [IDEMPOTENCY_HEADER]: key }),
        },
        body: JSON.stringify({
          from,
          to: addressList(message.to),
          ...(addressList(message.cc).length === 0 ? {} : { cc: addressList(message.cc) }),
          ...(addressList(message.bcc).length === 0 ? {} : { bcc: addressList(message.bcc) }),
          ...(message.replyTo === undefined ? {} : { reply_to: addressList(message.replyTo) }),
          subject: message.subject ?? "",
          ...(textPart(message.html) === undefined ? {} : { html: textPart(message.html) }),
          ...(textPart(message.text) === undefined ? {} : { text: textPart(message.text) }),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) throw new EmailDeliveryError(response.status, await failureDetail(response));

      const body: unknown = await response.json();
      const id =
        typeof body === "object" && body !== null && typeof (body as { id?: unknown }).id === "string"
          ? (body as { id: string }).id
          : "";
      return { id };
    },
  });
}
