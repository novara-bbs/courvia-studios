import type { Access, FieldAccess } from "payload";

/**
 * Access primitives. Deliberately few: until real editorial workflows exist,
 * two roles (admin, editor) and four predicates cover everything, and each
 * collection states its policy explicitly instead of inheriting a default.
 */

export type Role = "admin" | "editor";

function roles(user: unknown): Role[] {
  const value = (user as { roles?: unknown } | null)?.roles;
  return Array.isArray(value) ? (value as Role[]) : [];
}

export const isAdmin: Access = ({ req }) => roles(req.user).includes("admin");

export const isAdminOrSelf: Access = ({ req, id }) => {
  if (req.user === null || req.user === undefined) return false;
  if (roles(req.user).includes("admin")) return true;
  return id !== undefined && String(req.user.id) === String(id);
};

export const isAuthenticated: Access = ({ req }) => Boolean(req.user);

export const anyone: Access = () => true;

/**
 * Field-level denial, for columns that only the domain may write.
 *
 * `admin.readOnly` greys a field out in the panel and stops there: the REST
 * and GraphQL APIs never see it, so a description saying "do not edit" plus
 * a greyed input is a request, not a rule. Field access IS the rule — and it
 * is bypassed by `overrideAccess: true`, which is exactly how every domain
 * write already runs (state machine, adapters, seeds), so denying the field
 * costs the domain nothing and closes the API.
 */
export const nobodyWrites: FieldAccess = () => false;

/**
 * Nav/route visibility for entities an editor cannot act on.
 *
 * Payload already hides a collection whose `read` an editor fails, so this
 * is only for the ones an editor may still READ and must not be invited to
 * touch — prices and stock. The argument shape differs between collections
 * (`ClientUser`) and globals (`PayloadRequest['user']`), and both are just
 * "the user or null" here, hence the structural parameter.
 */
export const hiddenUnlessAdmin = ({ user }: { user: unknown }): boolean =>
  !roles(user).includes("admin");
