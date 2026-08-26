# WordPress headless para Courvia

Esto es una vía de migración reversible, no un segundo comercio.

## Instalación

1. Aloja WordPress con PHP/MySQL y HTTPS, por ejemplo en `cms.courvia.com`.
2. Copia `courvia-headless/` a `wp-content/plugins/` y activa **Courvia Headless Bridge**.
3. En `wp-config.php`, antes de la línea final, configura:

```php
define( 'COURVIA_STOREFRONT_URL', 'https://courvia.com' );
define( 'COURVIA_REVALIDATE_SECRET', 'un-secreto-largo-distinto' );
```

4. Crea un usuario técnico con el mínimo permiso editorial necesario y una Application Password.
5. Configura en Netlify las variables documentadas en `apps/web/.env.example`; prueba primero en un deploy de rama.

La comprobación de salud pública es `https://cms.courvia.com/wp-json/wp/v2/courvia-pages`. `WORDPRESS_API_URL` debe terminar en `/wp-json/`.

## Límites deliberados

El metabox JSON permite importar y probar el contrato completo sin acoplar la web a un plugin comercial. No es la interfaz final para el equipo editorial. Antes del cambio definitivo hay que generar bloques Gutenberg nativos desde `@courvia/sections/registry`; el storefront seguirá recibiendo los mismos datos estructurados y nunca `content.rendered`.

WordPress no gestiona catálogo, precio, stock, cuentas, leads, pedidos ni pagos. Esos menús y su panel continúan en Payload.

