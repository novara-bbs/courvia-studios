import type { CollectionConfig } from "payload";

import { isAdmin, isAdminOrSelf } from "./access";

/**
 * Admin/editor accounts for the back office. Customers are NOT users: they
 * get their own collection when accounts ship (CLAUDE.md data model), so
 * storefront auth never shares a table with panel access.
 *
 * The first admin is seeded with `pnpm --filter @courvia/web seed:admin`
 * (Local API, so the create:isAdmin gate below cannot lock us out).
 */
export const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  labels: { singular: "Cuenta", plural: "Cuentas" },
  admin: {
    group: "Sistema",
    useAsTitle: "email",
    description: "Cuentas del panel. Los clientes de la tienda no viven aquí.",
  },
  access: {
    read: isAdminOrSelf,
    create: isAdmin,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "roles",
      type: "select",
      hasMany: true,
      required: true,
      defaultValue: ["editor"],
      options: [
        { label: "Admin", value: "admin" },
        { label: "Editor", value: "editor" },
      ],
      // Only admins may grant roles; without this an editor could
      // self-promote through the REST API.
      access: {
        update: ({ req }) => Boolean(req.user?.roles?.includes("admin")),
      },
      saveToJWT: true,
    },
  ],
};
