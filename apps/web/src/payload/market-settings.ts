import { MARKETS, PAYMENT_METHODS, PAYMENT_PROVIDERS } from "@courvia/platform";
import type { GlobalConfig } from "payload";

import { anyone, hiddenUnlessAdmin, isAdmin } from "./access";

/**
 * Per-market runtime configuration (ADR-014): which payment providers the
 * checkout offers and in which order — the customer chooses among them.
 * Currency and incoterm stay in code (@courvia/platform): they are
 * architecture, not something to flip from a panel. Tax and shipping fields
 * arrive with their tasks (S2/S4).
 */
export const MarketSettings: GlobalConfig = {
  slug: "market-settings",
  label: { es: "Mercados", en: "Markets", ar: "الأسواق" },
  /**
   * -----------------------------------------------------------------------
   * `dbName`, y por qué sigue aquí cuando lo que lo justificaba ya no está
   * -----------------------------------------------------------------------
   *
   * Este global se llamaba `market_settings` en la base. La Fase 3 le puso
   * `versions` y el nombre largo dejó de caber: Payload nombra la tabla de
   * versiones `_<name>_v` y prefija cada tabla anidada con `version_`, así
   * que el enum del select `methods` —dentro de `paymentProviders`, dentro
   * de `markets`— llegaba a 65 caracteres y `validateIdentifierLength`
   * impedía arrancar. `markets` (7 en vez de 15) bajaba todo el subárbol y
   * dejaba el índice más largo en 63 exactos.
   *
   * Las versiones se retiraron después, por el motivo que explica el bloque
   * de abajo. El nombre corto se queda: revertirlo sería un segundo
   * renombrado de cuatro tablas y tres enums de configuración de pagos, con
   * el riesgo que eso tiene, a cambio de nada. Lo que cambia es su estatus:
   * era obligatorio y ahora es solo un nombre mejor. `admin-schema.test.ts`
   * sigue midiendo cada identificador que construye el adaptador, y ahí
   * sigue teniendo valor: la lista de renombrados de
   * `20260821_234246_fase3_templates_trash_versions` es lo que se deshace si
   * alguien quita esta línea.
   */
  dbName: "markets",
  /*
   * -----------------------------------------------------------------------
   * SIN `versions`, y no por preferencia: Payload 3.88 no puede escribirlas
   * para la forma que tiene este global
   * -----------------------------------------------------------------------
   *
   * La Fase 3 le puso `versions: { drafts: false, max: 30 }` y CI se puso en
   * rojo al sembrar. El error, literal:
   *
   *   invalid input syntax for type integer: "6a88e504bd72b60cf48e763c"
   *   insert into "_markets_v_version_markets_payment_providers_methods"
   *
   * La causa, leída en `@payloadcms/drizzle/dist/upsertRow/index.js:243-250`:
   * al escribir una fila, las tablas de un `select` con `hasMany` reciben
   * `parent` SOLO si viene sin definir —`if (typeof row.parent ===
   * 'undefined')`— y `transformForWrite` ya se lo ha puesto: el id de la
   * fila de array tal y como viene del documento. En las tablas vivas ese id
   * es el bueno, porque la fila de array se guarda con el id del documento.
   * En una tabla de VERSIONES no: ahí los ids de array son `serial`, la fila
   * nace con uno nuevo, y el `parent` del select se queda apuntando al
   * viejo. Un varchar de 24 hex contra una columna integer.
   *
   * Reproducido en local guardando el global con `methods` no vacío, que es
   * justo lo que hace `seed:markets` y lo que ninguna prueba anterior hacía
   * —el global se había guardado siempre con `methods` vacío, y por eso el
   * fallo esperó a CI.
   *
   * Las dos salidas que quedaban:
   *
   *  1. Convertir `methods` en un array de selects de un valor. Los arrays
   *     sí enhebran bien sus ids en las versiones (`_navigation_v` lo
   *     demuestra: array dentro de array dentro de array, y escribe). Pero
   *     cambia el modelo de datos de la configuración de pagos y sustituye
   *     un multiselect —el control correcto para «qué métodos»— por «añadir
   *     fila, elegir, añadir fila».
   *  2. Quitar las versiones de ESTE global.
   *
   * Se elige la segunda. Este global es `hiddenUnlessAdmin`: ningún editor
   * lo ve, así que el «deshacer» que se pierde no es el que pedía el
   * encargo. `navigation` y `theme-settings` —los dos que un editor sí
   * toca— conservan el suyo, y sus formas no tienen un select `hasMany`
   * dentro de un array. Que no lo tengan deja de ser suerte:
   * `admin-schema.test.ts` lo comprueba para todos.
   *
   * Qué lo cambia: una versión de Payload donde `upsertRow` reasigne el
   * `parent` de un select al id realmente insertado. Entonces esto vuelve a
   * ser una línea y una migración.
   */
  admin: {
    // Read by anyone (the checkout needs it) but only an admin may save it,
    // so an editor was being offered a form that refuses to save. Hidden
    // rather than read-only: a control you cannot use is not information.
    hidden: hiddenUnlessAdmin,
    description: {
      es: "Qué pasarelas ofrece cada mercado y en qué orden. La moneda y el incoterm NO están aquí: son código (@courvia/platform).",
      en: "Which gateways each market offers, and in what order. Currency and incoterm are NOT here: they are code (@courvia/platform).",
      ar: "ما البوابات التي يوفّرها كل سوق وبأي ترتيب. العملة وشرط التسليم ليسا هنا: هما في الشيفرة (@courvia/platform).",
    },
  },
  access: {
    read: anyone,
    update: isAdmin,
  },
  fields: [
    {
      name: "markets",
      type: "array",
      label: { es: "Mercados", en: "Markets", ar: "الأسواق" },
      /**
       * `labels` is as far as this can go without a custom component. Payload
       * builds an array row's header from the singular label plus the index,
       * and the only way to make it read "ES · stripe, tabby" is
       * `admin.components.RowLabel`, which takes a component PATH resolved
       * through `app/(payload)/admin/importMap.js`. That file is generated,
       * lives outside this module's surface, and a path missing from it
       * renders nothing at all — so the honest half-step is a row that at
       * least says "Mercado 01" in the language of the panel. Doing it
       * properly is a component plus a regenerated import map, together.
       */
      labels: {
        singular: { es: "Mercado", en: "Market", ar: "سوق" },
        plural: { es: "Mercados", en: "Markets", ar: "الأسواق" },
      },
      admin: {
        description: {
          es: "Un elemento por mercado activo. ES · UK · AE.",
          en: "One entry per active market. ES · UK · AE.",
          ar: "عنصر واحد لكل سوق فعّال. ES · UK · AE.",
        },
      },
      fields: [
        {
          name: "market",
          type: "select",
          label: { es: "Mercado", en: "Market", ar: "السوق" },
          required: true,
          // ISO country codes: the same three letters in every language.
          options: MARKETS.map((market) => ({ label: market.toUpperCase(), value: market })),
        },
        {
          name: "enabled",
          type: "checkbox",
          label: { es: "Mercado activo", en: "Market active", ar: "السوق فعّال" },
          defaultValue: false,
          admin: {
            description: {
              es: "Desmarcado = el checkout no ofrece este mercado.",
              en: "Unticked = the checkout does not offer this market.",
              ar: "غير محدّد = لا يعرض إتمام الشراء هذا السوق.",
            },
          },
        },
        {
          name: "paymentProviders",
          type: "array",
          label: { es: "Pasarelas", en: "Gateways", ar: "بوابات الدفع" },
          labels: {
            singular: { es: "Pasarela", en: "Gateway", ar: "بوابة" },
            plural: { es: "Pasarelas", en: "Gateways", ar: "بوابات الدفع" },
          },
          admin: {
            description: {
              es: "Orden de presentación en el checkout; el cliente elige.",
              en: "Presentation order in the checkout; the customer chooses.",
              ar: "ترتيب العرض في صفحة الدفع؛ العميل هو من يختار.",
            },
          },
          fields: [
            {
              name: "provider",
              type: "select",
              label: { es: "Proveedor", en: "Provider", ar: "المزوّد" },
              required: true,
              // Provider ids are proper nouns (stripe, tabby, tamara): the
              // same word in all three panels, and the contract the port
              // reads.
              options: PAYMENT_PROVIDERS.map((p) => ({ label: p, value: p })),
            },
            {
              name: "enabled",
              type: "checkbox",
              label: { es: "Pasarela activa", en: "Gateway active", ar: "البوابة فعّالة" },
              defaultValue: false,
            },
            {
              name: "methods",
              type: "select",
              label: { es: "Métodos", en: "Methods", ar: "الوسائل" },
              hasMany: true,
              // Method ids are the gateway's own vocabulary (card, bizum,
              // klarna): translating the label would invent a second name
              // for a value the provider prints back at us.
              options: PAYMENT_METHODS.map((m) => ({ label: m, value: m })),
              admin: {
                description: {
                  es: "Métodos que este proveedor ofrece en este mercado (Bizum y Klarna van DENTRO de Stripe). Vacío = los que la pasarela active por defecto.",
                  en: "Methods this provider offers in this market (Bizum and Klarna live INSIDE Stripe). Empty = whatever the gateway enables by default.",
                  ar: "الوسائل التي يوفّرها هذا المزوّد في هذا السوق (Bizum وKlarna داخل Stripe). الفراغ = ما تفعّله البوابة افتراضيًا.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};
