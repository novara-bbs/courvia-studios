/**
 * La escotilla: desbloquear una cuenta del panel sin el panel.
 *
 *   ADMIN_EMAIL=tu@correo pnpm --filter @courvia/web unlock:admin
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ HACÍA FALTA, Y POR QUÉ NO EXISTÍA
 * ---------------------------------------------------------------------------
 *
 * Payload bloquea una cuenta a los **cinco intentos fallidos**, durante **diez
 * minutos** (`maxLoginAttempts` y `lockTime`, sus valores por defecto, que este
 * repo no toca). Eso es correcto y hay que conservarlo. Pero deja un caso sin
 * salida:
 *
 *  - `POST /api/users/unlock` **exige estar dentro** — su `access` hereda el
 *    default de Payload, que pide `req.user`. Si estás bloqueado, no lo estás.
 *  - `pnpm seed:admin` **se niega a correr** si ya existe algún usuario, para
 *    no ser una puerta trasera.
 *
 * O sea que hasta hoy la única salida era SQL a mano sobre `lock_until` y
 * `login_attempts`, y no estaba documentada en ninguna parte. Se descubrió al
 * escribir el límite de `forgot-password`: antes de tocar la autenticación
 * conviene saber cómo se sale si algo va mal.
 *
 * ---------------------------------------------------------------------------
 * ESTE SÍ CORRE CONTRA PRODUCCIÓN, Y ES LA DIFERENCIA CON LAS SEMILLAS
 * ---------------------------------------------------------------------------
 *
 * `seed:e2e-operator` se niega a correr contra cualquier cosa que no sea la
 * base desechable, porque crea un usuario con contraseña fija. Este NO lleva
 * ese guardarraíl a propósito: su razón de existir es justamente el momento en
 * que nadie puede entrar al panel de producción.
 *
 * Y no abre ninguna puerta nueva: exige `DATABASE_URL`, y quien tiene esas
 * credenciales ya puede hacer cualquier cosa con la base. No crea cuentas, no
 * cambia contraseñas y no concede permisos: solo pone a cero el contador de
 * intentos de una cuenta que YA existe.
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const email = process.env.ADMIN_EMAIL?.trim();
if (email === undefined || email === "") {
  console.error("ADMIN_EMAIL es obligatorio: ADMIN_EMAIL=tu@correo pnpm unlock:admin");
  process.exit(1);
}

const { getPayload } = await import("payload");
const { default: config } = await import("../../payload.config");

const payload = await getPayload({ config });

/*
 * Se comprueba primero que la cuenta existe, para que un correo mal escrito
 * diga «no existe» en vez de «hecho» sobre nada. `unlock` de la Local API
 * devuelve un booleano y no distingue los dos casos.
 */
const found = (await payload.find({
  collection: "users",
  where: { email: { equals: email } },
  limit: 1,
  depth: 0,
  overrideAccess: true,
})) as unknown as { docs: { id: number }[] };

if (found.docs.length === 0) {
  console.error(`No hay ninguna cuenta con el correo ${email}.`);
  process.exit(1);
}

/*
 * `overrideAccess` es lo que permite hacer esto sin sesión, que es el punto
 * entero del script: la Local API existe para no necesitar una.
 *
 * El `as` es de Payload, no nuestro: el tipo de `data` para `unlock` reutiliza
 * la forma del login y exige `password`, pero la operación **solo lee el
 * correo** — `auth/operations/unlock.js:17` toma `args.data?.email` y no
 * menciona la contraseña ni una vez. Pasar una contraseña de mentira para
 * contentar al tipo sería peor: parecería que hace falta.
 */
const unlocked = await payload.unlock({
  collection: "users",
  data: { email } as { email: string; password: string },
  overrideAccess: true,
});

if (!unlocked) {
  console.error(`No se pudo desbloquear ${email}.`);
  process.exit(1);
}

console.log(`Desbloqueada: ${email}. Los intentos vuelven a cero y ya puedes entrar.`);
process.exit(0);
