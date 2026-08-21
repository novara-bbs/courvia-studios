/**
 * A starter's blocks, in the shape Payload's form reducer accepts.
 *
 * The panel does not hold a document as JSON: it holds a FLAT map of field
 * paths to `{ value, initialValue }`, and an array or blocks field keeps its
 * row identities in a `rows` array while its own `value` is the row COUNT.
 * `dispatchFields({ type: 'ADD_ROW', subFieldState })` takes exactly one
 * block's worth of that map, with paths relative to the row
 * (@payloadcms/ui/forms/Form/fieldReducer.ts).
 *
 * Why go through the reducer at all, rather than writing the document and
 * reloading: a page an editor has just created has no id yet, so there is
 * nothing to PATCH. Adding rows to the live form works before the first save
 * and after it, and autosave (375 ms) persists it either way.
 *
 * How much of this shape has to be right is bounded, and that is what makes
 * it safe to build by hand: the form's `onChange` sends this state to the
 * server, which derives the DATA from it (`reduceFieldsToValues`, in
 * @payloadcms/ui/utilities/buildFormState.ts) and returns canonical state
 * built from the schema. So the values and the row identities must be
 * correct; everything else the server fills in.
 *
 * `disableFormData` is the one flag that is not decoration: without it the
 * row COUNT of an array is read as that array's value and the document
 * arrives with `items: 3`.
 */

import type { FormState } from "payload";

/** One entry of Payload's flat form state, narrowed to what a starter sets. */
type FieldState = FormState[string];

/**
 * A row id in the shape Payload generates.
 *
 * 24 hex characters, because that is what `bson-objectid` produces and what
 * the clipboard merge checks with `ObjectId.isValid` before deciding whether
 * a pasted row needs a fresh identity. A row id of another shape works until
 * something takes that branch.
 */
function rowId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function leaf(value: unknown): FieldState {
  return { initialValue: value, valid: true, value };
}

/** True for a value that has to become rows rather than one field value. */
function isRowList(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))
  );
}

/**
 * Flattens one block's content into form state, paths relative to the row.
 *
 * Three shapes and nothing else, because the section DSL only produces
 * three: a leaf (text, select, upload id, rich-text document, a list of
 * picked product ids), a group (`appearance`, a link's label/href) and rows
 * (any array field).
 */
export function toSubFieldState(content: Record<string, unknown>, prefix = ""): FormState {
  const state: FormState = {};
  for (const [key, value] of Object.entries(content)) {
    if (value === undefined) continue;
    const path = prefix === "" ? key : `${prefix}.${key}`;

    if (isRowList(value)) {
      const rows = value.map(() => ({ id: rowId() }));
      state[path] = {
        disableFormData: true,
        initialValue: value.length,
        rows,
        valid: true,
        value: value.length,
      };
      value.forEach((row, index) => {
        const id = rows[index]?.id ?? rowId();
        state[`${path}.${String(index)}.id`] = leaf(id);
        Object.assign(state, toSubFieldState(row, `${path}.${String(index)}`));
      });
      continue;
    }

    // A group: `appearance`, or the two halves of a link. Rich text is an
    // object too and must NOT be walked into — it is one value, and its
    // internals belong to the editor.
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      !("root" in value)
    ) {
      Object.assign(state, toSubFieldState(value as Record<string, unknown>, path));
      continue;
    }

    state[path] = leaf(value);
  }
  return state;
}
