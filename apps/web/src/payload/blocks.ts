/**
 * Projects the section registry into Payload block configs. Never
 * hand-written: the registry's neutral field DSL is the single source, so a
 * section's admin form, its Zod contract and its renderer cannot drift.
 *
 * Everything an editor READS is projected too — labels, help lines, option
 * names, row headers, the picker's shelves and its thumbnails. None of it is
 * typed here: a Spanish string in this file would be content living outside
 * the package that owns it, and it would stay Spanish for an editor whose
 * panel is in English or Arabic. This module only translates shapes.
 */
import { APPEARANCE_GROUP_COPY, CONTROLS, CONTROL_COPY, controlOptions } from "@courvia/appearance";
import type { ControlDefinition, ControlName, LocalizedText } from "@courvia/appearance";
import {
  HREF_ERROR,
  LINK_CHILD_COPY,
  SECTIONS,
  SECTION_GROUP_COPY,
  isAuthoredHref,
  sketchDataUri,
} from "@courvia/sections/registry";
import type { FieldCopy, FieldSpec, Fields } from "@courvia/sections/registry";
import type { Block, Field, LabelFunction } from "payload";

/**
 * A localized record, resolved by the panel's language.
 *
 * Payload's `getTranslation` already understands `Record<language, string>`,
 * so labels, descriptions and group names need no function. Block labels do
 * (see `localizedLabel`), because those are resolved once on the server when
 * the client config is built.
 */
function localized(text: LocalizedText): Record<string, string> {
  return text;
}

/**
 * A block label as a function of the admin's i18n.
 *
 * `createClientBlocks` calls it server-side with the request's `i18n` and
 * stores the result, so the panel gets the name in ITS language instead of
 * the Spanish one this repo happens to write first. The fallback chain is
 * explicit — an admin language we do not translate (Payload ships dozens)
 * lands on English, never on `undefined`.
 */
function localizedLabel(text: LocalizedText): LabelFunction {
  return ({ i18n }) => {
    const language = i18n.language;
    return (language in text ? text[language as keyof LocalizedText] : undefined) ?? text.en;
  };
}

/** The copy for one option of a content select, or a loud failure. */
function optionCopy(
  field: string,
  labels: Readonly<Record<string, LocalizedText>>,
  value: string,
): LocalizedText {
  const copy = labels[value];
  if (copy === undefined) {
    throw new Error(`No editor copy for ${field}='${value}' — add it to the section's optionLabels`);
  }
  return copy;
}

/** What Payload hands a `validate`, narrowed to the part this one reads. */
type ValidateOptions = { req?: { i18n?: { language?: string } } };

/**
 * A `validate` for a destination field, in the panel's language.
 *
 * `req.i18n.language` is the language of the PANEL, not `req.locale`, which
 * is the language of the content being edited. An editor filling in the
 * Arabic version of a page with the panel in Spanish must read the refusal
 * in Spanish.
 */
function hrefValidate(): (value: unknown, options: ValidateOptions) => true | string {
  return (value, options) => {
    // Emptiness is `required`'s business; this only judges shape. Refusing a
    // blank optional field as an "invalid destination" would be a lie.
    if (value === null || value === undefined || value === "") return true;
    if (typeof value === "string" && isAuthoredHref(value)) return true;
    const language = options.req?.i18n?.language;
    const translated =
      language !== undefined && language in HREF_ERROR
        ? HREF_ERROR[language as keyof typeof HREF_ERROR]
        : undefined;
    return translated ?? HREF_ERROR.en;
  };
}

/** The `admin` block of a field: label copy plus an optional help line. */
function fieldAdmin(copy: FieldCopy): { description?: Record<string, string> } {
  return copy.help === undefined ? {} : { description: localized(copy.help) };
}

