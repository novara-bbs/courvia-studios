# Reglas de base de datos

## Migraciones

- Se **crean, revisan y prueban** en local o desarrollo.
- Su **aplicación a producción va únicamente por CI**, con aprobación humana explícita.
- Nunca apliques una migración a producción desde una sesión de agente.

## Acceso

- Las tablas de commerce viven en un **schema Postgres no expuesto** al Data API.
- Si algo se expone: grants explícitos + **RLS** sin política permisiva para roles anónimos.
- El MCP de Supabase apunta a producción **en solo lectura**, limitado al `project_ref` y a las features mínimas.

## Cuatro capas, y la cuarta es la que importa

Access control de Payload · schema no expuesto · RLS · **y un test que lo demuestra** conectando con la clave publicable y comprobando que no ve nada. Sin ese test las tres primeras son aspiraciones.

### El disparador `ensure_rls` no cubría `payload`

Hay un event trigger (`rls_auto_enable`) que activa RLS en cada tabla nueva. Su lista de schemas era **solo `public`**, así que ninguna tabla del schema `payload` —o sea, todos los datos de commerce y del CMS— nacía protegida. Parecía cubierto porque cada migración anterior activaba RLS a mano; la primera que se olvidó creó 36 tablas sin RLS y nada dijo nada.

Corregido el 20 ago 2026: la función enumera `('public','payload')` y hay una migración que lo **demuestra** creando una tabla de prueba, comprobando que el disparador la protegió y borrándola.

**Y el arreglo estaba solo en producción.** Ninguna de las trece migraciones contenía un `ENABLE ROW LEVEL SECURITY`: RLS existía como acción manual sobre un único proyecto de Supabase. Cualquier otra forma de llegar a este esquema —una rama de Supabase, un restore, un segundo entorno, el Postgres desechable de CI— nacía con pedidos, pagos y leads sin proteger, y `pnpm verify` no decía nada. Una regla dura que solo existe en una base de datos no es una regla, es una casualidad.

Desde `20260820_210000_rls_lockdown` está en el repo: redefine el disparador, activa RLS en todo el esquema y **se afirma a sí misma** —si al terminar queda una tabla sin RLS o aparece una política, la migración lanza y no se aplica. CI repite las dos comprobaciones contra su propio Postgres después de migrar, así que la garantía no depende de que alguien se acuerde.

Aun así, al aplicar una migración a producción **se comprueba**, no se supone:

```sql
select count(*) filter (where rowsecurity) as rls_on, count(*) as total
from pg_tables where schemaname = 'payload';   -- deben coincidir
select count(*) from pg_policies where schemaname = 'payload';  -- debe ser 0
```

RLS activo **sin ninguna política** es la denegación total. Una política permisiva para `anon` sería el fallo; cero políticas es el diseño.

## Secretos

`SUPABASE_SECRET_KEY` (legacy: `service_role`), contraseñas Postgres y secretos de pago: **jamás** en cliente, jamás en el repo, y el agente **jamás los solicita, lee ni usa**. Local en `.env.local` (ignorado por Git); despliegue en Vercel; CI en GitHub Environments.
