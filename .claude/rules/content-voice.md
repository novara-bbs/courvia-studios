# Voz, copy y "que no parezca hecho por IA"

Aplica a todo texto visible (mensajes next-intl, contenido de ejemplo, copy de
secciones) y a toda decisión visual nueva. La fuente de la voz es
`brand/courvia-guia-de-marca.pdf` y los brand boards; esto es su destilado
operativo.

## Qué significa "parece IA" — y cómo se evita

Lo que delata una web generada no es una tecnología: son tics. Los prohibidos
aquí, cada uno con su reemplazo:

| Tic de IA | En su lugar |
|---|---|
| "¡Descubre X!", "Bienvenido a", "Explora nuestra gama" | Frase corta en segunda persona sobre el efecto en el jugador: "Tu revés mejora esta semana" |
| Adjetivos vacíos ("increíble", "revolucionario", "de última generación") | Un dato con unidad: "72 km/h con topspin", "140 pelotas por carga". **Si no se mide, no se afirma** (regla de la guía carbon) |
| Emojis en la interfaz o en titulares | Nunca. La telemetría (chips mono en mayúsculas) es la firma visual, no los emojis |
| Exclamaciones acumuladas | Como mucho una por página, y casi nunca |
| Listas de tres beneficios genéricos que valdrían para cualquier producto | Especificidad de deporte: la bola de pádel bota distinto y el copy lo sabe |
| Degradados morados/azul-cian por defecto, glassmorphism en todo | Solo tokens de tema; liquid glass quirúrgico (nav/overlays), nunca párrafos sobre glass |
| Fotos de stock genéricas de "gente sonriendo con raqueta" | Producto sobre fondo de material (aluminio/carbono) o pista real; cotas y esquemas técnicos |
| Guiones largos como muleta de ritmo en cada frase | Frases cortas. Punto y seguido |

## La voz por tema (de los brand boards)

- **volt** (sitio principal): entrenadora, no vendedora. Datos, no humo.
  Segunda persona, presente: cada mensaje empuja a la siguiente sesión.
- **carbon** (fabricante): manual técnico con orgullo de taller. Materiales,
  tolerancias, revisiones. Sin adjetivos que no se puedan medir. La garantía y
  la reparabilidad son parte del relato.
- **club**: compañero de pista. Rituales, no promociones ("la liga de los
  jueves"). El robot es el sparring del club, no un gadget.

## Reglas mecánicas

- Ninguna cadena visible vive en un componente: mensajes next-intl (chrome) o
  campos localizados de Payload (contenido). Lo verifica el lint.
- El árabe no es una traducción automática pegada: números en cifras arábigas
  orientales cuando el contexto lo pida, y jamás mezclar dirección de texto a
  mano — el layout ya es RTL por `dir`.
- Los tres idiomas dicen lo mismo con la misma voz, no palabra por palabra.
  Traducir "Tu revés mejora esta semana" literalmente al inglés funciona;
  cuando no funcione, gana la voz sobre la literalidad.
