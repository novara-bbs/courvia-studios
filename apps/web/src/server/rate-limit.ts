/**
 * Rate limiting for the public write paths — hoy el formulario de leads y la
 * CREACIÓN de carrito, que son los dos sitios donde alguien sin sesión escribe
 * filas.
 *
 * Esta cabecera decía «the lead form: the only place an unauthenticated
 * visitor writes rows», y dejó de ser cierto el día que entró el carrito en la
 * Fase 4: `src/cart/actions.ts` crea una fila en `carts` cada vez que llega
 * una petición sin cookie `cv_cart`. Es la avería que este repo persigue —una
 * afirmación que declara la intención y no el efecto—, y la peor de su clase:
 * quien audita la superficie de escritura pública lee esa frase y para de
 * mirar. Se arregló el 22 ago 2026, cinco meses después de dejar de ser
 * verdad.
 *
 * El del lead: su whole defence used to be
 * a honeypot field, which a script bypasses by simply not sending it, leaving
 * an open faucet into `leads` and `outbox`: attacker-controlled PII we become
 * the controller of (RGPD art. 5.1.c), a table that grows until the plan
 * caps, and — once `notify_sales_lead` reaches a real ESP — an outbound-email
 * amplifier pointed at our own sending domain.
 *
 * THE HONEST LIMITATION, here rather than buried: the default store is a Map
 * living inside one lambda instance. Vercel runs many instances and recycles
 * them, so the ceiling is per-instance and a cold start forgets everything.
 * This stops a script hammering the endpoint from one address; it does NOT
 * stop a distributed botnet. Buying that needs shared state, so `RateLimitStore`
 * is deliberately async: dropping in a Vercel KV / Upstash implementation is
 * the entire migration and no caller changes shape. No dependency and no
 * service means this works on a fresh deploy with zero configuration, which
 * is the point — the alternative shipped nothing at all until someone set up
 * an account.
 */
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/** A token bucket: `capacity` requests may burst, then one token returns
 *  every `refillMs`. Refill is continuous (fractional tokens), so a caller
 *  cannot ride the edge of a fixed window and get 2× the budget across its
 *  boundary. */
export interface RateLimitRule {
  readonly capacity: number;
  readonly refillMs: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Milliseconds until the next token; 0 when allowed. Never surfaced to
   *  the visitor — handing a scraper its exact cadence is free tuning — but
   *  a shared store will report it and a future 429 will want it. */
  readonly retryAfterMs: number;
}

/** The seam. Narrow on purpose: nothing here a KV round-trip could not
 *  serve — no listing, no reset, no iteration. */
export interface RateLimitStore {
  /** Take a token if one is free. */
  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
  /**
   * Would `consume` succeed? Reads without spending.
   *
   * It exists for the gate that must not charge for work that did not
   * happen: the lead form checks for a duplicate BEFORE writing the row and
   * commits the token only once the row exists. Spending it up front turns a
   * transient database failure into permanent silent loss — the visitor
   * retries, the retry is swallowed as a duplicate, and they get a success
   * page for a lead nobody stored.
   */
  peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
}

/**
 * Per-IP budget for lead submissions. A visitor sends the form once; a typo
 * in the email or a second interest (demo on two products) makes five in a
 * burst generous, and it also covers a club whose staff share one NAT
 * address. One token back per minute caps the sustained rate at 60 rows per
 * hour per address — orders of magnitude above any real use, and low enough
 * that filling the table costs an attacker a rented IP for every 60 rows.
 */
export const LEAD_PER_IP_RULE: RateLimitRule = { capacity: 5, refillMs: 60_000 };

/**
 * Second, cheaper gate: the same (email, intent) pair inside ten minutes is a
 * double-click, a back-button resubmit, or a retry after the redirect — not a
 * second lead. Capacity 1 makes the window absolute, and it catches the
 * abuser who rotates addresses but not payloads.
 */
export const LEAD_DUPLICATE_RULE: RateLimitRule = { capacity: 1, refillMs: 600_000 };

/**
 * Per-IP budget para CREAR un carrito. No para usarlo.
 *
 * Se limita solo la rama que escribe una fila NUEVA —petición sin cookie
 * `cv_cart`—, no `addLine` ni `setLine`: esas mutan una fila que quien navega
 * ya tiene, y limitarlas rompería a quien de verdad está comprando.
 *
 * Un visitante necesita UN carrito. Cinco de golpe cubren el doble clic, el
 * navegador que rechaza cookies y vuelve a empezar en cada intento, y un club
 * detrás de un NAT compartido. Un token por minuto deja el sostenido en 60
 * filas por hora y dirección, que es lo que convierte «una tabla que crece
 * hasta el tope del plan» en «una IP alquilada por cada 60 filas».
 *
 * El contexto que hace que esto importe: `carts` vive 14 días
 * (`CART_TTL_DAYS`) y la barrida borra como mucho 500 filas por día en un cron
 * DIARIO (`sweep-carts.ts`, `vercel.json`). Sin puerta, un script deja miles
 * de filas que tardan meses en drenarse, en el mismo esquema que los pedidos.
 *
 * Y la limitación honesta sigue siendo la de arriba: esto para un script desde
 * una dirección, no una botnet. Comprar eso exige estado compartido.
 */
export const CART_CREATE_RULE: RateLimitRule = { capacity: 5, refillMs: 60_000 };

/**
 * Hard bound on the map. A limiter that OOMs the function is a worse denial
 * of service than the one it prevents, and the keyspace is attacker-chosen
 * (one entry per source address). 10k entries of a three-number bucket plus
 * its key is roughly a megabyte — invisible next to the Next.js runtime.
 */
