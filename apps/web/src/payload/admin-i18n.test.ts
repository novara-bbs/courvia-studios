/**
 * The panel is offered in three languages; this is what stops half of it
 * from being written in one.
 *
 * `payload.config.ts` declares `supportedLanguages: { es, en, ar }`, and
 * Payload resolves any `Record<language, string>` through `getTranslation`
 * — the same mechanism `blocks.ts` already uses for every section. The
 * collections and globals did not use it: their labels, shelves,
 * descriptions and option names were Spanish string literals, so an editor
 * with the panel in English read Payload's chrome in English wrapped around
 * a form still in Spanish.
 *
 * A test that only checked "is there a label" would pass on exactly that
 * state, so this one checks the SHAPE of every string the panel renders: a
 * record covering all three languages, or a function (Payload's own fields
 * resolve through `t()`), and nothing else.
 *
 * LA DEUDA QUE ESTE FICHERO LLEVABA ESCRITA YA NO EXISTE. `catalog.ts`,
 * `templates.ts` y `commerce-connections.ts` estaban apuntados como PENDING
 * porque los tenía otra tarea en vuelo; están convertidos y han pasado a
 * `LOCALIZED`, así que la suite los exige como a los demás. Queda una sola
 * lista de excepciones —`FOREIGN_SPANISH`— y es de otra naturaleza: cadenas
 * que un módulo escribe DENTRO de una colección de otro.
 *
 * Los grupos del menú van aparte, en `PANEL_GROUPS` (admin-copy.ts), y no por
 * gusto: Payload agrupa por igualdad del valor resuelto, así que dos
 * literales que difieran en una tilde parten el menú en dos sin decir nada.
 */
import { describe, expect, it } from "vitest";
import { formatLabels, toWords } from "payload";
import type { Field, SanitizedCollectionConfig, SanitizedGlobalConfig } from "payload";

import config from "@payload-config";

/** The panel languages, from the config rather than from memory. */
const LANGUAGES = ["es", "en", "ar"] as const;

/** Entities whose panel copy has been converted. */
const LOCALIZED = {
  collections: [
    "pages",
    "media",
    "redirects",
    "users",
    "orders",
    "payments",
    "outbox",
    "returns",
    "carts",
    "carriers",
    "shipments",
    "brands",
    "categories",
    "products",
    "variants",
    "prices",
    "inventory",
    "leads",
    "templates",
    "commerce-connections",
    "commerce-bindings",
    "commerce-product-refs",
  ],
  globals: ["theme-settings", "market-settings", "navigation"],
};

/**
 * Cadenas en castellano que sobreviven dentro de una colección convertida
 * porque las escribe OTRO módulo.
 *
 * `withCommerceOwner` (commerce-connections.ts) atornilla cuatro columnas de
 * propiedad a `orders` y a `carts`, con sus ayudas. Estaban en castellano
 * porque aquel fichero lo tenía otra tarea en vuelo; ya no. La lista se queda
 * vacía y con su explicación: el mecanismo —una colección cuyo copy lo pone
 * un tercero— sigue existiendo, y el día que vuelva a pasar se apunta aquí en
 * vez de fingir que la colección está limpia.
 */
const FOREIGN_SPANISH: Record<string, string[]> = {};

/**
 * Ya no queda ninguna. La constante se conserva vacía a propósito: es lo que
 * hace que la comprobación de abajo —«toda colección del config está cubierta
 * o apuntada»— siga siendo una comprobación y no una lista que alguien tenga
 * que acordarse de crear el día que vuelva a haber deuda.
 */
const PENDING_COLLECTIONS: string[] = [];

/** One complaint, with the path that produces it. */
interface Problem {
  path: string;
  value: string;
}

/**
 * A string the panel shows, judged.
 *
 * Three shapes pass, and only three:
 *   - a FUNCTION: Payload calls it with `i18n`, so it is translated by
 *     construction (this is how Payload's own `createdAt` label works);
 *   - `false`: an explicit "no label", which the SEO group uses;
 *   - a RECORD covering every panel language.
 * A bare string is the failure this file exists to catch.
 */
