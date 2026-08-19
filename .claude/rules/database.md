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

## Secretos

`SUPABASE_SECRET_KEY` (legacy: `service_role`), contraseñas Postgres y secretos de pago: **jamás** en cliente, jamás en el repo, y el agente **jamás los solicita, lee ni usa**. Local en `.env.local` (ignorado por Git); despliegue en Vercel; CI en GitHub Environments.
