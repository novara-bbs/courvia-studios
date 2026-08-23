# Operación: testing, CI, entorno y setup

> Estrategia de pruebas, variables de entorno y seguridad, y el arranque de herramientas (MCP, móvil).

---

## Stack local

### Postgres de desarrollo

`scripts/dev-db.sh` (atajo: `pnpm dev:db`) levanta el Postgres local en `127.0.0.1:5433` con datadir `/var/lib/pg-courvia` (configurable vía `COURVIA_PG_DATA`). Es idempotente: si el puerto ya responde, no hace nada. Si el datadir no existe, falla con un mensaje explícito — hay que inicializarlo antes (initdb como usuario `postgres` y `createdb courvia`).

En Claude Code web, el hook **SessionStart** (`.claude/hooks/session-start.sh`, registrado en `.claude/settings.json`) deja el stack listo al abrir sesión: instala dependencias si falta `node_modules` (`pnpm install --frozen-lockfile`) y ejecuta `scripts/dev-db.sh` si existe el datadir. Solo actúa cuando `CLAUDE_CODE_REMOTE=true`; en un entorno local no toca nada.

### Variables de entorno locales

`apps/web/.env.example` es la plantilla: copiarla a `apps/web/.env.local` (ignorado por Git). Obligatorias en local: `DATABASE_URL` (apunta al Postgres del 5433), `PAYLOAD_SECRET` y `PAYMENT_FAKE_SECRET` (proveedor de pago fake de desarrollo, bloqueado en producción por el gate fail-closed). El resto — `NEXT_PUBLIC_SITE_URL`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, el correo (`RESEND_API_KEY` + `EMAIL_FROM`), Plausible y las claves del test de exposición — son opcionales y van comentadas en la plantilla. Sin las dos del correo, en local los mensajes van a consola; en un despliegue su ausencia hace que cada envío falle en voz alta en vez de tragarse el mensaje.

### Migraciones: `pnpm migrate:new <nombre>`

`scripts/migrate-new.mjs` crea la migración (`payload migrate:create`) **y** sanea en el mismo paso lo que el generador olvida: separa el import runtime (`sql`) del import de tipos (`import type { MigrateDownArgs, MigrateUpArgs }` — el generador los emite como import runtime y eso revienta en ESM) y reduce las firmas de `up`/`down` a `{ db }` (los argumentos sin usar fallan el lint). Si la plantilla del generador cambia, el script falla en voz alta en lugar de dejar pasar un archivo roto.

Después de crearla:

```bash
pnpm --filter @courvia/web migrate          # aplicar en local
pnpm --filter @courvia/web generate:types   # regenerar payload-types
```

Commitear la migración **y también** `src/migrations/index.ts` (el generador lo regenera). A producción, solo por CI con aprobación explícita (`.claude/rules/database.md`).

### Seeds, en orden

1. `ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter @courvia/web seed:admin` — primer usuario admin por Local API (`ADMIN_NAME` opcional). Idempotente: se niega a correr si ya existe algún usuario.
2. `pnpm seed` — ejecuta en orden `seed:catalog` → `seed:media` → `seed:markets` →
   `seed:templates` → `seed:content`.

`seed:templates` merece una línea aparte porque no siembra contenido: siembra la
**plantilla de ficha de producto** con exactamente los bloques de
`DEFAULT_PRODUCT_TEMPLATE` (`src/catalog/product-template.ts`). Correrla no
cambia lo que se sirve —el array es la recaída y los bloques son los mismos— y
lo que cambia es el panel: sin ella, Plantillas está vacío y «la ficha de
producto es editable» solo lo es para quien sepa de antemano qué cinco
secciones crear y en qué orden. Es idempotente en el único sentido que importa
aquí: si ya hay una plantilla `product` por defecto, no la toca.

### La escotilla: entrar cuando el panel te ha dejado fuera

Payload bloquea una cuenta a los **cinco intentos fallidos** durante **diez
minutos** (`maxLoginAttempts` y `lockTime`; este repo no los toca y no debe
tocarlos). Correcto, salvo que hasta el 22 ago 2026 no había salida:
`POST /api/users/unlock` **exige sesión** —su `access` hereda el default de
Payload, que pide `req.user`— y `seed:admin` **se niega a correr** si ya existe
algún usuario, para no ser una puerta trasera. La única salida era SQL a mano
sobre `lock_until` y `login_attempts`, y no estaba escrita en ninguna parte.

