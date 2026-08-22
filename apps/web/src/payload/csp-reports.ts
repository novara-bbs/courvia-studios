/**
 * Los informes de la CSP, agregados. Que el rodaje pueda terminar.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTO EXISTE: UNA POLÍTICA QUE NUNCA DEJA DE SER REPORT-ONLY
 * ---------------------------------------------------------------------------
 *
 * `next.config.ts` sirve la política de recursos **en modo informe** desde el
 * primer día, y su comentario dice por qué: aplicarla a ciegas rompería
 * `/admin` en el primer despliegue —el panel es un paquete de terceros que no
 * controlamos— y el payload RSC de Next llega como `<script>` en línea. La
 * frase que cierra ese comentario es la que importa: «the console is the data
 * we need before anything here becomes enforcing».
 *
 * Esa consola **es la del visitante**, no la nuestra. Sin un colector, «los
 * datos que necesitamos» son los de una pestaña que alguien tenga abierta en
 * ese momento, así que la condición para pasar a enforcing no se cumple nunca
 * y la política se queda en informe para siempre: una cabecera que da la
 * sensación de proteger y no bloquea nada.
 *
 * ---------------------------------------------------------------------------
 * AGREGADO, Y ESA ES TODA LA DECISIÓN DE DISEÑO
 * ---------------------------------------------------------------------------
 *
 * Un informe por fila es una tabla que un navegador con una extensión
 * ruidosa llena solo, sin ninguna mala intención: una extensión que inyecta
 * un script en cada página genera una violación por carga. Y el endpoint es
 * público por obligación —quien informa es el navegador, no una sesión—, así
 * que la cardinalidad la elige quien escribe.
 *
 * Por eso la fila no es un informe: es **(día, directiva, origen bloqueado)**
 * con un contador. UNIQUE sobre esa terna y `count = count + 1` en una sola
 * sentencia. Lo que se pierde es la marca de tiempo exacta de cada violación,
 * que no sirve para nada aquí; lo que se gana es que mil informes iguales
 * sean una fila.
 *
 * Y las tres columnas de la clave están **acotadas por construcción**:
 *
 *  - `day` avanza una vez al día;
 *  - `directive` se valida contra `CSP_DIRECTIVES` y lo que no esté ahí se
 *    tira. No es cosmética: sin esa lista, la directiva es texto libre que
 *    manda quien informa y la tabla crece por donde él quiera;
 *  - `blockedUri` se reduce a su ORIGEN (nunca la ruta: una ruta lleva
 *    tokens, ids y a veces PII, y multiplica la cardinalidad por cada URL de
 *    la web), y aun así lo elige quien escribe — de ahí `CSP_MAX_ROWS_PER_DAY`
 *    y su cubo de desbordamiento, en `src/server/csp-reports.ts`.
 *
 * ---------------------------------------------------------------------------
 * SOLO SERVIDOR, Y ESCRITA POR SQL
 * ---------------------------------------------------------------------------
 *
 * Mismo `access` que `outbox` y `ops-runs`: esto es telemetría, no contenido.
 * El colector no pasa por la Local API —escribe con una sola sentencia contra
 * el pool—, así que negar `create` aquí no le estorba y sí cierra
 * `POST /api/csp-reports`.
 */
import type { CollectionConfig } from "payload";

import { isAdmin } from "./access";

/** Cuántos días de informes se guardan. Ver `pruneCspReports`. */
export const CSP_REPORT_RETENTION_DAYS = 30;

/**
 * Las directivas que pueden aparecer en un informe nuestro, y nada más.
 *
 * El navegador manda `effective-directive`, que NO siempre coincide con la
 * que escribimos: una política con `script-src` produce violaciones de
 * `script-src-elem` y `script-src-attr`. Por eso la lista es la familia
 * completa y no una copia de `contentSecurityPolicy()`.
 *
 * Lo que no esté aquí se descarta en silencio (204 igual). Es el único punto
 * del colector donde se rechaza contenido, y existe para que la primera
 * columna de la clave no la elija un desconocido.
 */