function fieldToPayload(name: string, spec: FieldSpec): Field {
  const label = localized(spec.label);
  const admin = fieldAdmin(spec);
  switch (spec.kind) {
    case "text":
      return {
        name,
        type: "text",
        label,
        required: spec.required ?? false,
        localized: spec.localized ?? false,
        ...(spec.max !== undefined ? { maxLength: spec.max } : {}),
        ...(spec.format === "href" ? { validate: hrefValidate() } : {}),
        admin,
      };
    case "textarea":
      return {
        name,
        type: "textarea",
        label,
        required: spec.required ?? false,
        localized: spec.localized ?? false,
        ...(spec.max !== undefined ? { maxLength: spec.max } : {}),
        admin,
      };
    case "richText":
      return {
        name,
        type: "richText",
        label,
        required: spec.required ?? false,
        localized: spec.localized ?? false,
        admin,
      };
    case "select":
      return {
        name,
        type: "select",
        label,
        required: spec.required ?? false,
        // The stored value is unchanged: this is a translation of the
        // OPTION, not a widening of the enum. An option with no copy throws
        // rather than falling back to something plausible — a fallback is
        // indistinguishable from a deliberate label, which is how `h2` and
        // `youtube` survived as option labels in the first place.
        options: spec.options.map((value) => ({
          label: localized(optionCopy(name, spec.optionLabels, value)),
          value,
        })),
        admin,
      };
    case "array":
      return {
        name,
        type: "array",
        label,
        required: spec.required ?? false,
        // Payload prints `${singular} 01` in the row header, which is why
        // every array on this site read "Item 01" — including the twelve
        // rows of an FAQ.
        labels: {
          singular: localized(spec.rowLabels.singular),
          plural: localized(spec.rowLabels.plural),
        },
        ...(spec.min !== undefined ? { minRows: spec.min } : {}),
        ...(spec.max !== undefined ? { maxRows: spec.max } : {}),
        fields: fieldsToPayload(spec.of),
        admin: {
          ...admin,
          // Rows arrive folded. An eight-row bento or a twelve-row FAQ
          // expanded is a form nobody can see the shape of, and the row
          // header now says what each one is.
          initCollapsed: true,
        },
      };
    case "link":
      return {
        name,
        type: "group",
        label,
        fields: fieldsToPayload({
          label: {
            kind: "text",
            required: true,
            localized: spec.localized ?? false,
            ...LINK_CHILD_COPY.label,
          },
          href: { kind: "text", required: true, format: "href", ...LINK_CHILD_COPY.href },
        }),
        admin,
      };
    case "upload":
      return {
        name,
        type: "upload",
        label,
        relationTo: "media",
        required: spec.required ?? false,
        // The thumbnail of the chosen asset, in the field. Without it the
        // control is a filename, and a filename is not how anyone
        // recognises a photograph.
        displayPreview: true,
        admin,
      };
    case "products":
      return {
        name,
        type: "relationship",
        label,
        relationTo: "products",
        hasMany: true,
        required: spec.required ?? false,
        ...(spec.max !== undefined ? { maxRows: spec.max } : {}),
        admin,
      };
    case "partial":
      return {
        name,
        type: "relationship",
        label,
        relationTo: "partials",
        hasMany: false,
        required: spec.required ?? false,
        admin,
      };
  }
}

/**
 * A section's fields, with consecutive `row`-mates folded into one line.
 *
 * Only CONSECUTIVE fields are paired: a row key reused further down the
 * declaration would otherwise produce two one-field rows, which looks like
 * the grouping worked and is not a grouping. A registry test rejects that
 * shape at the source instead of letting this function paper over it.
 */
function fieldsToPayload(fields: Fields): Field[] {
  const out: Field[] = [];
  let run: { key: string; fields: Field[] } | undefined;

  const flush = (): void => {
    if (run === undefined) return;
    // One field alone is not a row; emitting it bare keeps its label on its
    // own line where a lone input reads better.
    out.push(
      run.fields.length > 1 ? { type: "row", fields: run.fields } : (run.fields[0] as Field),
    );
    run = undefined;
  };

  for (const [name, spec] of Object.entries(fields)) {
    const field = fieldToPayload(name, spec);
    if (spec.row === undefined) {
      flush();
      out.push(field);
      continue;
    }
    if (run !== undefined && run.key !== spec.row) flush();
    run ??= { key: spec.row, fields: [] };
    run.fields.push(field);
  }
  flush();
  return out;
}

