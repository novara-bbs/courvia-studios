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

import { isAdmin, nobodyWrites } from "./access";

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
  labels: { singular: "Pedido", plural: "Pedidos" },
  admin: {
    /**
     * `id` titled every order in every list and every relationship selector,
     * so picking the order a shipment belongs to meant choosing between "12"
     * and "13". The customer's email address is the one field on an order
     * that a human recognises; the number stays as the first column, so the
     * list shows both. A composed "#12 · ana@… · 1.290,00 €" would read better
     * still and is not possible: it would be either a stored column (a
     * migration, and a copy that goes stale) or a computed `virtual: true`
     * field, which Payload 3.88 refuses as a title unless it is linked to a
     * relationship — and an order has no relationship that names it.
     */
    useAsTitle: "email",
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
      /**
       * The description used to read "only the state machine moves this. Do
       * not edit" — and the field was writable by anyone who could reach the
       * REST API, which for a collection whose access is `isAdmin` means
       * every admin, forever, one PATCH away from a paid order that was
       * never paid. `admin.readOnly` (added by `withFulfilment`) greys the
       * input; this closes the API. Both are needed, and neither costs the
       * domain anything: every legitimate write runs `overrideAccess: true`,
       * which bypasses field access by design.
       */
      access: { create: nobodyWrites, update: nobodyWrites },
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
  labels: { singular: "Pago", plural: "Pagos" },
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
  labels: { singular: "Efecto pendiente", plural: "Bandeja de salida" },
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
  labels: { singular: "Devolución", plural: "Devoluciones" },
  admin: {
    // Same problem as Orders, but a return HAS a relationship that names it:
    // the order it belongs to. Linked virtual field, no column, no drift.
    useAsTitle: "customer",
    group: "Comercio",
    defaultColumns: ["id", "customer", "order", "status", "reason", "createdAt"],
    description:
      "SOLO SERVIDOR. RMA: la aprobación humana del reembolso (refund.approved) es el ÚNICO disparador que ordena ejecutar un reembolso en la pasarela.",
  },
  access: serverOnly,
  fields: [
    { name: "order", type: "relationship", relationTo: "orders", required: true, index: true },
    {
      name: "customer",
      type: "text",
      label: "Cliente",
      virtual: "order.email",
      admin: { readOnly: true, description: "Del pedido enlazado. No es una columna." },
    },
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

/**
 * El carrito, y solo su esqueleto de propiedad.
 *
 * **Esto NO es el carrito.** No tiene líneas, ni totales, ni caducidad, ni
 * casos de uso: eso es la Fase 4 del plan. Lo que existe aquí es la fila
 * donde vive el dueño, y existe ahora por un motivo concreto: ADR-029 dice
 * que el owner se fija **al crear el carrito** y viaja con él hasta el final
 * de su vida. Un carrito que naciera sin esas columnas obligaría a añadirlas
 * después a filas que ya existen, y «después» es donde se cuelan los
 * carritos huérfanos que la Fase 4 tendría que adivinar a quién pertenecen.
 *
 * `withCommerceOwner` (src/payload/commerce-connections.ts) añade siteKey,
 * engine, connectionKey y bindingRevision, y los rellena desde el binding
 * activo al crear. La inmutabilidad no la da esta declaración: la da un
 * trigger en Postgres, porque `overrideAccess: true` —que es como escribe
 * todo el dominio— se salta el acceso por campo por diseño.
 */
export const Carts: CollectionConfig = {
  slug: "carts",
  labels: { singular: "Carrito", plural: "Carritos" },
  admin: {
    useAsTitle: "sessionId",
    group: "Comercio",
    defaultColumns: ["sessionId", "engine", "connectionKey", "createdAt"],
    description:
      "SOLO SERVIDOR. Fase 2: únicamente la propiedad (qué conexión manda sobre este carrito). Las líneas y el flujo llegan en la Fase 4.",
  },
  access: serverOnly,
  fields: [
    {
      name: "sessionId",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "Identificador opaco de la sesión de compra. Ni un id de usuario ni un email.",
      },
    },
  ],
};
