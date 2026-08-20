# ADR-023 — Vocabulario de composición: por qué no hay bloque de HTML libre

- **Fecha:** 20 ago 2026
- **Estado:** aceptada
- **Contexto de la pregunta:** «¿cómo se hacen landings muy visuales desde el
  CMS? ¿hay bloques de HTML o CSS libre?»

## Qué hace el resto del sector

Todos los constructores tienen una vía de escape, y todos la acotan:

| Plataforma | Vía de escape | Su propia guía |
|---|---|---|
| Shopify | **Custom Liquid** | «para añadidos rápidos y puntuales»; lo reutilizable va en *sections* con `{% schema %}` |
| WordPress | **Custom HTML** | el flujo recomendado es `theme.json` (tokens) → *block patterns* → plantillas bloqueadas |
| Webflow | **Code Embed** | HTML + `<style>` + `<script>`, tope de 50.000 caracteres; más grande, se aloja fuera |
| Builder.io | componentes React registrados | tiene **components-only mode** justo para *impedir* el estilado ad-hoc |
| Storyblok | *bloks* ↔ componentes | la abstracción mal hecha «se rompe cada vez que un dev toca un componente» |

Conclusión: el HTML libre existe para lo puntual y de terceros, no es lo que
hace que una landing deje de parecer genérica. Lo que la hace no genérica es
**vocabulario**: más secciones con carácter y más controles de diseño por
sección.

## Decisión

1. **No hay bloque de HTML/CSS/JS libre.** Rompería a la vez las cuatro
   garantías del sistema: contraste AA por construcción (los fondos
   `inverse`/`accent` rebindean los roles de texto), RTL (propiedades
   lógicas), los tres temas, y la superficie de inyección — el contenido del
   CMS pasaría a ejecutar en el origen del sitio.
2. **La vía de escape es un `embed` por proveedor**, no por marcado: el
   editor elige `youtube | vimeo` y pega un **id**; la URL se construye en
   código contra una lista blanca y el id se valida por patrón. Cubre el caso
   honesto (un vídeo de lanzamiento) sin superficie de inyección.
3. **La potencia visual llega por vocabulario**, en dos ejes:
   - **Controles de diseño nuevos** (enums ligados a tokens, como el resto):
     `height` (auto/tall/full, en `svh`), `overlay` (velo mezclado *desde* el
     rol de fondo del propio tema con `color-mix`, así el scrim es azul en
     volt y hueso en carbon) y `reveal` (entrada ligada al scroll).
   - **Secciones nuevas**: `stage` (escena a sangre con media y velo),
     `statBand` (cifras con su estado), `timeline` (secuencia real: las
     puertas de validación), `gallery` (rejilla con pies) y `embed`.
4. **`reveal` no anima opacidad, solo transform.** Una `view()` timeline que
   no avanza —página que no llega a hacer scroll, runner de capturas, rareza
   de navegador— dejaría la sección clavada en su estado inicial: con
   opacidad, eso es una banda en blanco para un cliente. El peor fallo
   posible debe ser «la sección aparece 24 px más abajo».
5. **La gobernanza de medios viaja con el activo, no con la sección**:
   `mediaValue()` devuelve `null` para un asset que el registro marca
   `blocked` (no renderiza en ninguna parte) y marca `concept` en todo lo que
   no sea fotografía final, para que la etiqueta «render conceptual» sea
   automática en PDP, escenas, galerías y splits.

## Consecuencias

- Un editor puede montar una landing con carácter (escena a sangre, tema
  carbon anidado, cifras, hitos, galería, vídeo) sin escribir una línea, y
  sin poder producir una combinación ilegible.
- Cuando falte una pieza visual, la respuesta es **una sección nueva** (una
  declaración en el registro: contrato Zod + bloque de Payload + render), no
  un hueco de HTML. Es el mismo camino que recomiendan Shopify y WordPress.
- Si algún día hace falta incrustar algo de un cuarto proveedor, se añade a
  la lista blanca de `embed`; sigue sin haber marcado libre.