```bash
ADMIN_EMAIL=tu@correo pnpm --filter @courvia/web unlock:admin
```

Pone a cero el contador de intentos de una cuenta que **ya existe**: no la crea,
no cambia su contraseña y no le concede permisos. Si el correo no existe lo dice
—`unlock` de la Local API devuelve un booleano y no distingue los dos casos, así
que el script comprueba primero.

**Este sí corre contra producción, y es la diferencia con las semillas.**
`seed:e2e-operator` se niega a correr contra cualquier cosa que no sea la base
desechable porque crea un usuario con contraseña fija; este no lleva ese
guardarraíl **a propósito**, porque su razón de existir es justamente el momento
en que nadie puede entrar al panel de producción. No abre ninguna puerta nueva:
exige `DATABASE_URL`, y quien tiene esas credenciales ya puede hacer cualquier
cosa con la base.

Se descubrió el hueco al poner el límite de tasa a `forgot-password`: antes de
tocar la autenticación conviene saber cómo se sale si algo va mal.

### El tick de mantenimiento, y cómo ejecutarlo a mano

En un despliegue lo dispara Vercel Cron **una vez al día**, a las 04:00 UTC
(`"schedule": "0 4 * * *"` en `apps/web/vercel.json`), sobre `GET /next/cron`
(autenticado con `CRON_SECRET`; ver `docs/deployment.md`). Hace **cinco**
cosas: despachar el outbox, caducar los checkouts abandonados, **borrar los
carritos vencidos**, **podar los informes de CSP** y **dejar constancia de que
corrió** en `ops-runs`.

Las tres últimas no estaban aquí. La barrida de carritos entró con la Fase 4 y
este documento —y `docs/deployment.md`— siguieron diciendo «dos» durante meses,
en los dos únicos sitios donde un operador miraría. La constancia y la poda son
del 22 ago 2026: la primera es de lo que va la sección siguiente.

**La cadencia es diaria a propósito, y hay que saber lo que cuesta.** Vercel
Hobby rechaza cualquier `schedule` más fino y hace fallar el despliegue al
validar `vercel.json`, así que `*/5 * * * *` no correría despacio: no
desplegaría (`docs/deployment.md`, «Cron de mantenimiento»; lo sujeta el test
`keeps a cadence the current plan accepts` de `deploy-contract.test.ts`). El
peor caso real, con un solo tick al día:

| Efecto | Umbral | Peor caso hasta que ocurre |
|---|---|---|
| Fila del outbox (el correo de la waitlist, el único que hoy convierte) | inmediato | **hasta 24 h** — encolada justo después de un tick, espera al siguiente |
| Checkout abandonado → `cancelled` + stock liberado | 1 h de vida (`CHECKOUT_TTL_MINUTES`) | **casi 25 h** — un pedido creado a las 03:00 UTC aún no tiene una hora a las 04:00, así que no lo caza ese tick y espera al del día siguiente |

Un pedido `pending_payment` de veinte horas es, por tanto, la cadencia
elegida y no una avería: solo hay que sospechar del cron si sobrevive a un
tick.

### Salud: cómo saber que esto sigue vivo

**El fallo que no se ve.** Si el planificador de Vercel deja de disparar el
tick no hay error en ninguna parte. Lo que se para está contado: la
confirmación de la waitlist —la única conversión del sitio—, los correos de
seguimiento y posventa, **la ventana legal de desistimiento** (Art. 102
TRLGDCU: 14 días, y **doce meses si no se informa**), **`stop_picking`** —la
contraorden que impide enviar un robot cuyo reembolso ya va de camino—, las dos
alertas de dinero contradiciéndose y la liberación de las reservas de stock.

Hasta el 22 ago 2026 la única forma de detectarlo era la heurística de arriba:
mirar un pedido y calcular a ojo si había pasado un tick.

