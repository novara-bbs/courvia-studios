import type { Access } from "payload";

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
