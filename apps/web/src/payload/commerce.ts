/**
 * Commerce persistence (CLAUDE.md §4 · .claude/rules/payments.md):
 * orders, the payments EVENT LEDGER, the transactional outbox and returns.
 *
 * ALL server-only. Rows are written exclusively by the commerce adapter
 * over the Local API inside DB transactions — never through public
 * REST/GraphQL, and never by hand: the state machine is the only thing
 * allowed to move an order's status. Amounts are integer minor units; the
 * currency is derived from the market registry (ADR-05: the two can never
 * drift because only one is stored).
 */
import { MARKETS, PAYMENT_PROVIDERS } from "@courvia/platform";
import { ORDER_STATUSES, PAYMENT_EVENT_TYPES, SIDE_EFFECT_EXECUTION } from "@courvia/commerce-domain";
import type { CollectionConfig, Field } from "payload";

import { isAdmin } from "./access";

const minorUnits = (value: number | null | undefined): true | string =>
  value === null || value === undefined || Number.isInteger(value)
    ? true
    : "Entero en unidades menores";

const addressFields: Field[] = [
  { name: "name", type: "text", required: true },
  { name: "line1", type: "text", required: true },
  { name: "line2", type: "text" },
  { name: "city", type: "text", required: true },
  { name: "postalCode", type: "text", required: true },
  { name: "country", type: "text", required: true, maxLength: 2 },
];

/** PII + money: nothing here is ever readable or writable through public
 *  REST/GraphQL. The Local API (overrideAccess) is the only write path. */
const serverOnly = { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin };

export const Orders: CollectionConfig = {
  slug: "orders",
  admin: {
    useAsTitle: "id",
    group: "Comercio",
    defaultColumns: ["id", "status", "market", "totalAmount", "email", "createdAt"],
    description:
      "SOLO SERVIDOR. El estado lo mueve la máquina de estados dentro de una transacción — nunca se edita a mano (docs/orders-state-machine.md).",
  },
  access: serverOnly,
  fields: [
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      index: true,
      options: [...ORDER_STATUSES],
      admin: { description: "Solo lo mueve la máquina de estados. No editar." },
    },
    { name: "market", type: "select", required: true, options: [...MARKETS] },
    { name: "email", type: "email", required: true, index: true },
    { name: "locale", type: "text" },
    {
      name: "lines",
      type: "array",
      required: true,
      minRows: 1,
      fields: [
        { name: "variant", type: "relationship", relationTo: "variants", required: true },
        { name: "sku", type: "text", required: true },
        { name: "quantity", type: "number", required: true, min: 1, validate: minorUnits },
        {
          name: "unitAmount",
          type: "number",
          required: true,
          min: 0,
          validate: minorUnits,
          admin: { description: "Unidades menores, copiadas del precio del mercado al crear." },
        },
      ],
    },
    { name: "totalAmount", type: "number", required: true, min: 0, validate: minorUnits },
    {
      name: "taxAmount",
      type: "number",
      required: true,
      min: 0,
      defaultValue: 0,
      validate: minorUnits,
      admin: {
        description: "0 mientras los precios son inclusive; el motor fiscal llega con la pasarela.",
      },
    },
    { name: "refundedAmount", type: "number", required: true, min: 0, defaultValue: 0, validate: minorUnits },
    { name: "shippingAddress", type: "group", fields: addressFields },
    {
      name: "billingAddress",
      type: "group",
      // Same shape, every subfield optional: absent = same as shipping.
      fields: addressFields.map((field) => ({ ...field, required: false }) as Field),
    },
    {
      name: "provider",
      type: "select",
      options: [...PAYMENT_PROVIDERS],
      admin: { description: "Pasarela elegida por el cliente (ADR-14)." },
    },
    {
      name: "providerPaymentId",
      type: "text",
      index: true,
      admin: { description: "Id del pago en la pasarela; llega al crear la sesión." },
    },
  ],
};

export const Payments: CollectionConfig = {
  slug: "payments",
  admin: {
    useAsTitle: "providerEventId",
    group: "Comercio",
    defaultColumns: ["provider", "type", "order", "amount", "createdAt"],
    description:
      "SOLO SERVIDOR. Libro de eventos de pago normalizados. La fila se inserta ANTES de la transición: (provider, providerEventId) UNIQUE es la idempotencia — un webhook repetido revienta aquí, sin efectos.",
  },
  access: serverOnly,
  fields: [
    { name: "provider", type: "select", required: true, options: [...PAYMENT_PROVIDERS] },
    { name: "providerEventId", type: "text", required: true },
    { name: "type", type: "select", required: true, options: [...PAYMENT_EVENT_TYPES] },
    { name: "order", type: "relationship", relationTo: "orders", required: true, index: true },
    { name: "providerPaymentId", type: "text" },
    { name: "amount", type: "number", required: true, min: 0, validate: minorUnits },
    { name: "partial", type: "checkbox", defaultValue: false },
    { name: "occurredAt", type: "date", required: true },
  ],
  indexes: [{ fields: ["provider", "providerEventId"], unique: true }],
};

export const Outbox: CollectionConfig = {
  slug: "outbox",
  admin: {
    useAsTitle: "effect",
    group: "Comercio",
    defaultColumns: ["effect", "status", "order", "attempts", "createdAt"],
    description:
      "SOLO SERVIDOR. Efectos externos (email, factura, reembolso en pasarela) escritos en la MISMA transacción que la transición y despachados después del commit — un rollback no des-envía un email.",
  },
  access: serverOnly,
  fields: [
    {
      name: "effect",
      type: "select",
      required: true,
      options: [
        ...Object.entries(SIDE_EFFECT_EXECUTION)
          .filter(([, execution]) => execution === "outbox")
          .map(([effect]) => effect),
        // Non-payment effects dispatched through the same queue. The payment
        // domain never emits these; they come from their own hooks/actions.
        "notify_sales_lead",
      ],
    },
    // Optional: payment effects carry an order, lead effects carry a lead.
    { name: "order", type: "relationship", relationTo: "orders", index: true },
    { name: "lead", type: "relationship", relationTo: "leads", index: true },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      index: true,
      options: ["pending", "dispatched", "failed"],
    },
    {
      name: "payload",
      type: "json",
      admin: { description: "Datos del efecto (p. ej. importe de un reembolso, en unidades menores)." },
    },
    { name: "attempts", type: "number", required: true, defaultValue: 0, min: 0 },
    { name: "lastError", type: "textarea" },
  ],
};

export const Returns: CollectionConfig = {
  slug: "returns",
  admin: {
    useAsTitle: "id",
    group: "Comercio",
    defaultColumns: ["order", "status", "reason", "createdAt"],
    description:
      "SOLO SERVIDOR. RMA: la aprobación humana del reembolso (refund.approved) es el ÚNICO disparador que ordena ejecutar un reembolso en la pasarela.",
  },
  access: serverOnly,
  fields: [
    { name: "order", type: "relationship", relationTo: "orders", required: true, index: true },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "requested",
      options: ["requested", "received", "refunded", "rejected"],
    },
    {
      name: "lines",
      type: "array",
      required: true,
      minRows: 1,
      fields: [
        { name: "sku", type: "text", required: true },
        { name: "quantity", type: "number", required: true, min: 1, validate: minorUnits },
      ],
    },
    { name: "reason", type: "textarea", required: true, maxLength: 1000 },
    { name: "refundAmount", type: "number", min: 0, validate: minorUnits },
  ],
};