**Ahora cada tick deja una fila** en `ops-runs` (`job`, `startedAt`,
`finishedAt`, `status`, `summary`; 90 días de historia, podados por el propio
tick). Una colección y no un global a propósito: un global dice cuándo fue el
último, pero no que faltaron tres días seguidos.

**`GET /next/health`** contesta la única pregunta que hace falta: **200 si el
último tick tiene menos de 26 horas, 503 si no.** Veintiséis y no veinticuatro
porque con cadencia diaria el peor caso legítimo ya son ~25 h (ver la tabla de
arriba); un umbral de 24 sería un vigilante que grita todos los días, y un
vigilante que grita todos los días se silencia.

La ruta es **pública y callada**: devuelve `ok` y la edad en horas, nunca el
resumen del tick ni el error de un trabajo. Sin autenticar porque el vigilante
es un `curl`, y meterle un secreto sería un secreto más que rotar para proteger
un booleano.

**Quién vigila:** `.github/workflows/health.yml`, diario a las 09:00 UTC.

**Necesita tres cosas, y cada una depende de la anterior. Hoy no tiene
ninguna:**

1. **Estar en la rama por defecto.** GitHub ejecuta los workflows programados
   **solo** desde ella, y tampoco ofrece `workflow_dispatch` a los que no están
   ahí. Mientras el fichero viva únicamente en la rama de trabajo, GitHub no lo
   registra —`actions/workflows` devuelve solo `ci.yml`— y no hay nada que
   pueda salir rojo. Comprobado el 23 ago 2026.
2. **Un despliegue de producción vivo**, o no hay URL que vigilar
   (`docs/deployment.md`: los 40 despliegues están en `ERROR`).
3. **La variable de repositorio `HEALTH_URL`** (Settings → Secrets and
   variables → Actions → Variables). Es la única de las tres que el propio
   workflow puede comprobar, y **falla a propósito si no está**: un vigilante
   sin configurar que sale verde es la misma avería que vino a arreglar.

Que el punto 1 no estuviera escrito hasta hoy es el mismo fallo en pequeño: el
runbook enumeraba `HEALTH_URL` como único requisito, así que alguien podía
ponerla, ver el workflow sin ejecuciones y suponer que todo iba bien.

**El canal de `OPS_EMAIL` NO sirve para esto** y conviene saber por qué: viaja
dentro del outbox, y el outbox lo drena el cron. Un aviso que se apaga
exactamente cuando se apaga lo que vigila no es un aviso.

#### Cuando el vigilante salta

1. **Mira `GET /next/health` a mano.** Si `ageHours` es `null`, el cron no ha
   corrido nunca en ese despliegue: lo primero que hay que comprobar es
   `CRON_SECRET` — sin ella la ruta responde 503 y no ejecuta nada.
2. **Dispara el tick a mano** con la llamada autenticada de abajo. Si responde
   200 o 207, el problema es el planificador, no la aplicación.
3. **Mira `ops-runs` en el panel.** El `summary` de los últimos ticks dice cuál
   de los trabajos venía fallando, y el `status` 207 marca los que fallaron a
   medias.
4. **Mientras tanto, los dos escapes manuales:**
   `pnpm --filter @courvia/web sweep:checkouts` libera las reservas de stock de
   los checkouts muertos, y `pnpm --filter @courvia/web sweep:carts` borra los
   carritos vencidos. Mientras el plan siga en Hobby, el puente es dispararlo a mano: la misma
llamada autenticada de abajo, con el dominio del despliegue en lugar de
`localhost:3000`.

En local, la ruta funciona igual con el servidor levantado:

```bash
# apps/web/.env.local: CRON_SECRET=lo-que-quieras
curl -sS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/next/cron
```

Sin credenciales de correo, Payload usa su adaptador de consola: el envío se
registra en el log del servidor y la fila del outbox pasa a `dispatched`.

Solo el sweep de checkouts, sin servidor:

```bash
pnpm --filter @courvia/web sweep:checkouts
```

Ejecuta `expireStaleCheckouts` (`packages/commerce-payload`): los pedidos `pending_payment` con más de 1 hora pasan a `cancelled` por la misma maquinaria que cualquier evento de pago — transición pura, lock de fila, transacción — y se liberan sus reservas de stock. Un checkout que paga durante el sweep está a salvo: el lock serializa a ambos escritores.

