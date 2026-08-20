# ADR-022 — Catálogo real v0.4: líneas Tempo/Go/Rally, régimen de evidencia y gobernanza de medios

- **Fecha:** 20 ago 2026
- **Estado:** aceptada
- **Fuentes:** `Courvia Product Portfolio & Launch Book v0.4` (autoridad de
  arquitectura de producto) · `Product & Brand Concept Book v0.1` (estructura
  web/PDP; superseded donde contradiga al portfolio) · evidence register
  `CV-DATA P2` (estados de verificación por claim y por asset).

## Contexto

El catálogo demo (Drill One / Pro / Club, con precios y specs inventados)
cumplió su función: ejercitar checkout, launchStatus, comparador y JSON-LD.
El Portfolio Master v0.4 define la arquitectura real y **retira el naming
heredado**: la gama One/Pro/Vision desaparece; "Drills" pasa a nombrar la
biblioteca de rutinas; "Court" es un pack, no un chasis; el tenis de mesa
queda **fuera de arquitectura** (asset 12 retirado, solo trazabilidad).

Además, el register impone un régimen duro: **cero claims publicables** (todo
es objetivo interno o dato OEM sin verificar), **corredor de PVP retirado**
(E-004) y **ningún render deriva de golden sample** (E-028).

## Decisión

1. **Catálogo = tres líneas como brands** (faceta, no fork): `tempo`
   (Courvia Tempo, accuracy-first), `go` (Courvia Go, carry-first), `rally`
   (Courvia Rally, duty-first B2B). Productos: **Tempo R1** (pádel; el tenis
   entra tras calibración/homologación), **Go Pickleball** (hardware
   dedicado; nunca conversión por software), **Rally Station** (B2B; Motion y
   Vision son programas posteriores, no promesas). Ready/Coach/Court se
   presentan como packs de Tempo en prosa, sin SKU, precio ni contenido de
   caja (E-030) hasta que el BOM comercial se congele.
2. **Todo `waitlist`, sin precios**: no hay `prices` activos y no se abre
   preorder hasta cruzar DVT + PVT + piloto (regla de cierre del portfolio).
   La captura es la waitlist + landing `lanzamiento-tempo` (patrón ADR-021).
3. **Evidencia como dato de primera clase**: `Spec.evidence` con el ciclo
   `target → factory_claim → sample_tested → pilot_verified → published`.
   La PDP y el comparador etiquetan todo valor no-`published` y la PDP
   imprime la nota explicativa. La etiqueta ES el mecanismo de cumplimiento.
4. **Gobernanza de medios**: `media.evidenceStatus` (`concept | blocked |
   published`) + `kind` + `assetCode` + `caption` localizado. Un asset
   `blocked` (registro: no PDP/campaña/RFQ) se sube para trazabilidad pero
   **el adaptador de commerce lo excluye del storefront** aunque un editor lo
   adjunte. Todo asset no-`published` se pinta con la etiqueta «render
   conceptual» (E-028). Los originales optimizados viven congelados en
   `brand/product-renders/` con su `manifest.json` de estados.
5. **Galería canónica de PDP** (brand book §26, adaptada a pre-launch):
   hero → detalle/QuickDock → diagrama CGI de objetivos. Los bloques
   IncludedInBox y Finance quedan fuera hasta que BOM y precios existan.

## Consecuencias

- El copy del sitio no puede afirmar cifras sin estado: los seeds y el chrome
  se reescribieron con la voz «cumplir antes de prometer».
- Un dato que ascienda de estado (p. ej. `sample_tested`) se cambia en el
  admin, fila a fila; subir algo a `published` exige la revisión
  exacta de hardware que describe el register — no es un cambio de copy.
- La fotografía real de muestra final sustituirá a los renders antes de
  venta (`evidenceStatus: published`); el chip de render conceptual
  desaparece solo entonces.
- El naming heredado (Drill One/Pro/Club) se retira de docs y ejemplos;
  «Drill» sobrevive únicamente como entidad societaria y como nombre de la
  biblioteca de rutinas (Courvia Drills).
