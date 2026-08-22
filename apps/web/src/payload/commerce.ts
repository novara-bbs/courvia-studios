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
import { panelTextFor } from "./admin-copy";
import type { PanelLanguageSource } from "./admin-copy";

/** The back office reads in three languages too (`admin-copy.ts`): commerce
 *  is the part of the panel a Dubai operator is most likely to open. */
const COMMERCE_GROUP = { es: "Comercio", en: "Commerce", ar: "التجارة" };

const MINOR_UNITS_ERROR = {
  es: "Entero en unidades menores.",
  en: "A whole number, in minor units.",
  ar: "عدد صحيح بالوحدات الصغرى.",
};

/**
 * Un importe es un entero de unidades menores, y esto lo dice en el idioma
 * del panel.
 *
 * Exportado porque `market-settings.ts` valida lo mismo en la tarifa de
 * envío, y una regla que vive en un `const` sin `export` es una regla que el
 * siguiente fichero reescribe con otro mensaje o sin mensaje (lo mismo que
 * documenta `packages/commerce-payload/src/tx-sql.ts`, y allí costó dinero).
 */
export const minorUnits = (
  value: number | null | undefined,
  options: PanelLanguageSource,
): true | string =>
  value === null || value === undefined || Number.isInteger(value)
    ? true
    : panelTextFor(MINOR_UNITS_ERROR, options);

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
  labels: {
    singular: { es: "Pedido", en: "Order", ar: "طلب" },
    plural: { es: "Pedidos", en: "Orders", ar: "الطلبات" },
  },
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
    group: COMMERCE_GROUP,
    defaultColumns: ["id", "status", "market", "totalAmount", "email", "createdAt"],
    description: {
      es: "SOLO SERVIDOR. El estado lo mueve la máquina de estados dentro de una transacción — nunca se edita a mano (docs/orders-state-machine.md).",
      en: "SERVER ONLY. The status is moved by the state machine inside a transaction — never edited by hand (docs/orders-state-machine.md).",
      ar: "من الخادم فقط. تُحرّك آلة الحالات الحالةَ داخل معاملة واحدة — ولا تُحرَّر يدويًا أبدًا (docs/orders-state-machine.md).",
    },
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
      admin: {
        description: {
          es: "Solo lo mueve la máquina de estados. No editar.",
          en: "Moved by the state machine only. Do not edit.",
          ar: "تحرّكه آلة الحالات وحدها. لا تُحرِّره.",
        },
      },
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
          admin: {
            description: {
              es: "Unidades menores, copiadas del precio del mercado al crear.",
              en: "Minor units, copied from the market price at creation time.",
              ar: "بالوحدات الصغرى، منسوخة من سعر السوق عند الإنشاء.",
            },
          },
        },
      ],
    },
    { name: "totalAmount", type: "number", required: true, min: 0, validate: minorUnits },
    {
      name: "shippingAmount",
      type: "number",
      required: true,
      min: 0,
      defaultValue: 0,
      validate: minorUnits,
      admin: {
        description: {
          es: "Porte cobrado, ya incluido en el total. Se guarda aparte porque una devolución puede reembolsar el producto y no el porte.",
          en: "Carriage charged, already inside the total. Stored separately because a return may refund the goods and not the carriage.",
          ar: "أجرة الشحن المحصّلة، وهي ضمن المجموع. تُحفظ منفصلة لأن الإرجاع قد يعيد ثمن البضاعة دون الشحن.",
        },
      },
    },
    {
      name: "taxAmount",
      type: "number",
      required: true,
      min: 0,
      defaultValue: 0,
      validate: minorUnits,
      admin: {
        description: {
          es: "0 mientras los precios son inclusive; el motor fiscal llega con la pasarela.",
          en: "0 while prices are tax-inclusive; the tax engine arrives with the gateway.",
          ar: "صفر ما دامت الأسعار شاملة للضريبة؛ يصل محرّك الضرائب مع البوابة.",
        },
      },
    },
    { name: "refundedAmount", type: "number", required: true, min: 0, defaultValue: 0, validate: minorUnits },
    {
      name: "withdrawalDeadline",
      type: "date",
      admin: {
        readOnly: true,
        description: {
          es: "Hasta cuándo puede desistir quien compró. La abre la entrega y la calcula el plazo legal del mercado; vacía mientras el pedido no esté entregado, o en mercados sin plazo legal uniforme.",
          en: "How long the buyer may withdraw. Delivery opens it and the market’s statutory period sets it; empty until the order is delivered, or in markets with no uniform statutory period.",
          ar: "حتى متى يحق للمشتري الانسحاب. يفتحها التسليم وتحدّدها المهلة القانونية للسوق؛ فارغة حتى يُسلَّم الطلب، أو في أسواق بلا مهلة قانونية موحّدة.",
        },
      },
      /*
       * Solo lectura, y con negación a nivel de CAMPO igual que `status`.
       * `admin.readOnly` gris el input y nada más: la API sigue aceptando la
       * escritura de cualquiera con sesión de admin. Y esta fecha es la que
       * decide si una devolución entra en plazo — moverla a mano es cambiar
       * un derecho del comprador desde un formulario.
       */
      access: { create: nobodyWrites, update: nobodyWrites },
    },
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
      admin: {
        description: {
          es: "Pasarela elegida por el cliente (ADR-14).",
          en: "The gateway the customer chose (ADR-14).",
          ar: "البوابة التي اختارها العميل (ADR-14).",
        },
      },
    },
    {
      name: "providerPaymentId",
      type: "text",
      index: true,
      admin: {
        description: {
          es: "Id del pago en la pasarela; llega al crear la sesión.",
          en: "The payment's id at the gateway; it arrives when the session is created.",
          ar: "معرّف الدفعة لدى البوابة؛ يصل عند إنشاء الجلسة.",
        },
      },
    },
  ],
};