### La CSP: cómo termina su rodaje

La política de recursos se sirve **en modo informe** (`Content-Security-Policy-Report-Only`)
desde el primer día, y por una razón buena: aplicarla a ciegas rompería
`/admin` —el panel es un paquete de terceros— y el payload RSC de Next llega
como `<script>` en línea. El comentario de `next.config.ts` ponía la condición
para pasar a enforcing: *«the console is the data we need»*.

Esa consola es la **del visitante**. Sin colector, la condición no se cumple
nunca y la cabecera se queda para siempre en una que da sensación de proteger
sin bloquear nada.

**Desde el 22 ago 2026 hay colector.** `POST /next/csp-report`, con las dos
directivas puestas (`report-uri` para Safari y Firefox, `report-to` + la
cabecera `Reporting-Endpoints` para Chrome) y una ruta relativa, para que cada
despliegue informe a sí mismo en vez de mandarle los informes de preview a
producción.

**Lo que guarda es una agregación, no un registro.** Una fila por **(día,
directiva, origen bloqueado)** con un contador: mil informes iguales son una
fila. Las tres columnas están acotadas —el día avanza solo, la directiva se
valida contra una lista cerrada, y el origen tiene techo diario con cubo de
desbordamiento (`(otros)`)—, que es lo que hace que un endpoint público
escribiendo en la base no sea un problema. Retención: 30 días, podados por el
tick.

**Responde 204 a todo**: informe válido, `Content-Type` equivocado, cuerpo
enorme y cupo agotado. Distinguirlos le diría a quien prueba dónde está cada
borde, y el navegador ni reintenta ni enseña el resultado a nadie.

#### Cómo leerlo, y cuándo aplicar la política

1. **Mira `Informes de CSP` en el panel**, ordenado por contador. Lo que
   aparece son los recursos que la política de hoy bloquearía.
2. **`inline` y `eval` son los que mandan.** Mientras `script-src` siga
   informando `inline` en volumen, aplicar la política rompería el sitio: son
   los que hoy obligan a `'unsafe-inline'`.
3. **Un origen de terceros con contador alto** es o una integración que falta
   declarar (se añade a la directiva) o una extensión del visitante (se
   ignora: no podemos ni debemos permitirla).
4. **La fila `(otros)`** significa que ese día se pasó del techo de orígenes
   distintos. Es señal de ruido —una extensión, o alguien probando—, no de una
   integración nuestra.
5. **Aplicar** es mover la directiva ya limpia de `contentSecurityPolicy()` a
   `ENFORCED_POLICY` en `next.config.ts`. De una en una, y `img-src` tiene una
   condición adicional escrita en `mediaOrigin()`: hoy se resuelve en tiempo de
   build y un mismo build va a preview y a producción.

**Y una expectativa que conviene bajar antes de mirar los datos.** La política
de informe **ya permite `'unsafe-inline'`** en `script-src` y en `style-src`, y
`blob:` en `img-src`/`worker-src`. O sea que aplicarla compra bastante menos de
lo que sugiere la palabra «enforcing»: lo que este colector puede descubrir de
verdad son **orígenes de terceros** —`connect-src`, `img-src`, `frame-src`— y
de qué esquemas (`data:`, `blob:`) depende el sitio. Quitar `'unsafe-inline'`
de `script-src`, que es lo que de verdad cerraría un XSS, exige nonces por
petición, o sea un middleware que esta aplicación no tiene y que rompería el
prerenderizado que sostiene ADR-015. Eso es otra decisión, y grande.

Consecuencia práctica: **el panel también informa** —la entrada de
`/admin/:path*` solo reemplaza la cabecera *enforcing*, no la de informe— pero
como casi todo lo que hace ya está permitido, no hace falta filtrarlo. Se
comprobó antes de añadir una entrada de cabecera para un problema inexistente.

### El límite de `forgot-password`

