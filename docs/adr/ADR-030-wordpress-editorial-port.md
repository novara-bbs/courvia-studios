# ADR-030 — WordPress solo como fuente editorial intercambiable

**Estado:** preparado, desactivado por defecto  
**Decisión:** Payload sigue siendo el sistema operativo y comercial. WordPress puede sustituirlo únicamente para páginas editoriales y, más adelante, el blog.

## Por qué no sustituir todo

Courvia ya concentra en Payload catálogo, precios por mercado, inventario, usuarios, leads, pedidos, pagos, medios gobernados y permisos. Replicar esos dominios en WordPress crearía dos fuentes de verdad y haría ambiguo qué panel manda. La frontera estable ya existe: el escaparate consume una página neutral `{ slug, title, blocks, seo }` y el paquete `@courvia/sections` valida y renderiza sus bloques.

Por tanto:

- `COURVIA_EDITORIAL_SOURCE=payload` (predeterminado) conserva el sistema actual.
- `COURVIA_EDITORIAL_SOURCE=wordpress` cambia solo las lecturas de páginas.
- Productos, precios, stock, pedidos, pagos, leads, navegación y tema continúan en Payload.
- No hay escritura doble ni fallback silencioso. Si WordPress está seleccionado y falla, la lectura falla: servir contenido antiguo de la otra fuente ocultaría una avería editorial.

## Contrato WordPress

WordPress se aloja aparte porque necesita PHP y MySQL; Netlify sigue alojando Next.js. El plugin puente debe registrar `courvia_page` con REST y revisiones y exponer:

- `courvia_locale`: `es`, `en` o `ar`.
- `courvia_blocks`: JSON con el mismo `blockType` y campos del registro Courvia.
- `courvia_seo`: JSON `{ title, description, image, noIndex }`.

El adaptador valida cada bloque contra `SECTIONS` antes de renderizarlo. No se renderiza `content.rendered` ni HTML arbitrario de Gutenberg. Así el CMS no puede saltarse el sistema visual ni introducir scripts en el escaparate.

La primera migración puede importar el JSON de Payload. Antes de entregar WordPress a editores debe generarse una familia de bloques Gutenberg nativos desde el mismo registro; el JSON crudo sirve como puente técnico, no como experiencia editorial final.

## Publicación y vista previa

Al publicar, WordPress hace `POST /next/wordpress-revalidate` con `Authorization: Bearer …` y `{ "slug": "…", "locale": "es" }`. El endpoint solo invalida `page:{slug}` y `pages`.

Para borradores, WordPress abre `/next/wordpress-preview?secret=…&path=/es/ruta`. Next activa Draft Mode y lee REST con un usuario técnico y una Application Password revocable. Las credenciales quedan solo en variables del servidor, siempre sobre HTTPS.

## Activación

1. Alojar WordPress en un subdominio como `cms.courvia.com`, protegido de indexación.
2. Instalar el plugin puente, crear usuario técnico de mínimo privilegio y Application Password.
3. Importar páginas y comparar una previsualización página a página.
4. Configurar las seis variables `WORDPRESS_*` / `COURVIA_EDITORIAL_SOURCE` en un deploy de prueba.
5. Aprobar contenido, accesibilidad, SEO, medios y enlaces.
6. Cambiar la variable a `wordpress`; la reversión es volver a `payload`, sin migración de comercio.

