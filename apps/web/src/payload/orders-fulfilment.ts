/**
 * The way out of `paid`: shipments, carriers, and the only door that moves
 * an order forward.
 *
 * Until now a paid order stayed paid for ever — nothing emitted a
 * `fulfilment.*` trigger and an order had no carrier, no tracking and no
 * shipped date. The temptation was a "mark as shipped" button in the admin
 * plus a status field somebody edits. Both were refused:
 *
 *   - A BUTTON needs a custom React component, and a component with visible
 *     text breaks the rule that no user-facing string lives in one. So the
 *     admin surface is a DOCUMENT: an operator opens a shipment, fills in
 *     carrier and tracking, and later dates the delivery. Writing the
 *     shipment down IS shipping the order — one act, one transaction.
 *   - An EDITABLE STATUS is a back door around the state machine. `status`
 *     is read-only in the admin (see `withFulfilment` below) and moves only
 *     through `transition()`, inside the same transaction as the shipment
 *     row, with the same rejection codes the payment path uses.
 *
 * Guards therefore come from the machine, not from this file: delivered
 * before shipped, shipped before picked, anything at all on a cancelled
 * order — all refused there, and refusing rolls the shipment row back too,
 * so there is never a shipment recorded for an order that could not ship.
 *
 * Nothing here calls the outside world. Every fulfilment side-effect is
 * classified `outbox` in the domain (a domain test enforces it), so this
 * module only ever appends outbox rows inside the transaction and lets the
 * dispatcher send them after commit.
 *
 * Access: fulfilment is an ADMIN act. There is no warehouse role yet
 * (`users.ts` knows admin and editor), so `isAdmin` is the gate and
 * `markedBy` records which human did it. Introducing a `fulfilment` role
 * later is one option in `users.ts` plus one predicate here.
 */
import { MARKETS, MARKET_DEFINITIONS } from "@courvia/platform";
import type { MarketId } from "@courvia/platform";
import {
  SIDE_EFFECT_EXECUTION,
  TRACKING_PLACEHOLDER,
  buildTrackingUrl,
  checkTrackingUrlTemplate,
  transition,
} from "@courvia/commerce-domain";
import type { OrderStatus, OrderTrigger, SideEffect } from "@courvia/commerce-domain";
import { APIError } from "payload";
import type {
  CollectionBeforeChangeHook,
  CollectionConfig,
  Field,
  PayloadRequest,
  TextFieldSingleValidation,
} from "payload";

import { isAdmin } from "./access";
import { panelText, panelTextFor } from "./admin-copy";
import type { LocalizedText } from "./admin-copy";

/**
 * Everything fulfilment says when it refuses, in the panel's three
 * languages (`admin-copy.ts`).
 *
 * Both kinds of refusal live here. A `validate` returns a finished string
 * and an `APIError` carries one, and Payload passes neither through
 * `getTranslation` — so both are resolved by hand against the PANEL's
 * language. Dubai is a market we ship to, and the person opening a shipment
 * is not guaranteed to read Spanish.
 *
 * `{placeholders}` are substituted after resolution, never concatenated
 * before it: a sentence assembled from fragments cannot be reordered by a
 * translator, and Arabic reorders.
 */