`POST /api/users/forgot-password` no tenía **ningún** límite: no incrementa
`loginAttempts`, no mira `lockUntil`, y cada petición manda un correo desde
nuestro dominio verificado. Bastaba con conocer el correo de un editor para
llenarle el buzón.

Desde el 22 ago 2026 hay dos cubos: **3 por dirección** (una ficha cada 5 min)
y **3 por buzón** (una cada 15 min). El segundo es el que cierra el caso
interesante: quien rota IPs esquiva el primero, pero no puede rotar a quién
quiere inundar.

**El login NO se limita por IP**, y es una decisión: Payload ya bloquea por
cuenta a los cinco intentos durante diez minutos, y un límite por dirección
encima de eso compra poco a cambio de poder dejar fuera del panel a quien tiene
la contraseña bien. Si alguien se queda fuera igualmente, la salida es
`unlock:admin` (arriba).

Va como hook `beforeOperation` de la colección y no como envoltorio del route
handler, porque `/api/graphql` expone `mutation forgotPasswordUser` que llama a
la misma operación: un envoltorio dejaría esa puerta abierta dando sensación de
estar cerrada.

---

---

## 13. Testing y CI

| Nivel | Herramienta | Cubre | Cuándo |
|---|---|---|---|
| Unit | Vitest | Dominio, Zod, monedas (zero-decimal, redondeo), **normalización de PaymentEvents** | Cada PR |
| Integración | Vitest + **Stripe test clocks** (+ sandbox Tabby/Tamara en S4) | Adaptadores, webhooks idempotentes, máquina de estados | Cada PR |
| Navegador | **Playwright** — `pnpm e2e` | **Existe desde el 22 ago 2026.** Geometría del raíl pegajoso · desbordamiento horizontal a 320/390 en cuatro rutas + RTL · axe AA en los tres temas y en RTL · teclado (menú móvil, salto al contenido) | Job `e2e` en cada PR |
| Operar un pedido | Playwright, por `request` con sesión real | **Desde el 22 ago 2026.** `paid → preparing → shipped → delivered` por la API del panel, con las dos escrituras que tiene que negar (`orders.status` y `withdrawalDeadline`). El escenario lo monta `pnpm seed:e2e-operator`, que **se niega a correr contra una base de datos que no sea local o la de CI** | Job `e2e` en cada PR |
| E2E de compra | Playwright | Checkout **por mercado y proveedor**: EUR+Bizum · GBP+Klarna · AED+tarjeta y AED+Tabby; RMA | 🔒 pendiente: exige credenciales de pasarela |
| Visual | Storybook (+Chromatic opc.) | `ui` en 3 temas + RTL | ⏳ pendiente |

**El harness de navegador, en concreto** (`apps/web/playwright.config.ts`,
`apps/web/e2e/`). Un solo servidor para todas las pruebas —Playwright lo
levanta con `next start` en el 3999— frente a los siete `next start` que las
suites HTTP de Vitest arrancan cada una por su cuenta. Va en un job de CI
**separado** de `verify`: aquel ya tarda unos cuatro minutos, y mezclarlos hace
que un fallo de layout se lea como un fallo de tipos.

El navegador es el Chromium de la máquina si lo hay —este contenedor trae uno
preinstalado— y el que Playwright descarga si no. Se detecta; fijar la ruta a
ciegas rompería CI y no fijarla obliga a descargar 170 MB en cada sesión.

Lo primero que encontró al correr: **32px de desbordamiento horizontal a 320px
en las cuatro rutas**, todos de la cabecera. Llevaba ahí desde que el CTA entró
en la barra.

Ningún merge sin CI verde; humano aprueba pagos/RLS.

---

## 15. Variables de entorno y seguridad

