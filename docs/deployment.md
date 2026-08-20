# Despliegue

> Objetivo: ver Courvia en una URL real. Primera opción: **Vercel** (soporte
> de primera clase para Next 16, PPR/cacheComponents y el proxy). Netlify u
> otros funcionan pero exigen adaptación propia; abajo se anota lo mínimo.
> Los secretos viven en Vercel/GitHub Environments — nunca en el repo, y el
> agente nunca los lee ni los pide (CLAUDE.md §4).

## Vercel — configuración del proyecto

| Ajuste | Valor | Dónde vive |
|---|---|---|
| Framework | `nextjs` — **declarado, no autodetectado** | `apps/web/vercel.json` |
| **Root Directory** | `apps/web` | **Panel de Vercel** (no hay forma de ponerlo desde el repo) |
| **Include source files outside of the Root Directory** | **activado** | Panel de Vercel |
| Install Command | `cd ../.. && pnpm install --frozen-lockfile` | `apps/web/vercel.json` |
| Build Command | `cd ../.. && pnpm turbo run build --filter=@courvia/web` | `apps/web/vercel.json` |
| Node | 22.x (lo fija `package.json#engines` / `.nvmrc`) | repo |

Todo lo que puede vivir en el repo vive en `apps/web/vercel.json`, y
`apps/web/src/deploy/deploy-contract.test.ts` lo verifica. Los dos ajustes de
panel son los únicos que no: la API de Vercel solo acepta `rootDirectory` **al
crear** el proyecto, no al actualizarlo.

### La avería del 20 de agosto, y por qué se cuenta aquí

Tres pushes seguidos salieron con **CI en verde y todos los despliegues de
Vercel en rojo**, y nadie se enteró hasta que un humano miró el correo. El
fallo no estaba en el código: este documento ya decía Root Directory =
`apps/web`, pero el proyecto se había importado apuntando a la raíz del repo,
así que Vercel no veía una app de Next sino una carpeta, y buscaba un
`public/` que no existe. El build iba bien; lo que fallaba era recoger la
salida.

La lección no es «configurar mejor Vercel». Es que **un documento no es un
guardarraíl**: describía la realidad correcta durante días mientras la
realidad era otra, y nada estaba mirando. De ahí las tres medidas:

1. La configuración que puede estar en el repo está en el repo, y un test la
   fija (`deploy-contract.test.ts`), incluida la coherencia con esta tabla.
2. El check de despliegue de Vercel debe ser **required status check** en la
   protección de rama: un despliegue rojo bloquea el merge igual que un test
   rojo. Es un ajuste de GitHub, no de código.
3. CLAUDE.md §6: una sesión no se cierra con CI verde, se cierra con el
   **despliegue** verde.

### Variables de entorno (las pone el propietario, no el agente)

| Variable | Entorno | Qué es |
|---|---|---|
| `DATABASE_URL` | Production/Preview | Supabase con **pooler** (puerto 6543, `?pgbouncer=true`): serverless abre muchas conexiones cortas y el pooler las absorbe. La contraseña la pega el propietario. |
| `PAYLOAD_SECRET` | Production/Preview | Aleatorio largo; distinto del local. |
| `NEXT_PUBLIC_SITE_URL` | Production | `https://{dominio}` — canónicas/hreflang; `siteUrl()` revienta el build de producción si falta. |
| `STRIPE_WEBHOOK_SECRET` | cuando se conecte | Activa el adaptador Stripe (solo webhooks). |
| `STRIPE_SECRET_KEY` | cuando se conecte | Solo para la tarea de integración aprobada. |
| `PAYMENT_FAKE_SECRET` | **solo Preview/dev** | Fail-closed: bloqueado con `VERCEL_ENV=production`, y con `NODE_ENV=production` exige además `PAYMENT_FAKE_UNSAFE_ALLOW=1` (solo el servidor local en modo prod). |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Production/Preview | Bucket de medios. **Sin ellas, en Vercel las subidas quedan DESACTIVADAS** (ver abajo). Las tres van juntas. |
| `S3_ENDPOINT` | si no es AWS | Supabase: `https://<project-ref>.storage.supabase.co/storage/v1/s3`. |
| `S3_REGION` | opcional | Por defecto `auto`; los proveedores compatibles la ignoran. |

### Migraciones: nunca en el build

`push: false` — el esquema solo cambia por migraciones, y su aplicación a
producción va **únicamente por CI con aprobación humana** (§4). El deploy de
Vercel NO ejecuta `payload migrate`. Flujo:

1. La migración se crea y prueba en local (`pnpm migrate`).
2. CI la valida contra Postgres real en cada push.
3. Aplicación a la BD de producción: paso manual aprobado (hoy vía MCP de
   Supabase con aprobación explícita; a futuro un job de GitHub Actions con
   environment protegido).
4. Solo entonces se despliega el código que la necesita.

### Lo que hay que decidir ANTES de subir tráfico real

- **Uploads (Media)**: resuelto, pero hay que configurarlo. El filesystem de
  Vercel es efímero, así que `apps/web/media/` no sirve en producción:
  escribir ahí funciona y la imagen desaparece en el siguiente deploy, sin
  error. `@payloadcms/storage-s3` está instalado y `src/payload/storage.ts`
  elige destino **desde el entorno** — bucket compatible con S3 si está
  configurado, disco local si no. Cambiar de Supabase Storage a R2 o a S3 son
  cinco variables, nunca un cambio de código.

  Y si el despliegue es efímero y NO hay bucket, las subidas se **rechazan**
  en vez de aceptarse y perderse: `access.create`/`update` de `media` devuelven
  false y el arranque deja un error en el log. Un bibliotecario que no puede
  subir abre un ticket; uno cuyas subidas se evaporan a la semana, no.
- **Dominio**: courvia.com/es sin verificar (pendiente legal, CLAUDE.md §1).
  Mientras, el subdominio `*.vercel.app` sirve para previews.
- **Outbox**: el despacho es manual-asistido; el cron/worker (Vercel Cron)
  llega con la integración de pagos.

### Por qué el build funciona sin base de datos, y cuándo deja de funcionar

- **En tu máquina, sin `DATABASE_URL`**: el build prerenderiza con catálogo
  vacío y las páginas se rellenan bajo demanda en runtime (que SÍ necesita la
  BD). Es la única tolerancia que queda, y existe para que alguien pueda
  compilar antes de levantar Postgres.
- **En Vercel o en CI, sin `DATABASE_URL`**: **el build falla**, y el mensaje
  dice qué variable falta y dónde se pone. Antes salía verde y servía
  `/es/robots` y el sitemap **vacíos** con `cacheLife("max")`: 30 días de
  revalidación y un año de caducidad sobre una tienda sin productos. Se llega
  con una variable de scope solo Production mientras compila un Preview —
  por eso `DATABASE_URL` va en Production **y** en Preview.
- **Con `DATABASE_URL` configurada y la BD caída**: el build falla en
  cualquier entorno, también en local. «No hay configuración» y «la consulta
  falló» son cosas distintas y solo la primera admite respuesta vacía.

El gate vive en `apps/web/src/server/build-env.ts` —una implementación, no
una copia por loader— y decide con `NEXT_PHASE` (lo pone `next build`),
`VERCEL`, `VERCEL_ENV` y `CI`. Las cuatro están declaradas en `turbo.json`
(`tasks.build.env`) porque turbo 2 corre en modo de entorno estricto: una
variable no declarada no llega a `next build`, y un gate que lee lo que turbo
filtra no sujeta nada. `apps/web/src/server/build-env.test.ts` comprueba las
dos mitades: la decisión y que las variables lleguen.

Límite conocido: un pipeline autohospedado (Docker + `next start`) no expone
ninguna de esas señales, así que se trataría como un build local. Si algún día
existe, su build tiene que correr con `DATABASE_URL` configurada.

## Netlify u otros

Posible con el adaptador Next de Netlify, pero PPR/cacheComponents y el
proxy están probados solo en Vercel. Si algún día importa, es un spike
propio: no asumir paridad. Autohospedado (Docker + `next start`) también
funciona — es exactamente lo que corre en desarrollo — pero pierdes el CDN
y el ISR distribuido.

## Checklist del primer deploy (Vercel)

1. Importar el repo en Vercel · Root Directory `apps/web` · «Include source
   files outside of the Root Directory» activado. Si el proyecto ya existe mal
   configurado, esos dos ajustes se cambian a mano: la API no los admite en un
   proyecto ya creado.
2. Pegar `DATABASE_URL` (pooler 6543), `PAYLOAD_SECRET`, `NEXT_PUBLIC_SITE_URL`.
3. Confirmar que TODAS las migraciones de `apps/web/src/migrations` figuran en `payload.payload_migrations` de Supabase (el ledger es la verdad, no un número recordado).
4. Deploy → smoke: `/es`, `/es/robots`, `/es/robots/drill-pro`, `/admin`,
   403 en `/api/prices`, 404 en `/next/webhooks/stripe` (sin configurar: correcto).
5. Sembrar contenido real desde `/admin` (o ejecutar los seeds una vez
   contra la BD de producción si se quiere el demo).