const FULFILMENT_COPY = {
  required: { es: "Obligatorio.", en: "Required.", ar: "حقل مطلوب." },
  trackingNotHttps: {
    es: "Tiene que empezar por https:// — el enlace se envía por email.",
    en: "It has to start with https:// — the link is sent by email.",
    ar: "يجب أن يبدأ بـ https:// — يُرسَل الرابط بالبريد.",
  },
  trackingNoPlaceholder: {
    es: "Falta {placeholder}: sin ese hueco no hay nada que sustituir.",
    en: "{placeholder} is missing: with no slot there is nothing to substitute.",
    ar: "العنصر {placeholder} مفقود: بلا هذا الموضع لا شيء يُستبدل.",
  },
  carrierCodeShape: {
    es: "Solo minúsculas, números y guiones.",
    en: "Lowercase letters, numbers and hyphens only.",
    ar: "أحرف صغيرة وأرقام وشرطات فقط.",
  },
  orderMissing: {
    es: "El pedido del envío no existe.",
    en: "The shipment's order does not exist.",
    ar: "طلب هذا الشحن غير موجود.",
  },
  transitionRefused: {
    es: 'No se puede aplicar "{trigger}" a un pedido en "{status}" ({rejection}).',
    en: 'Cannot apply "{trigger}" to an order in "{status}" ({rejection}).',
    ar: 'لا يمكن تطبيق "{trigger}" على طلب في حالة "{status}" ({rejection}).',
  },
  effectNotOutbox: {
    es: 'El efecto "{effect}" no es de outbox y el fulfilment no lo ejecuta.',
    en: 'Effect "{effect}" is not an outbox effect and fulfilment does not run it.',
    ar: 'الأثر "{effect}" ليس من صندوق الصادر ولا ينفّذه قسم الشحن.',
  },
  carrierMissing: {
    es: "El transportista no existe.",
    en: "That carrier does not exist.",
    ar: "شركة الشحن غير موجودة.",
  },
  carrierRetired: {
    es: '"{carrier}" está retirado: elige un transportista activo.',
    en: '"{carrier}" has been retired: choose an active carrier.',
    ar: 'أُوقفت "{carrier}": اختر شركة شحن فعّالة.',
  },
  carrierWrongMarket: {
    es: '"{carrier}" no opera en el mercado {market} de este pedido.',
    en: '"{carrier}" does not operate in this order\'s {market} market.',
    ar: 'لا تعمل "{carrier}" في سوق {market} الخاص بهذا الطلب.',
  },
  shipmentNeedsOrder: {
    es: "Un envío necesita su pedido.",
    en: "A shipment needs its order.",
    ar: "كل شحنة تحتاج إلى طلبها.",
  },
  shipmentCannotMove: {
    es: "Un envío no se puede mover a otro pedido.",
    en: "A shipment cannot be moved to another order.",
    ar: "لا يمكن نقل الشحنة إلى طلب آخر.",
  },
  orderAlreadyShipped: {
    es: "Este pedido ya tiene un envío: edítalo en vez de crear otro.",
    en: "This order already has a shipment: edit that one instead of creating another.",
    ar: "لهذا الطلب شحنة بالفعل: حرِّرها بدل إنشاء أخرى.",
  },
  shippedNeedsTracking: {
    es: "Un envío ya enviado no puede quedarse sin transportista ni sin número de seguimiento.",
    en: "A shipment already sent cannot be left without a carrier or a tracking number.",
    ar: "لا يمكن ترك شحنة أُرسلت بلا شركة شحن أو بلا رقم تتبّع.",
  },
} as const satisfies Record<string, LocalizedText>;

/** One refusal, in the panel's language, with its placeholders filled. */
function say(
  copy: LocalizedText,
  req: { i18n?: { language?: string } } | undefined,
  values: Record<string, string> = {},
): string {
  let text = panelText(copy, req?.i18n?.language);
  for (const [key, value] of Object.entries(values)) {
    text = text.replace(`{${key}}`, value);
  }
  return text;
}

/** Fulfilment is a backoffice act on money-adjacent rows: same policy as
 *  the rest of commerce. Never reachable through public REST/GraphQL. */
const fulfilmentAccess = { read: isAdmin, create: isAdmin, update: isAdmin };

/** Same shelf as the rest of commerce, and the same three languages. */
const FULFILMENT_GROUP = { es: "Comercio", en: "Commerce", ar: "التجارة" };

type Ref = number | string | { id: number | string } | null | undefined;