/**
 * The design controls, folded away.
 *
 * A `collapsible` WRAPPING the named group rather than replacing it: the
 * group owns the `appearance` key every stored block already carries and
 * every renderer reads, so swapping it for a collapsible would move nine
 * values to the top level of every block — a content migration in exchange
 * for a fold. The collapsible is presentational and changes nothing stored.
 */
function appearanceSection(allowed: readonly ControlName[]): Field {
  return {
    type: "collapsible",
    label: localized(APPEARANCE_GROUP_COPY.label),
    admin: {
      // Folded by default: the design controls are the LAST thing an editor
      // touches and, expanded, nine selects push the content fields — the
      // reason the block exists — off the screen.
      initCollapsed: true,
      description: localized(APPEARANCE_GROUP_COPY.help),
    },
    fields: [
      {
        name: "appearance",
        type: "group",
        // The collapsible already carries the name; repeating it would
        // print "Diseño" twice, one line apart.
        label: false,
        fields: allowed.map((name) => {
          const control: ControlDefinition = CONTROLS[name];
          const copy = CONTROL_COPY[name];
          return {
            name,
            type: "select",
            label: localized(copy.label),
            defaultValue: control.default,
            options: controlOptions(name).map((option) => ({
              label: localized(option.label),
              value: option.value,
            })),
            admin: { description: localized(copy.help) },
          } satisfies Field;
        }),
      },
    ],
  };
}

/**
 * Which sections a given surface may offer.
 *
 * The default EXCLUDES the bound sections (WP13) on purpose, and the default
 * is what `pages` already calls: a `productHero` dropped onto the privacy
 * page has no subject to read, so the only thing it could ever do there is
 * render nothing — a block in the drawer that produces an invisible band is
 * how an editor concludes the system is broken. Templates pass
 * `{ bound: true }` and get everything, because a product template is
 * exactly the place where marketing sections and bound slots are meant to
 * be interleaved (docs/ARCHITECTURE.md §3).
 *
 * `exclude` removes named types after the `bound` filter. `Partials`
 * (ADR-030) is the one caller: passing `{ exclude: ["partialRef"] }` keeps a
 * partial from referencing another partial by never offering the block in
 * that collection's own picker — the guard lives in what an editor can save,
 * not in a runtime check the renderer would otherwise need.
 */
export function buildBlocks(options?: { bound?: boolean; exclude?: readonly string[] }): Block[] {
  const excluded = new Set(options?.exclude ?? []);
  const include = (
    options?.bound === true
      ? Object.values(SECTIONS)
      : Object.values(SECTIONS).filter((section) => section.bound !== true)
  ).filter((section) => !excluded.has(section.type));
  return include.map((section) => ({
    slug: section.type,
    // Postgres caps identifiers at 63 chars and versioned block tables
    // prefix heavily; long section types declare a compact db identity.
    ...(section.dbName === undefined ? {} : { dbName: section.dbName }),
    labels: {
      singular: localizedLabel(section.labels.singular),
      plural: localizedLabel(section.labels.plural),
    },
    admin: {
      group: localized(SECTION_GROUP_COPY[section.group]),
      images: {
        // Generated from the section's own sketch, so it cannot go stale.
        // `alt` is empty on purpose: the drawer prints the block's name
        // directly under the tile, and a duplicate is noise to a screen
        // reader, not help.
        thumbnail: { url: sketchDataUri(section.thumbnail), alt: "" },
      },
    },
    fields: [...fieldsToPayload(section.fields), appearanceSection(section.appearance)],
  }));
}
