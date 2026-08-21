"use client";

/**
 * The empty state of a new page, answered.
 *
 * Until now a blank page offered nineteen block types and no opinion, which
 * is the moment a block-based CMS stops being usable: the editor has to
 * design before they can write. This offers three compositions written by
 * whoever owns the design (packages/sections/src/starters.ts) and writes one
 * into the form.
 *
 * Two rules, and both are the reason this is small:
 *
 *  - It appears ONLY while the page has no blocks. A starter that could
 *    append to, or replace, real work would need a confirmation, an undo and
 *    a story about merge — and it would still eventually eat somebody's
 *    afternoon. Empty is the only state where "write seven blocks" is
 *    unambiguously safe.
 *  - It is not a library the panel manages. Starters are files reviewed in a
 *    pull request; there is no create, no edit and no delete here, because
 *    that is the multi-tenant half of a page builder and this is one brand.
 */
import { STARTERS, resolveStarter } from "@courvia/sections/starters";
import type { Starter } from "@courvia/sections/starters";
import type { LocalizedText } from "@courvia/appearance";
import { useForm, useFormFields, useLocale, useTranslation } from "@payloadcms/ui";
import { useCallback } from "react";

import { toSubFieldState } from "./starter-form-state";
import { starterRichText } from "./starter-rich-text";
import type { CourviaTranslation } from "./translations";

/** The three languages a starter is written in. */
type StarterLocale = "ar" | "en" | "es";

function asStarterLocale(code: string): StarterLocale {
  return code === "ar" || code === "en" ? code : "es";
}

/**
 * The blocks field is called `blocks` on `pages`, and this component is
 * mounted inside that same document. Naming it here rather than deriving it
 * from `path` is deliberate: a `ui` field's own path is not the blocks
 * field's, and guessing a sibling's name from the DOM would be worse than
 * stating it.
 */
const BLOCKS_PATH = "blocks";

/**
 * `clientProps` from `src/payload/pages.ts`: what each starter writes,
 * already named in the three panel languages. It arrives as data because the
 * registry that knows those names may not be imported from here — see the
 * note on `starterBlockTypes`.
 */
interface PageStartersProps {
  sections?: Record<string, LocalizedText[]>;
}

export function PageStarters({ sections = {} }: PageStartersProps): React.ReactNode {
  const { addFieldRow, getDataByPath } = useForm();
  const { i18n, t } = useTranslation() as unknown as CourviaTranslation;
  const locale = useLocale();
  // Subscribes to the row count only, so typing in any field on the page
  // does not re-render the picker.
  const rowCount = useFormFields(([fields]) => fields[BLOCKS_PATH]?.rows?.length ?? 0);

  const apply = useCallback(
    (starter: Starter) => {
      // Read the rows LIVE rather than trusting the render this click came
      // from. The check below that hides the picker runs on a snapshot; two
      // clicks inside one frame would both see zero rows and write the
      // starter twice, which is the one way this component could damage a
      // page instead of filling an empty one.
      const existing: unknown = getDataByPath(BLOCKS_PATH);
      if (Array.isArray(existing) && existing.length > 0) return;

      const blocks = resolveStarter(starter, asStarterLocale(locale.code), starterRichText);
      blocks.forEach((block, index) => {
        const { blockType, ...content } = block;
        addFieldRow({
          blockType: blockType as string,
          path: BLOCKS_PATH,
          rowIndex: index,
          // The blocks field sits at the top level of the document, so its
          // schema path is its name. Payload 3.88 does not read it in
          // `addFieldRow` — the row's real schema arrives with the server's
          // form state — but the argument is required and guessing it wrong
          // would be a silent trap for whoever nests this later.
          schemaPath: BLOCKS_PATH,
          subFieldState: toSubFieldState(content),
        });
      });
    },
    [addFieldRow, getDataByPath, locale.code],
  );

  // The page already has content: nothing to offer, and nothing to risk.
  if (rowCount > 0) return null;

  const language = asStarterLocale(i18n.language);

  return (
    <div className="cv-starters">
      <p className="cv-starters__eyebrow">{t("courvia:startersEyebrow")}</p>
      <h3 className="cv-starters__heading">{t("courvia:startersHeading")}</h3>
      <p className="cv-starters__lead">{t("courvia:startersLead")}</p>
      <div className="cv-starters__list">
        {STARTERS.map((starter) => (
          <button
            className="cv-starters__card"
            key={starter.id}
            onClick={() => {
              apply(starter);
            }}
            type="button"
          >
            <span className="cv-starters__name">{starter.name[language]}</span>
            <span className="cv-starters__summary">{starter.summary[language]}</span>
            <span className="cv-starters__sections">
              {(sections[starter.id] ?? []).map((label) => label[language]).join(" · ")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