function check(value: unknown, path: string, problems: Problem[]): void {
  if (value === undefined || value === null) return;
  if (typeof value === "function" || value === false) return;
  if (typeof value === "string") {
    problems.push({ path, value });
    return;
  }
  if (typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const missing = LANGUAGES.filter((language) => typeof record[language] !== "string");
  if (missing.length > 0) {
    problems.push({ path, value: `faltan ${missing.join(", ")}` });
  }
}

/**
 * An option label, which has one extra shape that is legitimately not
 * translated: a CODE.
 *
 * `stripe`, `volt`, `card`, `DDP`, `ES` are the same word in every language —
 * they are the contract the storefront, the gateway or a customs form reads,
 * and inventing three names for one id would be worse than leaving it. The
 * test insists the label BE that code: anything else is prose, and prose gets
 * translated.
 */
function checkOption(option: unknown, path: string, problems: Problem[]): void {
  if (typeof option === "string") return; // Payload renders the value itself.
  if (typeof option !== "object" || option === null) return;
  const { label, value } = option as { label?: unknown; value?: unknown };
  if (typeof label === "string" && typeof value === "string") {
    if (label === value || label === value.toUpperCase()) return;
  }
  check(label, `${path}.label`, problems);
}

/**
 * True when a label is the one PAYLOAD invented from the field name.
 *
 * With no `label`, Payload title-cases the field name — `unitAmount` becomes
 * "Unit Amount" — and shows that in every language. That is a real gap and
 * it is a DIFFERENT gap: it predates this task, it covers every unlabelled
 * field in the repo, and inventing three names each for `sku`, `line1` and
 * `focalX` is not what "the collections are written in Spanish" asked for.
 *
 * So the invariant this file enforces is narrower and exact: no string
 * SOMEBODY WROTE may exist in only one language. A derived label is not a
 * written string, and is skipped — while `Motor propietario. Inmutable.`
 * three lines below it is caught.
 */
function isDerived(value: unknown, name: string): boolean {
  if (typeof value !== "string") return false;
  return value === toWords(name);
}

function walkFields(fields: Field[], prefix: string, problems: Problem[]): void {
  for (const field of fields) {
    const name = "name" in field && typeof field.name === "string" ? field.name : field.type;
    const path = `${prefix}.${name}`;
    // A `ui` field's label is typed `Record | string` with no `false`
    // (payload/dist/fields/config/types.d.ts, `UIField`) and is only ever
    // used as a list-view column header, which UI fields are excluded from
    // by default. Payload derives one from the field name and never renders
    // it; inventing copy for it would only duplicate the heading the
    // component draws itself.
    if (field.type === "ui") continue;
    if ("label" in field && !isDerived(field.label, name)) {
      check(field.label, `${path}.label`, problems);
    }
    if ("labels" in field && field.labels !== undefined) {
      const derived = formatLabels(name);
      if (field.labels.singular !== derived.singular) {
        check(field.labels.singular, `${path}.labels.singular`, problems);
      }
      if (field.labels.plural !== derived.plural) {
        check(field.labels.plural, `${path}.labels.plural`, problems);
      }
    }
    // `admin` is a different shape per field type and only some of them
    // declare `description`; the union has no common member to read.
    const fieldAdmin = ("admin" in field ? field.admin : undefined) as
      | { description?: unknown }
      | undefined;
    check(fieldAdmin?.description, `${path}.description`, problems);
    if ("options" in field && Array.isArray(field.options)) {
      field.options.forEach((option, index) => {
        checkOption(option, `${path}.options[${String(index)}]`, problems);
      });
    }
    if ("fields" in field && Array.isArray(field.fields)) {
      walkFields(field.fields, path, problems);
    }
    if ("tabs" in field && Array.isArray(field.tabs)) {
      field.tabs.forEach((tab, index) => {
        const tabPath = `${path}.tabs[${String(index)}]`;
        check(tab.label, `${tabPath}.label`, problems);
        const tabAdmin = tab.admin as { description?: unknown } | undefined;
        check(tabAdmin?.description, `${tabPath}.description`, problems);
        walkFields(tab.fields, tabPath, problems);
      });
    }
    // Block fields are projected from the section registry (`blocks.ts`),
    // which the sections' own registry test already holds to three
    // languages; walking them here would test that file twice and would
    // fail on a section this task does not own.
  }
}

function collectionProblems(collection: SanitizedCollectionConfig): Problem[] {
  const problems: Problem[] = [];
  const at = collection.slug;
  check(collection.labels.singular, `${at}.labels.singular`, problems);
  check(collection.labels.plural, `${at}.labels.plural`, problems);
  check(collection.admin.group, `${at}.admin.group`, problems);
  check(collection.admin.description, `${at}.admin.description`, problems);
  walkFields(collection.fields, at, problems);
  return problems;
}

function globalProblems(global: SanitizedGlobalConfig): Problem[] {
  const problems: Problem[] = [];
  const at = global.slug;
  check(global.label, `${at}.label`, problems);
  check(global.admin?.group, `${at}.admin.group`, problems);
  check(global.admin?.description, `${at}.admin.description`, problems);
  walkFields(global.fields, at, problems);
  return problems;
}

/** Fields Payload adds to every collection and to auth/upload collections.
 *  They carry `LabelFunction`s or no label at all, so they pass on their own;
 *  the ones that do not are Payload's, not ours. */
const PAYLOAD_OWN = /\.(createdAt|updatedAt|deletedAt|sizes|filename|mimeType|filesize|width|height|focalX|focalY|thumbnailURL|url|_status|id|email|resetPasswordToken|resetPasswordExpiration|salt|hash|loginAttempts|lockUntil|apiKey|apiKeyIndex|enableAPIKey)\b/;

describe("el panel habla los tres idiomas que declara", () => {
  it("cada colección convertida está entera en es, en y ar", async () => {
    const resolved = await config;
    for (const slug of LOCALIZED.collections) {
      const collection = resolved.collections.find((entry) => entry.slug === slug);
      expect(collection, `falta la colección ${slug}`).toBeDefined();
      const problems = collectionProblems(collection as SanitizedCollectionConfig).filter(
        (problem) => !PAYLOAD_OWN.test(problem.path),
      );
      expect(problems.map((problem) => problem.path), JSON.stringify(problems)).toEqual(
        FOREIGN_SPANISH[slug] ?? [],
      );
    }
  });

  it("cada global convertido está entero en es, en y ar", async () => {
    const resolved = await config;
    for (const slug of LOCALIZED.globals) {
      const global = resolved.globals.find((entry) => entry.slug === slug);
      expect(global, `falta el global ${slug}`).toBeDefined();
      const problems = globalProblems(global as SanitizedGlobalConfig).filter(
        (problem) => !PAYLOAD_OWN.test(problem.path),
      );
      expect(problems, `${slug}: ${JSON.stringify(problems)}`).toEqual([]);
    }
  });

  /**
   * The debt, asserted rather than remembered.
   *
   * If one of these is converted and nobody moves it into `LOCALIZED`, this
   * fails and says so — which is the only way a "pending" list stops being a
   * comment that rots.
   */
  it("la lista de pendientes sigue siendo exacta", async () => {
    const resolved = await config;
    const stillPending = PENDING_COLLECTIONS.filter((slug) => {
      const collection = resolved.collections.find((entry) => entry.slug === slug);
      if (collection === undefined) return false;
      return (
        collectionProblems(collection).filter((problem) => !PAYLOAD_OWN.test(problem.path)).length >
        0
      );
    });
    expect(stillPending).toEqual(
      PENDING_COLLECTIONS.filter((slug) =>
        resolved.collections.some((entry) => entry.slug === slug),
      ),
    );
  });

  it("ninguna colección ni global convertido se quedó fuera de la lista", async () => {
    const resolved = await config;
    const known = new Set([
      ...LOCALIZED.collections,
      ...PENDING_COLLECTIONS,
      // Payload's own collections, which it translates itself.
      "payload-locked-documents",
      "payload-preferences",
      "payload-migrations",
      "payload-folders",
      "payload-jobs",
      "payload-kv",
    ]);
    const unknown = resolved.collections
      .map((entry) => entry.slug)
      .filter((slug) => !known.has(slug));
    expect(unknown, "colección nueva sin decidir si está traducida").toEqual([]);
  });
});