Credenciales de pago **namespaced por proveedor** — añadir una pasarela nueva = añadir su bloque, sin tocar el resto:
```
SUPABASE_URL · SUPABASE_PUBLISHABLE_KEY   # sin prefijo NEXT_PUBLIC_: nada en el
                                 # navegador habla con Supabase; la tienda llega a
                                 # Postgres por Payload, en servidor
SUPABASE_SECRET_KEY              # SOLO backend/CI; el agente jamás la pide, lee o usa
SUPABASE_PROJECT_REF=xurdwzbefgxpfzgkbbkf · DATABASE_URL (CI)
PAYLOAD_SECRET

# Proveedor de pago: stripe (Fase 1)
STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET · NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY · STRIPE_TAX_ENABLED=true
# Proveedores BNPL EAU (S4)
TABBY_API_KEY · TABBY_WEBHOOK_SECRET · TAMARA_API_TOKEN · TAMARA_NOTIFICATION_TOKEN
# Futuro (solo si se activa el adaptador): ADYEN_API_KEY · ADYEN_HMAC_KEY · ADYEN_MERCHANT_ACCOUNT

RESEND_API_KEY · EMAIL_FROM · VERIFACTU_PROVIDER_API_KEY
CRON_SECRET                      # autentica GET /next/cron (outbox + sweep)
NEXT_PUBLIC_GA4_ID · NEXT_PUBLIC_PLAUSIBLE_DOMAIN
NEXT_PUBLIC_SITE_URL · NEXT_PUBLIC_DEFAULT_LOCALE=es
```
**Checklist:** RLS en todo commerce · `(provider, provider_event_id)` UNIQUE + firma en cada webhook · importes server-side · test de que la clave secreta (`SUPABASE_SECRET_KEY` / legacy `service_role`) no está en bundles cliente · MCP prod read-only · migraciones a producción solo por CI · CSP compatible (glass/pasarelas/Plausible) · consentimiento cookies por mercado (LSSI/PECR/PDPL) · rotación de claves · **runbook de cambio de cuenta/pasarela** ([`docs/payments-runbook.md`](payments-runbook.md)): rotar envs → re-registrar webhooks → drenar pagos en vuelo → conciliar.

### 15.1 El test de la cuarta capa (exposición del Data API)

`.claude/rules/database.md` exige que el aislamiento (access control de Payload · schema no expuesto · RLS) lo demuestre un test, no la confianza. Ese test es `apps/web/src/server/data-api-exposure.test.ts`: conecta al Data API de Supabase con la clave **publicable** (pública por diseño; el archivo no contiene ningún secreto) y comprueba que las tablas sensibles (`orders`, `payments`, `outbox`, `leads`, `users`, `prices`) **no resuelven** — ni por el schema por defecto ni forzando `Accept-Profile: payload`. Cualquier cosa que no sea un status de error es una fuga.

Se activa con `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (ver `apps/web/.env.example`); sin ellas se marca como skipped (desarrollo local, CI sin base). Pasó en verde contra el proyecto real el 20 ago 2026.

### 15.2 La plantilla de entorno no puede desviarse del código

`apps/web/src/server/env-contract.test.ts` recorre las fuentes de `apps/web`, extrae toda lectura del entorno —`process.env.X`, `process.env["X"]` y el accesor `env("X")` de `storage.ts`, `build-env.ts` y `email/adapter.ts`— y exige que cada nombre esté en `apps/web/.env.example`. La dirección contraria **también falla**: un nombre en la plantilla que ningún código lee es una instrucción para no hacer nada, y peor, anuncia una integración que no existe (la plantilla de la raíz pedía `TAMARA_WEBHOOK_SECRET` mientras el código leía `TAMARA_NOTIFICATION_TOKEN`).

Dos ficheros, dos trabajos: `apps/web/.env.example` es la plantilla que alguien copia a `.env.local` y el test la mantiene exacta; el `.env.example` de la raíz es el inventario de plataforma —incluidas pasarelas y servicios que aún no existen (ADR-06/07)— y es un superconjunto a propósito. Las variables que inyecta la plataforma (`NODE_ENV`, `CI`, `NEXT_PHASE`, `VERCEL*`) están en una lista explícita del test: documentarlas invitaría a fijar a mano un valor que no es nuestro.

---

---

## 19. Setup Claude Code / MCP, estado de infraestructura y móvil

### 19.0 Estado de infraestructura

> **Esta sección se reescribió entera el 23 ago 2026, y merece decir por qué.**
> Decía tres cosas falsas, dos de ellas **a cuatro líneas de distancia y
> contradiciéndose entre sí**: que el esquema estaba desplegado en un proyecto
> concreto de Supabase con «batches 1–6 aplicados y el 7 pendiente», que ese
> mismo proyecto estaba «sin tablas, lienzo limpio», y que el team de Vercel no
> tenía todavía proyecto Courvia. Es la sección que abre quien quiere saber qué
> existe. Desde ahora separa **medido** de **no verificable**, y lleva fecha.

**Medido el 23 ago 2026:**

- **Vercel** — el proyecto existe: `courvia-studios` en el team
  `novara-bbs' projects`, ligado al repositorio de GitHub. Tiene **40
  despliegues y los 40 en `ERROR`**, producción incluida. El sitio **no se ha
  servido nunca desde una URL real**. Las causas y su orden de arreglo están en
  `docs/deployment.md`.