function idOf(ref: Ref): number | null {
  if (ref === null || ref === undefined) return null;
  const raw = typeof ref === "object" ? ref.id : ref;
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/* ------------------------------------------------------------------ carriers */

const validateTrackingTemplate: TextFieldSingleValidation = (value, options) => {
  const problem = checkTrackingUrlTemplate(typeof value === "string" ? value : "");
  if (problem === null) return true;
  if (problem === "empty") return panelTextFor(FULFILMENT_COPY.required, options);
  if (problem === "not_https") return panelTextFor(FULFILMENT_COPY.trackingNotHttps, options);
  return panelTextFor(FULFILMENT_COPY.trackingNoPlaceholder, options).replace(
    "{placeholder}",
    TRACKING_PLACEHOLDER,
  );
};

/**
 * Couriers, as data.
 *
 * Adding Aramex for Dubai or swapping SEUR for GLS is a row somebody
 * creates, not a release: the URL template lives here, and the code owns
 * only the placeholder convention (`@courvia/commerce-domain/fulfilment`).
 * The link is built at READ time, so fixing a template someone typed wrong
 * fixes every shipment that already used it.
 */
export const Carriers: CollectionConfig = {
  slug: "carriers",
  labels: {
    singular: { es: "Transportista", en: "Carrier", ar: "شركة شحن" },
    plural: { es: "Transportistas", en: "Carriers", ar: "شركات الشحن" },
  },
  admin: {
    useAsTitle: "name",
    group: FULFILMENT_GROUP,
    defaultColumns: ["name", "code", "active", "markets"],
    description: {
      es: "Añadir un transportista es crear una fila, no un despliegue: la URL de seguimiento es una plantilla, no código.",
      en: "Adding a carrier is creating a row, not a deploy: the tracking URL is a template, not code.",
      ar: "إضافة شركة شحن تعني إنشاء صف، لا إصدار نشرة: رابط التتبّع قالب وليس شيفرة.",
    },
  },
  access: {
    ...fulfilmentAccess,
    // Retiring a courier is unchecking `active`, not deleting the row: the
    // shipments that used it still have to be able to say who carried them.
    delete: () => false,
  },
  fields: [
    {
      name: "code",
      type: "text",
      label: { es: "Código", en: "Code", ar: "الرمز" },
      required: true,
      unique: true,
      index: true,
      admin: {
        description: {
          es: "Identificador estable en minúsculas: seur, dpd, aramex.",
          en: "A stable lowercase identifier: seur, dpd, aramex.",
          ar: "معرّف ثابت بأحرف صغيرة: seur أو dpd أو aramex.",
        },
      },
      validate: ((value, options) =>
        typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
          ? true
          : panelTextFor(FULFILMENT_COPY.carrierCodeShape, options)) as TextFieldSingleValidation,
    },
    {
      name: "name",
      type: "text",
      label: { es: "Nombre", en: "Name", ar: "الاسم" },
      required: true,
      admin: {
        description: {
          es: "Nombre visible para quien prepara el envío.",
          en: "The name seen by whoever prepares the shipment.",
          ar: "الاسم الذي يراه من يجهّز الشحنة.",
        },
      },
    },
    {
      name: "trackingUrlTemplate",
      type: "text",
      label: {
        es: "Plantilla de seguimiento",
        en: "Tracking URL template",
        ar: "قالب رابط التتبّع",
      },
      required: true,
      validate: validateTrackingTemplate,
      admin: {
        description: {
          es: `URL de seguimiento con ${TRACKING_PLACEHOLDER} donde va el número. Ej.: https://track.aramex.com/${TRACKING_PLACEHOLDER}`,
          en: `The tracking URL with ${TRACKING_PLACEHOLDER} where the number goes. E.g. https://track.aramex.com/${TRACKING_PLACEHOLDER}`,
          ar: `رابط التتبّع مع ${TRACKING_PLACEHOLDER} في موضع الرقم. مثال: https://track.aramex.com/${TRACKING_PLACEHOLDER}`,
        },
      },
    },
    {
      name: "markets",
      type: "select",
      label: { es: "Mercados", en: "Markets", ar: "الأسواق" },
      hasMany: true,
      // ISO country codes: the same three letters in every language.
      options: MARKETS.map((market) => ({ label: market.toUpperCase(), value: market })),
      admin: {
        description: {
          es: "Mercados en los que se puede usar. Vacío = todos. Un pedido de otro mercado se rechaza al guardar el envío.",
          en: "The markets it may be used in. Empty = all of them. An order from another market is refused when the shipment is saved.",
          ar: "الأسواق التي يمكن استخدامها فيها. الفراغ = جميعها. يُرفض طلب من سوق آخر عند حفظ الشحنة.",
        },
      },
    },
    {
      name: "active",
      type: "checkbox",
      label: { es: "Activo", en: "Active", ar: "فعّال" },
      defaultValue: true,
      admin: {
        description: {
          es: "Desmarcar retira el transportista sin borrar los envíos que lo usaron.",
          en: "Unticking retires the carrier without deleting the shipments that used it.",
          ar: "إلغاء التحديد يوقف شركة الشحن دون حذف الشحنات التي استخدمتها.",
        },
      },
    },
  ],
};

/* ----------------------------------------------------------------- shipments */

/** Per-effect JSON for the outbox row. The dispatcher reads these; the
 *  transaction never sends anything itself. */
type EffectData = Partial<Record<SideEffect, Record<string, unknown>>>;

interface OrderRow {
  id: number;
  status: OrderStatus;
  market: MarketId;
}

async function readOrder(req: PayloadRequest, orderId: number): Promise<OrderRow> {
  const order = await req.payload
    .findByID({ collection: "orders", id: orderId, depth: 0, overrideAccess: true, req })
    .catch(() => null);
  if (order === null) throw new APIError(say(FULFILMENT_COPY.orderMissing, req), 400);
  return order as unknown as OrderRow;
}

/**
 * Runs fulfilment triggers against the order, in the caller's transaction.
 *
 * There is no `initTransaction` here on purpose: this only ever runs from a
 * collection hook, so Payload's own create/update transaction is already
 * open and owns the commit. Throwing rolls back the shipment row along with
 * everything this wrote — which is the point.
 *
 * Same two-step as the payment applier: UPDATE the order row to take its
 * lock, then read the status that lock revealed, so two operators clicking
 * at once serialize instead of both believing the order was `paid`.
 */
async function applyFulfilment(
  req: PayloadRequest,
  orderId: number,
  triggers: OrderTrigger[],
  effectData: EffectData,
): Promise<OrderStatus> {
  const { payload } = req;
  await payload.update({ collection: "orders", id: orderId, data: {}, overrideAccess: true, req });
  const order = await readOrder(req, orderId);

  let status = order.status;
  for (const trigger of triggers) {
    const result = transition(status, trigger);
    if (!result.ok) {
      // A replay — the second save of a shipment that already shipped —
      // changes nothing and is not an error, exactly as a repeated webhook
      // is not. Everything else is a person about to do something wrong,
      // and it takes the whole save down with it.
      if (result.rejection === "already_applied") continue;
      throw new APIError(
        say(FULFILMENT_COPY.transitionRefused, req, {
          trigger: trigger.type,
          status,
          rejection: result.rejection,
        }),
        409,
      );
    }
    status = result.next;
    for (const effect of result.sideEffects) {
      if (SIDE_EFFECT_EXECUTION[effect] !== "outbox") {
        // Unreachable while the domain test holds; kept as the tripwire that
        // makes "nothing external runs inside the transaction" structural
        // rather than remembered.
        throw new APIError(say(FULFILMENT_COPY.effectNotOutbox, req, { effect }), 500);
      }
      await payload.create({
        collection: "outbox",
        overrideAccess: true,
        req,
        data: {
          effect: effect as never,
          order: orderId,
          status: "pending",
          attempts: 0,
          payload: effectData[effect] ?? {},
        },
      });
    }
  }

  if (status !== order.status) {
    await payload.update({
      collection: "orders",
      id: orderId,
      data: { status },
      overrideAccess: true,
      req,
    });
  }
  return status;
}

interface CarrierRow {
  code: string;
  name: string;
  trackingUrlTemplate: string;
  markets?: MarketId[] | null;
  active?: boolean | null;
}

async function readCarrier(
  req: PayloadRequest,
  carrierId: number,
  market: MarketId,
): Promise<CarrierRow> {
  const carrier = (await req.payload
    .findByID({ collection: "carriers", id: carrierId, depth: 0, overrideAccess: true, req })
    .catch(() => null)) as CarrierRow | null;
  if (carrier === null) throw new APIError(say(FULFILMENT_COPY.carrierMissing, req), 400);
  if (carrier.active === false) {
    throw new APIError(say(FULFILMENT_COPY.carrierRetired, req, { carrier: carrier.name }), 400);
  }
  // A domestic Spanish courier on a UK order is a parcel that never arrives.
  if (Array.isArray(carrier.markets) && carrier.markets.length > 0 && !carrier.markets.includes(market)) {
    throw new APIError(
      say(FULFILMENT_COPY.carrierWrongMarket, req, {
        carrier: carrier.name,
        market: market.toUpperCase(),
      }),
      400,
    );
  }
  return carrier;
}

interface ShipmentShape {
  order?: Ref;
  carrier?: Ref;
  trackingNumber?: unknown;
  shippedAt?: unknown;
  deliveredAt?: unknown;
  incoterm?: unknown;
  markedBy?: Ref;
}

/**
 * The whole fulfilment flow, derived from what the operator wrote down:
 *
 *   create                      → fulfilment.picking_started  (order: preparing)
 *   carrier + tracking filled   → fulfilment.shipment_created (order: shipped)
 *   deliveredAt dated           → fulfilment.delivered        (order: delivered)
 *
 * Filling everything in one save applies the steps in that order, so a
 * courier import that already knows the tracking number does not have to
 * pretend to pick first.
 */
const applyShipmentChange: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  const incoming = data as ShipmentShape;
  // On create Payload passes `originalDoc` as the document being duplicated
  // from — an empty object in the normal case, NOT undefined. Keying off the
  // operation is the only reading that survives that.
  const previous = operation === "update" ? (originalDoc as ShipmentShape | undefined) : undefined;

  const orderId = idOf(incoming.order ?? previous?.order);
  if (orderId === null) throw new APIError(say(FULFILMENT_COPY.shipmentNeedsOrder, req), 400);
  if (previous !== undefined && idOf(previous.order) !== orderId) {
    // Moving a shipment to another order would leave the first one `shipped`
    // with nothing behind it and skip the second one's guards entirely.
    throw new APIError(say(FULFILMENT_COPY.shipmentCannotMove, req), 400);
  }

  const order = await readOrder(req, orderId);

  if (operation === "create") {
    // One shipment per order, because `shipped` is ONE status. Split
    // shipments would need fulfilment tracked per line, which is a different
    // model and not what selling one robot needs. Refused here rather than
    // left to the machine: a second `picking_started` on an order already
    // being picked reads as a replay, and silently accepting a second
    // shipment document is worse than saying no.
    const existing = await req.payload.find({
      collection: "shipments",
      where: { order: { equals: orderId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    if (existing.totalDocs > 0) {
      throw new APIError(say(FULFILMENT_COPY.orderAlreadyShipped, req), 400);
    }
  }

  const carrierId = idOf(incoming.carrier === undefined ? previous?.carrier : incoming.carrier);
  const trackingNumber = text(
    incoming.trackingNumber === undefined ? previous?.trackingNumber : incoming.trackingNumber,
  );
  const wasShipped = previous?.shippedAt !== undefined && previous.shippedAt !== null;
  const wasDelivered = previous?.deliveredAt !== undefined && previous.deliveredAt !== null;
  const isShipped = carrierId !== null && trackingNumber !== "";
  const deliveredAt = incoming.deliveredAt === undefined ? previous?.deliveredAt : incoming.deliveredAt;
  const isDelivered = deliveredAt !== undefined && deliveredAt !== null;

  if (wasShipped && !isShipped) {
    throw new APIError(say(FULFILMENT_COPY.shippedNeedsTracking, req), 400);
  }

  const triggers: OrderTrigger[] = [];
  if (operation === "create") triggers.push({ type: "fulfilment.picking_started" });
  if (!wasShipped && isShipped) triggers.push({ type: "fulfilment.shipment_created" });
  if (!wasDelivered && isDelivered) triggers.push({ type: "fulfilment.delivered" });

  const effectData: EffectData = { start_picking: { market: order.market } };

  if (!wasShipped && isShipped && carrierId !== null) {
    const carrier = await readCarrier(req, carrierId, order.market);
    const shippedAt =
      incoming.shippedAt === undefined || incoming.shippedAt === null
        ? new Date().toISOString()
        : String(incoming.shippedAt);
    incoming.shippedAt = shippedAt;
    effectData.send_tracking_email = {
      carrier: carrier.code,
      carrierName: carrier.name,
      trackingNumber,
      trackingUrl: buildTrackingUrl(carrier.trackingUrlTemplate, trackingNumber),
      shippedAt,
      incoterm: MARKET_DEFINITIONS[order.market].incoterm,
    };
  }

  if (!wasDelivered && isDelivered) {
    const delivered = String(deliveredAt);
    effectData.send_post_sale_email = { deliveredAt: delivered };
    // The withdrawal window's LENGTH is law, and law is per market
    // (docs/markets.md §8): the effect carries the market and the date, and
    // whoever writes the email decides how long that means. A hard-coded 14
    // here would be Spanish law applied to Dubai.
    effectData.open_withdrawal_window = { deliveredAt: delivered, market: order.market };
  }

  if (operation === "create") {
    // ADR-08: everything leaves Spain DDP, EAU included, through a
    // courier-broker. Stored per shipment because it is what the label and
    // the customs paperwork said on the day, not what config says today.
    incoming.incoterm = MARKET_DEFINITIONS[order.market].incoterm;
  }
  const actor = idOf(req.user?.id as Ref);
  if (actor !== null && triggers.length > 0) incoming.markedBy = actor;

  if (triggers.length > 0) await applyFulfilment(req, orderId, triggers, effectData);
  return incoming;
};

export const Shipments: CollectionConfig = {
  slug: "shipments",
  labels: {
    singular: { es: "Envío", en: "Shipment", ar: "شحنة" },
    plural: { es: "Envíos", en: "Shipments", ar: "الشحنات" },
  },
  admin: {
    useAsTitle: "trackingNumber",
    group: FULFILMENT_GROUP,
    defaultColumns: ["order", "carrier", "trackingNumber", "shippedAt", "deliveredAt"],
    description: {
      es: "El envío ES la transición: crearlo manda el pedido a preparar, rellenar transportista y seguimiento lo marca enviado, y fechar la entrega lo cierra. Si la máquina de estados no lo permite, no se guarda.",
      en: "The shipment IS the transition: creating it sends the order to picking, filling in carrier and tracking marks it shipped, and dating the delivery closes it. If the state machine refuses, nothing is saved.",
      ar: "الشحنة هي الانتقال نفسه: إنشاؤها يرسل الطلب إلى التجهيز، وتعبئة شركة الشحن ورقم التتبّع يجعله مُرسَلًا، وتأريخ التسليم يغلقه. إن رفضت آلة الحالات، لا يُحفظ شيء.",
    },
  },
  access: {
    ...fulfilmentAccess,
    // A shipment is the evidence behind `shipped`. Deleting one would leave
    // an order shipped with nothing to show for it.
    delete: () => false,
  },
  hooks: { beforeChange: [applyShipmentChange] },
  fields: [
    {
      name: "order",
      type: "relationship",
      relationTo: "orders",
      label: { es: "Pedido", en: "Order", ar: "الطلب" },
      required: true,
      index: true,
      admin: {
        description: {
          es: "Un envío por pedido: la máquina rechaza el segundo, porque `shipped` es un único estado.",
          en: "One shipment per order: the machine refuses a second one, because `shipped` is a single status.",
          ar: "شحنة واحدة لكل طلب: ترفض الآلة الثانية، لأن `shipped` حالة واحدة لا تتجزأ.",
        },
      },
    },
    {
      name: "carrier",
      type: "relationship",
      relationTo: "carriers",
      label: { es: "Transportista", en: "Carrier", ar: "شركة الشحن" },
      admin: {
        description: {
          es: "Al rellenarlo junto con el número de seguimiento, el pedido pasa a enviado.",
          en: "Filling it in together with the tracking number moves the order to shipped.",
          ar: "تعبئتها مع رقم التتبّع تنقل الطلب إلى حالة «أُرسل».",
        },
      },
    },
    {
      name: "trackingNumber",
      type: "text",
      label: { es: "Número de seguimiento", en: "Tracking number", ar: "رقم التتبّع" },
      index: true,
      admin: {
        description: {
          es: "Número que da el transportista. Va tal cual en el email al cliente.",
          en: "The number the carrier gives. It goes verbatim into the customer's email.",
          ar: "الرقم الذي تمنحه شركة الشحن. يُدرج كما هو في بريد العميل.",
        },
      },
    },
    {
      // Derived, never stored: corregir la plantilla de un transportista
      // arregla también los envíos que ya la usaron.
      name: "trackingUrl",
      type: "text",
      label: { es: "Enlace de seguimiento", en: "Tracking link", ar: "رابط التتبّع" },
      virtual: true,
      admin: {
        readOnly: true,
        description: {
          es: "Se construye con la plantilla del transportista; no se escribe a mano.",
          en: "Built from the carrier's template; never typed by hand.",
          ar: "يُبنى من قالب شركة الشحن؛ ولا يُكتب يدويًا.",
        },
      },
      hooks: {
        afterRead: [
          async ({ data, req }) => {
            const shipment = data as ShipmentShape | undefined;
            const carrierId = idOf(shipment?.carrier);
            const number = text(shipment?.trackingNumber);
            if (carrierId === null || number === "") return null;
            const carrier = (await req.payload
              .findByID({
                collection: "carriers",
                id: carrierId,
                depth: 0,
                overrideAccess: true,
                req,
              })
              .catch(() => null)) as CarrierRow | null;
            if (carrier === null) return null;
            return buildTrackingUrl(carrier.trackingUrlTemplate, number);
          },
        ],
      },
    },
    {
      name: "shippedAt",
      type: "date",
      label: { es: "Fecha de envío", en: "Shipped on", ar: "تاريخ الإرسال" },
      admin: {
        readOnly: true,
        description: {
          es: "La pone la transición al marcar enviado.",
          en: "Set by the transition when the order is marked shipped.",
          ar: "يضعه الانتقال عند تعليم الطلب كمُرسَل.",
        },
      },
    },
    {
      name: "deliveredAt",
      type: "date",
      label: { es: "Fecha de entrega", en: "Delivered on", ar: "تاريخ التسليم" },
      admin: {
        description: {
          es: "Fecharla cierra el pedido como entregado y abre el desistimiento.",
          en: "Dating it closes the order as delivered and opens the withdrawal window.",
          ar: "تأريخه يغلق الطلب كمُسلَّم ويفتح مهلة العدول.",
        },
      },
    },
    {
      name: "incoterm",
      type: "select",
      label: { es: "Incoterm", en: "Incoterm", ar: "شرط التسليم" },
      // DDP and DDU are Incoterms: the same three letters on every customs
      // form in every language.
      options: ["DDP", "DDU"],
      admin: {
        readOnly: true,
        description: {
          es: "Del mercado del pedido (ADR-08: EAU se sirve DDP vía courier-broker).",
          en: "Taken from the order's market (ADR-08: the UAE is served DDP through a courier-broker).",
          ar: "مأخوذ من سوق الطلب (ADR-08: تُخدَم الإمارات بشرط DDP عبر وسيط شحن).",
        },
      },
    },
    {
      name: "markedBy",
      type: "relationship",
      relationTo: "users",
      label: { es: "Marcado por", en: "Marked by", ar: "سجّله" },
      admin: {
        readOnly: true,
        description: {
          es: "Quién movió el envío por última vez. Un envío lo marca una persona, no un webhook.",
          en: "Who last moved the shipment. A shipment is marked by a person, not by a webhook.",
          ar: "من حرّك الشحنة آخر مرة. تُسجَّل الشحنة بيد شخص، لا بويب هوك.",
        },
      },
    },
  ],
};

/* -------------------------------------------------------------- orders, again */

/**
 * The fulfilment view of an order, added without editing the commerce
 * collections themselves.
 *
 * Two things: `status` becomes read-only in the admin — it was only ever a
 * description asking nicely not to touch it — and the order shows its
 * shipment, so nobody has to go looking for it in another list.
 *
 * `readOnly` is HALF the guarantee and always was: it greys the input and
 * says nothing to REST or GraphQL. The other half is the field-level
 * `access.update` denial declared in `commerce.ts`, which those APIs do
 * respect and which `overrideAccess: true` — every domain write — bypasses.
 * The assertion below now demands both, so removing either one fails at boot
 * instead of quietly reopening the back door.
 */
export function withFulfilment(orders: CollectionConfig): CollectionConfig {
  const fields: Field[] = orders.fields.map((field) => {
    // Narrowed to the select it actually is: spreading the Field union
    // widens `admin` to every field type's shape at once and stops
    // compiling. If `status` ever stops being a select, this stops matching
    // and the readOnly guarantee disappears — hence the assertion below.
    if (field.type !== "select" || field.name !== "status") return field;
    return {
      ...field,
      admin: {
        ...field.admin,
        readOnly: true,
        description: {
          es: "Lo mueve la máquina de estados: pagos por webhook, envíos desde la colección Envíos. No se edita.",
          en: "Moved by the state machine: payments by webhook, shipping from the Shipments collection. Not editable.",
          ar: "تحرّكه آلة الحالات: المدفوعات عبر الويب هوك، والشحن من مجموعة الشحنات. غير قابل للتحرير.",
        },
      },
    };
  });
  const status = fields.find((field) => "name" in field && field.name === "status");
  if (status === undefined || status.type !== "select" || status.admin?.readOnly !== true) {
    throw new Error("withFulfilment: el campo `status` de orders ya no queda en solo lectura.");
  }
  // The panel is not the API. Without this the field is writable by anything
  // holding an admin session, whatever the greyed-out input suggests.
  if (status.access?.update === undefined || status.access.create === undefined) {
    throw new Error(
      "withFulfilment: el campo `status` de orders no niega escritura a nivel de campo (access.create/update).",
    );
  }
  fields.push({
    name: "shipment",
    type: "join",
    collection: "shipments",
    on: "order",
    label: { es: "Envío", en: "Shipment", ar: "الشحنة" },
    admin: {
      description: {
        es: "El envío de este pedido, si ya se abrió.",
        en: "This order's shipment, once one has been opened.",
        ar: "شحنة هذا الطلب، إن كانت قد فُتحت.",
      },
    },
  });
  return { ...orders, fields };
}