export const CSP_DIRECTIVES = [
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "img-src",
  "font-src",
  "media-src",
  "frame-src",
  "child-src",
  "connect-src",
  "worker-src",
  "manifest-src",
  "object-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
  "prefetch-src",
] as const;
export type CspDirective = (typeof CSP_DIRECTIVES)[number];

export const CspReports: CollectionConfig = {
  slug: "csp-reports",
  labels: {
    singular: { es: "Informe de CSP", en: "CSP report", ar: "تقرير CSP" },
    plural: { es: "Informes de CSP", en: "CSP reports", ar: "تقارير CSP" },
  },
  admin: {
    useAsTitle: "blockedUri",
    group: { es: "Sistema", en: "System", ar: "النظام" },
    defaultColumns: ["day", "directive", "blockedUri", "count"],
    description: {
      es: "SOLO SERVIDOR. Una fila por día, directiva y origen bloqueado, con un contador. La política de seguridad se sirve en modo informe hasta que estos datos digan qué se rompería al aplicarla; sin ellos el rodaje no termina nunca.",
      en: "SERVER ONLY. One row per day, directive and blocked origin, with a counter. The resource policy ships report-only until this data says what enforcing would break; without it the burn-in never ends.",
      ar: "من الخادم فقط. صف واحد لكل يوم وتوجيه ومصدر محظور، مع عدّاد. تُنشر سياسة الأمان في وضع التقرير حتى تُبيّن هذه البيانات ما الذي سيتعطّل عند تفعيلها.",
    },
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  /*
   * LA CLAVE. Sin `unique` esto no es una agregación: son informes con un
   * campo `count` que siempre vale 1, y la tabla vuelve a crecer por informe.
   */
  indexes: [{ fields: ["day", "directive", "blockedUri"], unique: true }],
  fields: [
    {
      name: "day",
      type: "text",
      required: true,
      index: true,
      admin: {
        description: {
          es: "El día en UTC (AAAA-MM-DD). Texto y no fecha a propósito: la clave única agrupa por día, y una marca de tiempo agruparía por milisegundo.",
          en: "The UTC day (YYYY-MM-DD). Text and not a date on purpose: the unique key groups by day, and a timestamp would group by millisecond.",
          ar: "اليوم بتوقيت UTC (سنة-شهر-يوم). نص وليس تاريخًا عمدًا: المفتاح الفريد يجمع حسب اليوم.",
        },
      },
    },
    {
      name: "directive",
      type: "select",
      required: true,
      index: true,
      options: [...CSP_DIRECTIVES],
    },
    {
      name: "blockedUri",
      type: "text",
      required: true,
      admin: {
        description: {
          es: "El ORIGEN bloqueado, o la palabra clave que mandó el navegador (inline, eval, data…). Nunca la ruta: una ruta lleva tokens e ids, y multiplicaría la cardinalidad por cada URL del sitio.",
          en: "The blocked ORIGIN, or the keyword the browser sent (inline, eval, data…). Never the path: paths carry tokens and ids, and would multiply cardinality by every URL on the site.",
          ar: "المصدر المحظور أو الكلمة المفتاحية التي أرسلها المتصفّح. لا يُسجَّل المسار أبدًا.",
        },
      },
    },
    { name: "count", type: "number", required: true, defaultValue: 1, index: true },
    { name: "firstSeenAt", type: "date", required: true },
    { name: "lastSeenAt", type: "date", required: true },
    {
      name: "samplePath",
      type: "text",
      admin: {
        description: {
          es: "Una de las páginas donde ocurrió, sin query ni fragmento. Es una MUESTRA (la última), no la lista: sirve para saber por dónde empezar a mirar.",
          en: "One of the pages where it happened, without query or fragment. It is a SAMPLE (the latest), not the list: it says where to start looking.",
          ar: "إحدى الصفحات التي وقع فيها الانتهاك، بدون معاملات الاستعلام. عيّنة وليست قائمة.",
        },
      },
    },
  ],
};