- **GitHub** — `origin/main` lleva el árbol completo desde el 22 ago
  (`7968890`). Solo hay **un workflow registrado**, `ci.yml`; ver el apartado de
  salud sobre por qué `health.yml` todavía no cuenta.
- **Migraciones** — **24** en `apps/web/src/migrations/`, de
  `20260819_124931_initial` a `20260822_192825_fase8_colector_de_csp`. La
  numeración por «batches» de la versión anterior de esta sección no
  corresponde a nada del repositorio actual.

**No verificable, y por eso no se afirma:**

- **La base de datos de producción.** CLAUDE.md §3 y este documento nombran el
  proyecto de Supabase `xurdwzbefgxpfzgkbbkf`. Con el MCP autenticado,
  `list_projects` devuelve dos proyectos y **ninguno es ese**
  (`docs/plan-dual-commerce.md`, `docs/tco-dos-motores.md`). El MCP ve una sola
  cuenta y el propietario puede tener otra, así que esto se reporta como
  **medición y no como conclusión** — pero mientras no se aclare, **no hay base
  de producción que nadie pueda señalar**, y sin ella no hay `DATABASE_URL` de
  Production, ni despliegue, ni cron, ni nada de lo que cuelga de ellos.
- Por lo mismo, **el estado del esquema en producción**: cuántas de las 24
  migraciones tiene aplicadas es una pregunta sin sujeto hasta entonces. El
  procedimiento para comprobarlo, cuando lo haya, está en `docs/deployment.md`
  (paso 3 del primer despliegue: confirmar el ledger `payload.payload_migrations`).

### 19.1 Setup (una vez, desde un ordenador — terminal normal)
```bash
git clone <repo-courvia> && cd <repo-courvia>

# MCP Supabase (scope project → crea .mcp.json commiteable)
# Acotado: project_ref + read_only + solo las features necesarias (ampliar solo si una tarea lo exige)
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=xurdwzbefgxpfzgkbbkf&read_only=true&features=docs%2Cdatabase%2Cdevelopment%2Cdebugging"

claude
/mcp        # seleccionar "supabase" → Authenticate

npx skills add supabase/agent-skills   # opcional, recomendado
```
Commitear `.mcp.json`. Autenticación por máquina/entorno. **El MCP no se configura en la sesión de bootstrap**; cuando llegue su tarea: limitar a `project_ref`, activar solo los grupos de features necesarios y `read_only=true` si apunta a datos reales. **Producción: acceso del agente en solo-lectura; escrituras a producción solo por CI.** Añadir después MCP/CLI de Vercel y GitHub.

### 19.2 Móvil (app Claude → pestaña Code)
- **Remote Control** (recomendado con un equipo encendido): `claude` o `claude remote-control` en el ordenador; el móvil es una ventana a esa sesión local — conserva `.mcp.json` autenticado, filesystem y tools. `/mcp` no funciona por el puente: autenticar antes en terminal.
- **Claude Code web/cloud**: sesión en infraestructura de Anthropic conectada al repo GitHub; entorno limpio, ideal para tareas acotadas sin ordenador.
- Docs: code.claude.com/docs/en/remote-control · docs.claude.com/en/docs/claude-code/overview

**Flujo por sesión:** UNA tarea de §16 → plan breve → aprobar → implementar → tests/CI → commit convencional → actualizar este MD si cambió una decisión. Nada de "hazme todo el sprint" de una vez.

---