export const Payments: CollectionConfig = {
  slug: "payments",
  labels: {
    singular: { es: "Pago", en: "Payment", ar: "دفعة" },
    plural: { es: "Pagos", en: "Payments", ar: "المدفوعات" },
  },
  admin: {
    useAsTitle: "providerEventId",
    group: COMMERCE_GROUP,
    defaultColumns: ["provider", "type", "order", "amount", "createdAt"],
    description: {
      es: "SOLO SERVIDOR. Libro de eventos de pago normalizados. La fila se inserta ANTES de la transición: (provider, providerEventId) UNIQUE es la idempotencia — un webhook repetido revienta aquí, sin efectos.",
      en: "SERVER ONLY. The ledger of normalized payment events. The row is inserted BEFORE the transition: (provider, providerEventId) UNIQUE is the idempotency — a repeated webhook breaks here, with no effects.",
      ar: "من الخادم فقط. سجل أحداث الدفع المُوحَّدة. يُدرَج الصف قبل الانتقال: القيد الفريد (provider, providerEventId) هو ضمان عدم التكرار — يفشل الويب هوك المكرّر هنا بلا أي أثر.",
    },
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
  labels: {
    singular: { es: "Efecto pendiente", en: "Pending effect", ar: "أثر معلّق" },
    plural: { es: "Bandeja de salida", en: "Outbox", ar: "صندوق الصادر" },
  },
  admin: {
    useAsTitle: "effect",
    group: COMMERCE_GROUP,
    defaultColumns: ["effect", "status", "order", "attempts", "createdAt"],
    description: {
      es: "SOLO SERVIDOR. Efectos externos (email, factura, reembolso en pasarela) escritos en la MISMA transacción que la transición y despachados después del commit — un rollback no des-envía un email.",
      en: "SERVER ONLY. External effects (email, invoice, gateway refund) written in the SAME transaction as the transition and dispatched after the commit — a rollback cannot un-send an email.",
      ar: "من الخادم فقط. آثار خارجية (بريد، فاتورة، ردّ مبلغ لدى البوابة) تُكتب في المعاملة نفسها التي تحمل الانتقال وتُرسل بعد الالتزام — التراجع لا يُلغي بريدًا أُرسل.",
    },
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
      admin: {
        description: {
          es: "Datos del efecto (p. ej. importe de un reembolso, en unidades menores).",
          en: "The effect's data (e.g. a refund amount, in minor units).",
          ar: "بيانات الأثر (مثل مبلغ ردّ، بالوحدات الصغرى).",
        },
      },
    },
    { name: "attempts", type: "number", required: true, defaultValue: 0, min: 0 },
    { name: "lastError", type: "textarea" },
  ],
};

