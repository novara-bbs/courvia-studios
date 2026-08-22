import type { CollectionConfig } from "payload";

import { secureCookies } from "../server/secure-cookies";
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
  /*
   * `auth: true` dejaba la cookie de sesión del panel SIN `Secure`.
   *
   * Payload aplica su propio `secure: false` por defecto cuando no se declara
   * el bloque `cookies`, así que `payload-token` —la sesión completa del CMS—
   * podía viajar en claro en una primera petición http a un dominio que el
   * navegador todavía no tuviera en su lista de HSTS. La cookie del carrito,
   * en este mismo repo, sí lo ponía: no era una decisión, era un hueco.
   *
   * `secureCookies()` mira el ORIGEN público y no `NODE_ENV`, porque
   * `next start` pone `NODE_ENV=production` y sirve por http en local: con la
   * otra regla, entrar al panel de un build local dejaba de funcionar sin
   * decir por qué. Pasar de `true` a un objeto NO pierde los defaults de
   * Payload: `maxLoginAttempts: 5` y `lockTime` siguen aplicándose.
   */
  auth: { cookies: { secure: secureCookies() } },
  labels: {
    singular: { es: "Cuenta", en: "Account", ar: "حساب" },
    plural: { es: "Cuentas", en: "Accounts", ar: "الحسابات" },
  },
  admin: {
    group: { es: "Sistema", en: "System", ar: "النظام" },
    useAsTitle: "email",
    description: {
      es: "Cuentas del panel. Los clientes de la tienda no viven aquí.",
      en: "Back-office accounts. Storefront customers do not live here.",
      ar: "حسابات لوحة الإدارة. لا يوجد عملاء المتجر هنا.",
    },
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
      label: { es: "Nombre", en: "Name", ar: "الاسم" },
      required: true,
    },
    {
      name: "roles",
      type: "select",
      label: { es: "Permisos", en: "Roles", ar: "الصلاحيات" },
      hasMany: true,
      required: true,
      defaultValue: ["editor"],
      options: [
        { label: { es: "Administración", en: "Admin", ar: "إدارة" }, value: "admin" },
        { label: { es: "Edición", en: "Editor", ar: "تحرير" }, value: "editor" },
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
