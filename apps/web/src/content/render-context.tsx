/**
 * The app-side RenderContext: sections stay pure and editor-agnostic, so the
 * lexical serializer is injected here, at the composition root — swapping
 * the editor never touches a section.
 */
import { RichText } from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import type { RenderContext } from "@courvia/sections/registry";

export function makeRenderContext(preview: boolean): RenderContext {
  return {
    preview,
    renderRichText: (value) =>
      value === null || value === undefined ? null : (
        <RichText data={value as SerializedEditorState} />
      ),
  };
}
