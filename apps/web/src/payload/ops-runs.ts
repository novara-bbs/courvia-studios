/**
 * Que el cron dejó de correr tiene que poder saberse.
 *
 * ---------------------------------------------------------------------------
 * LO QUE SE PARA, Y POR QUÉ ESTO NO ES UNA MÉTRICA BONITA
 * ---------------------------------------------------------------------------
 *
 * `GET /next/cron` es lo único que drena el outbox, caduca los checkouts
 * abandonados y borra los carritos vencidos. Si deja de dispararse no hay
 * error, no hay 500, no hay nada: `docs/deployment.md` ya lo avisa — «un cron
 * que apunta a una URL que no responde no da error: simplemente no despacha
 * nada, para siempre».
 *
 * Y lo que se para está contado:
 *
 *  - la confirmación de la waitlist, que es la ÚNICA conversión del sitio;
 *  - los correos de seguimiento y posventa: quien compró no se entera de que
 *    su pedido salió ni de que llegó;
 *  - **la ventana de desistimiento**. Art. 102 TRLGDCU: 14 días, y doce meses
 *    si no se informa. No escribir esa fecha multiplica el plazo por 26;
 *  - **`stop_picking`**, la contraorden que impide que se envíe un robot cuyo
 *    reembolso ya va de camino;
 *  - las dos alertas de dinero contradiciéndose — y el webhook responde 200 a
 *    propósito CONFIANDO en ese canal;
 *  - la liberación de las reservas de stock de los checkouts muertos.
 *
 * Hasta hoy el único rastro de que un tick ocurrió era `console.*` y el log de
 * invocación de Vercel. La heurística documentada para detectar la avería era,
 * literalmente, mirar un pedido y calcular a ojo si había pasado un tick
 * (`docs/operations.md`).
 *
 * ---------------------------------------------------------------------------
 * COLECCIÓN Y NO GLOBAL, A PROPÓSITO
 * ---------------------------------------------------------------------------
 *
 * Un global guarda el ÚLTIMO valor. Con eso se sabe «el último tick fue hace
 * 40 h», que es la pregunta que contesta el vigilante — pero no se puede saber
 * que faltaron tres días seguidos, ni si el fallo es nuevo o lleva una semana.
 * Una fila por tick sí, y a cadencia diaria son ~365 filas al año.
 *
 * Se poda igualmente: la cadencia es diaria porque el plan Hobby no admite
 * más (`docs/deployment.md`), y el día que pase a un tick cada cinco minutos
 * serían ~105.000 filas al año. Podar por edad ahora cuesta una sentencia y
 * evita convertir esto en el problema que vino a vigilar.
 *
 * (La cadencia de cinco minutos NO se escribe aquí en notación cron: ese
 *  asterisco y esa barra cierran el comentario de bloque. Costó un
 *  `TS1160: Unterminated template literal` a tres ficheros de distancia, que
 *  es la misma forma de tropiezo que las comillas invertidas dentro de un
 *  comentario SQL en la migración del desistimiento.)
 *
 * ---------------------------------------------------------------------------
 * SOLO SERVIDOR
 * ---------------------------------------------------------------------------
 *
 * Mismo `access` que `outbox` y `orders`: esto es telemetría de operación, no
 * contenido. El endpoint público que lo consulta (`/next/health`) devuelve un
 * booleano y una edad en horas, nunca la fila.
 */
import type { CollectionConfig } from "payload";

import { isAdmin } from "./access";

/** Cuántos días de historia se guardan. Ver la cabecera. */
export const OPS_RUN_RETENTION_DAYS = 90;

/** El único trabajo que escribe aquí hoy. Un `select` y no texto libre: si
 *  algún día hay un segundo cron, añadirlo es una decisión que se ve. */
export const OPS_JOBS = ["cron"] as const;
export type OpsJob = (typeof OPS_JOBS)[number];

export const OpsRuns: CollectionConfig = {
  slug: "ops-runs",
  labels: {
    singular: { es: "Ejecución de mantenimiento", en: "Maintenance run", ar: "تشغيل صيانة" },
    plural: { es: "Mantenimiento", en: "Maintenance", ar: "الصيانة" },
  },
  admin: {
    useAsTitle: "finishedAt",
    group: { es: "Sistema", en: "System", ar: "النظام" },
    defaultColumns: ["job", "finishedAt", "status"],
    description: {
      es: "SOLO SERVIDOR. Una fila por tick del cron. Existe para que «el cron dejó de correr» sea detectable: sin ella, lo único que se para son los correos, la ventana legal de desistimiento y la liberación de stock, y no hay error en ninguna parte.",
      en: "SERVER ONLY. One row per cron tick. It exists so that «the cron stopped» is detectable: without it the only thing that stops is the emails, the statutory withdrawal window and the stock release, and nothing errors anywhere.",
      ar: "من الخادم فقط. صف واحد لكل تشغيل. وجوده يجعل توقّف المهمة المجدولة قابلًا للاكتشاف: بدونه تتوقّف الرسائل ومهلة الانسحاب القانونية وتحرير المخزون، دون ظهور أي خطأ.",
    },
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    {
      name: "job",
      type: "select",
      required: true,
      index: true,
      options: [...OPS_JOBS],
    },
    { name: "startedAt", type: "date", required: true },
    /* El que importa para la vigilancia, y por eso lleva índice: la consulta
     * del endpoint de salud es «el más reciente de este trabajo». */
    { name: "finishedAt", type: "date", required: true, index: true },
    {
      name: "status",
      type: "number",
      required: true,
      admin: {
        description: {
          es: "El mismo código que devolvió el tick: 200 si los tres trabajos fueron bien, 207 si alguno falló.",
          en: "The status the tick returned: 200 when all three jobs succeeded, 207 when one failed.",
          ar: "الرمز الذي أعاده التشغيل: 200 عند نجاح المهام الثلاث، و207 عند فشل إحداها.",
        },
      },
    },
    {
      name: "summary",
      type: "json",
      admin: {
        description: {
          es: "Lo que el tick respondió: outbox, checkouts y carritos, con el error de cada uno si lo hubo.",
          en: "What the tick answered: outbox, checkouts and carts, each with its error if it had one.",
          ar: "ما أعاده التشغيل: صندوق الصادر، وعمليات الدفع، والسلال، مع خطأ كلٍّ منها إن وُجد.",
        },
      },
    },
  ],
};