const MAX_TRACKED_KEYS = 10_000;

/** Forwarded values are attacker-controlled text; a megabyte of header must
 *  not become a megabyte of map key. Real addresses fit in 45 characters. */
const MAX_KEY_SOURCE_LENGTH = 64;

interface Bucket {
  tokens: number;
  updatedAt: number;
  /** When the bucket refills completely. At that instant it is
   *  indistinguishable from a key that was never seen, so it can be swept. */
  fullAt: number;
}

export interface InMemoryRateLimitOptions {
  /** Injectable clock. Tests advance time instead of sleeping, and a fake
   *  clock is the only way to assert refill behaviour deterministically. */
  now?: () => number;
  maxKeys?: number;
}

/** The in-memory store, exposed for tests and for anyone building a second
 *  isolated limiter. `size` is not part of `RateLimitStore`: a shared store
 *  could not answer it. */
export function createInMemoryRateLimitStore(
  options: InMemoryRateLimitOptions = {},
): RateLimitStore & { size: () => number } {
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? MAX_TRACKED_KEYS;
  const buckets = new Map<string, Bucket>();

  /** Deleting during iteration is well-defined on Map: entries removed
   *  before the cursor reaches them are simply not visited. */
  function sweepExpired(at: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.fullAt <= at) buckets.delete(key);
    }
  }

  function enforceBound(at: number): void {
    if (buckets.size <= maxKeys) return;
    sweepExpired(at);
    // Still over the cap means live buckets outnumber the bound: more
    // distinct sources than this tier ever claimed to handle. Drop the least
    // recently used until we fit. An evicted attacker gets a fresh bucket —
    // that is the price of never growing without limit, and a flood of
    // >maxKeys distinct addresses is the botnet case the header comment
    // already disclaims.
    for (const key of buckets.keys()) {
      if (buckets.size <= maxKeys) break;
      buckets.delete(key);
    }
  }

  /** Tokens a key would have right now, after continuous refill. */
  function availableAt(key: string, rule: RateLimitRule, at: number): number {
    const previous = buckets.get(key);
    return previous === undefined
      ? rule.capacity
      : Math.min(rule.capacity, previous.tokens + (at - previous.updatedAt) / rule.refillMs);
  }

  function decide(available: number, rule: RateLimitRule): RateLimitDecision {
    const allowed = available >= 1;
    return {
      allowed,
      // `available`, not `available - 1`: the subtraction belongs to the
      // token consume() spends, and a peek spends nothing. With it, peek
      // reported one whole refill period more than consume did for the very
      // same bucket — and a Retry-After built from that number would tell a
      // visitor to wait twice as long as they have to.
      retryAfterMs: allowed ? 0 : Math.ceil((1 - available) * rule.refillMs),
    };
  }

  return {
    peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
      // Deliberately does not touch the bucket: no write, no recency bump.
      // A peek that reordered the LRU would let a read starve a writer.
      return Promise.resolve(decide(availableAt(key, rule, now()), rule));
    },

    consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
      const at = now();
      const available = availableAt(key, rule, at);

      const allowed = available >= 1;
      const tokens = allowed ? available - 1 : available;

      // delete-then-set rebuilds insertion order as recency order: `set` on
      // an existing key keeps its original position, which would make the
      // eviction loop above drop whoever arrived first rather than whoever
      // has been quiet longest.
      buckets.delete(key);
      buckets.set(key, {
        tokens,
        updatedAt: at,
        fullAt: at + (rule.capacity - tokens) * rule.refillMs,
      });
      enforceBound(at);

      return Promise.resolve({
        allowed,
        retryAfterMs: allowed ? 0 : Math.ceil((1 - tokens) * rule.refillMs),
      });
    },
    size: () => buckets.size,
  };
}

/** The process-wide default. Module scope means it survives across
 *  invocations on a warm instance and dies with it — see the header. */
export const rateLimitStore: RateLimitStore = createInMemoryRateLimitStore();

/**
 * First hop of `x-forwarded-for`. The header is absent (local dev, a proxy
 * that forgot it), a single address, or a comma-separated chain in which the
 * client is leftmost and every appended entry is a proxy.
 */
export function forwardedClientIp(headerValue: string | null | undefined): string | null {
  if (typeof headerValue !== "string") return null;
  const [first] = headerValue.split(",");
  const ip = first?.trim() ?? "";
  if (ip === "") return null;
  return ip.slice(0, MAX_KEY_SOURCE_LENGTH);
}

/**
 * Bucket key for the caller's address.
 *
 * On Vercel the platform edge writes `x-forwarded-for` itself, so the first
 * hop is the real client. Behind an untrusted proxy the value is whatever the
 * client typed, and forging it buys a fresh bucket — which is why this is one
 * tier of defence and not authentication.
 *
 * A missing header collapses every such request into one shared bucket. The
 * alternative — skipping the limit when the header is absent — would be an
 * opt-out the attacker controls by omitting a header.
 */
export async function clientIpKey(prefix: string): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return `${prefix}:${forwardedClientIp(forwarded) ?? "unknown"}`;
}

/**
 * Key derived from content instead of address. Hashed because the parts are
 * PII (an email): a raw key would keep a live index of every prospect's
 * address in process memory, and later in a shared store and its logs, for
 * no gain — the limiter only needs the key to be comparable. 22 base64url
 * characters are 132 bits; collisions are not a threat model.
 */
export function contentKey(prefix: string, ...parts: readonly string[]): string {
  // NUL separator: no part can contain one, so ("ab", "c") and ("a", "bc")
  // can never land in the same bucket.
  const digest = createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("base64url")
    .slice(0, 22);
  return `${prefix}:${digest}`;
}