export const Returns: CollectionConfig = {
  slug: "returns",
  labels: {
    singular: { es: "Devolución", en: "Return", ar: "إرجاع" },
    plural: { es: "Devoluciones", en: "Returns", ar: "المرتجعات" },
  },
  admin: {
    // Same problem as Orders, but a return HAS a relationship that names it:
    // the order it belongs to. Linked virtual field, no column, no drift.
    useAsTitle: "customer",
    group: COMMERCE_GROUP,
    defaultColumns: ["id", "customer", "order", "status", "reason", "createdAt"],
    description: {
      es: "SOLO SERVIDOR. RMA: la aprobación humana del reembolso (refund.approved) es el ÚNICO disparador que ordena ejecutar un reembolso en la pasarela.",
      en: "SERVER ONLY. RMA: a human approving the refund (refund.approved) is the ONLY trigger that orders a refund at the gateway.",
      ar: "من الخادم فقط. RMA: موافقة إنسان على ردّ المبلغ (refund.approved) هي المُطلِق الوحيد الذي يأمر بتنفيذ ردّ لدى البوابة.",
    },
  },
  access: serverOnly,
  fields: [
    { name: "order", type: "relationship", relationTo: "orders", required: true, index: true },
    {
      name: "customer",
      type: "text",
      label: { es: "Cliente", en: "Customer", ar: "العميل" },
      virtual: "order.email",
      admin: {
        readOnly: true,
        description: {
          es: "Del pedido enlazado. No es una columna.",
          en: "Taken from the linked order. It is not a column.",
          ar: "مأخوذ من الطلب المرتبط. ليس عمودًا في الجدول.",
        },
      },
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
 * El carrito.
 *
 * La Fase 2 dejó aquí solo el esqueleto de propiedad, y por un motivo que
 * sigue mandando: ADR-029 dice que el owner se fija **al crear el carrito** y
 * viaja con él hasta el final de su vida. `withCommerceOwner`
 * (src/payload/commerce-connections.ts) añade siteKey, engine, connectionKey
 * y bindingRevision y los rellena desde el binding activo al crear. La
 * inmutabilidad no la da esta declaración: la da un trigger en Postgres,
 * porque `overrideAccess: true` —que es como escribe todo el dominio— se
 * salta el acceso por campo por diseño.
 *
 * La Fase 4 le pone dentro lo que se compra. Tres decisiones que no son
 * obvias y que conviene leer antes de añadir una columna:
 *
 * 1. **El precio NO se guarda.** El pedido sí copia `unitAmount` al nacer
 *    —ahí es un contrato, y ADR-05 quiere que un pedido de hace un mes siga
 *    diciendo lo que costó—, pero un carrito guardando el precio es un
 *    carrito que enseña un precio viejo la semana que viene. Se lee vivo de
 *    `prices` al proyectar el carrito, y aun así es informativo: el total que
 *    se cobra lo calcula el servidor en `createCheckout` (§4 de CLAUDE.md).
 *
 * 2. **La moneda tampoco.** Sale del mercado por `MARKET_DEFINITIONS`
 *    (ADR-05: solo se guarda uno de los dos, así que no pueden discrepar).
 *
 * 3. **`market` es inmutable de hecho, no de derecho.** Cambiarlo con líneas
 *    dentro dejaría un carrito con precios de otra moneda; los casos de uso
 *    crean un carrito nuevo en vez de mover el que hay. No lleva trigger
 *    porque, a diferencia del owner, no decide quién manda sobre el dinero.
 */
export const Carts: CollectionConfig = {
  slug: "carts",
  labels: {
    singular: { es: "Carrito", en: "Cart", ar: "سلة" },
    plural: { es: "Carritos", en: "Carts", ar: "السلال" },
  },
  admin: {
    useAsTitle: "sessionId",
    group: COMMERCE_GROUP,
    defaultColumns: ["sessionId", "market", "engine", "connectionKey", "updatedAt"],
    description: {
      es: "SOLO SERVIDOR. Qué conexión manda sobre este carrito y qué lleva dentro. El precio no se guarda: se lee vivo, y el importe que se cobra lo calcula el checkout.",
      en: "SERVER ONLY. Which connection governs this cart and what is in it. The price is not stored: it is read live, and the amount charged is computed by checkout.",
      ar: "من الخادم فقط. أي اتصال يحكم هذه السلة وما بداخلها. السعر غير مخزَّن: يُقرأ حيًّا، والمبلغ المحصَّل يحسبه الدفع.",
    },
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
        description: {
          es: "Identificador opaco de la sesión de compra. Ni un id de usuario ni un email.",
          en: "An opaque id for the shopping session. Neither a user id nor an email address.",
          ar: "معرّف مبهم لجلسة الشراء. ليس معرّف مستخدم ولا بريدًا إلكترونيًا.",
        },
      },
    },
    {
      name: "market",
      type: "select",
      required: true,
      index: true,
      options: [...MARKETS],
      admin: {
        description: {
          es: "El mercado con el que nació. La moneda sale de aquí, no de una columna aparte (ADR-05).",
          en: "The market it was born with. The currency derives from this, not from a separate column (ADR-05).",
          ar: "السوق الذي وُلدت به. تُشتق العملة من هنا لا من عمود منفصل (ADR-05).",
        },
      },
    },
    {
      name: "lines",
      type: "array",
      fields: [
        { name: "variant", type: "relationship", relationTo: "variants", required: true },
        {
          name: "sku",
          type: "text",
          required: true,
          admin: {
            description: {
              es: "Copiado de la variante al añadir la línea, para poder conciliar aunque la variante se renombre.",
              en: "Copied from the variant when the line is added, so reconciliation survives a rename.",
              ar: "منسوخ من المتغيّر عند إضافة البند، لتبقى المطابقة ممكنة بعد إعادة التسمية.",
            },
          },
        },
        { name: "quantity", type: "number", required: true, min: 1, validate: minorUnits },
      ],
    },
    {
      name: "expiresAt",
      type: "date",
      required: true,
      index: true,
      admin: {
        description: {
          es: "Un carrito abandonado no es un carrito eterno. La barrida lo borra; no reserva stock, así que caducar no libera nada.",
          en: "An abandoned cart is not an eternal one. The sweep deletes it; it reserves no stock, so expiring frees nothing.",
          ar: "السلة المهجورة ليست أبدية. يحذفها المسح؛ وهي لا تحجز مخزونًا، فانتهاؤها لا يحرّر شيئًا.",
        },
      },
    },
  ],
};
