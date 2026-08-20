# Producto, marca y navegación

> Qué es Courvia, cómo se diseña y cómo se organiza el catálogo y el sitio. Extraído de CLAUDE.md para que la raíz quede solo con reglas permanentes.

---

## 1. Qué es Courvia

**Courvia** (court + vía) — marca de entrenamiento para **deportes de raqueta**. Producto ancla: **robots lanzapelotas** (ticket 900–2.000 €); alrededor: contenido (Academy), equipamiento (Gear) y futuro club.

| Entidad | Rol |
|---|---|
| **Courvia Studios** | Matriz: design system, monorepo, I+D |
| **Courvia Sports** | Entidad comercial (seller of record; cuentas de pago y registros fiscales). **Supuesto: sociedad española** |
| **Courvia Drill** | Robots. Líneas v0.4 (ADR-022): **Tempo** (accuracy-first; Tempo R1 = producto de lanzamiento, packs Ready/Coach/Court) · **Go** (carry-first; Go Pickleball) · **Rally** (duty-first B2B; Rally Station → Motion). "Drills" nombra la biblioteca de rutinas, no un SKU |
| **Courvia Gear** | Palas, raquetas, paddles, bolas, accesorios |
| **Courvia Club** | Futuro club + membresías **Tiza / Arcilla / Oro** |

**Posicionamiento (ADR-10):** especialista de **robots de pádel** en ES/EAU; tenis para el mercado maduro; pickleball como crecimiento en UK/EAU. Naming por deporte: variantes por SKU (Tempo R1 → `TMP-R1-P`; Go → `GO-PB`); los códigos T/P/PB son internos y no se muestran en web (ver §7 y ADR-022).

**Mercados:** España (base) · EAU/Dubái · Reino Unido. **Idiomas:** ES, EN (UK+EAU); AR en fase posterior (legal primero, §9.4).

**Pendiente legal:** verificar marca "Courvia" en OEPM/EUIPO y dominio antes de inversión fuerte.

---

---

## 6. Diseño

Dark-first (volt) · **bento grids** en home y specs · tipografía variable expresiva solo en hero · **liquid glass quirúrgico**: solo nav sticky, overlays y tarjetas sobre imagen, siempre con **respaldo opaco AA** (≥4.5:1) y respeto a `prefers-reduced-motion/transparency`; nunca párrafos sobre glass · firma visual: **trayectoria punteada** (máx. 1 por pantalla) · referencia estética: tenniscore/Courtix (Dribbble) · validar AA en los 3 temas **y en RTL** · los deportes comparten layout y cambian imaginería (variantes de sección, no temas nuevos). Reglas Sí/No por tema en `brand/courvia-guia-de-marca.pdf`.

---

---

## 7. Multideporte: producto y catálogo

**La bola manda sobre el hardware:** tenis (caucho presurizado ~57 g, hasta ~110 km/h) · pádel (similar, menos presión, trayectorias bajas, juego de pared) · pickleball (plástico perforado 22-26 g, red baja → velocidad/elevación reducidas, ruedas suaves). Una máquina de tenis "sirve" para pickleball bajando velocidad, pero degrada la experiencia → **configuración por deporte**.

**Benchmark:** Lobster (líneas por deporte; Lobster Padel ~1.429 $; Pickle 1.139–2.199 $; garantía 2 años, batería/ruedas 6 m), Spinshot (Player ~1.600 $; Pickleball Player dedicada; 2 años, devolución 30 días), Sports Tutor (Multi-Twist multideporte), Tennibot Partner (premium AI), Erne/Titan/Proton (pickleball ~1.000-2.300 $). **Tenis = maduro/comoditizado; pádel = incipiente → océano azul Courvia a 900-1.400 €.**

**Decisión (ADR-04, ejemplos v0.4):** un chasis por línea con **`sport` como atributo de la variante** (Tempo R1 → pádel hoy, tenis tras homologación; el QuickDock cambia capacidad, el cassette deportivo cambia deporte y se hace en hub/fábrica). Límite duro: **pickleball nunca por software** — Go Pickleball es hardware dedicado (garganta, alimentador y ruedas propios). Rechazados: robot universal mediocre y productos independientes sin familia (rompen comparador/analítica). **Gear** facetado por `sport`; bolas de tenis/pádel (presurizadas) y de pickleball (plástico) son consumibles de categorías distintas.

---

---

## 12. Sitemap y navegación (deporte primero)

```
/[locale]/
  /tenis · /padel (★ ES/EAU) · /pickleball     → landings de deporte
  /robots (faceta sport|nivel|precio)
    /robots/drill-one · /drill-pro · /drill-club
  /robots/comparar · /robots/selector (quiz)
  /gear (faceta sport) · /academy (sport, nivel)
  /tecnologia · /financiacion · /club (futuro)
  /soporte (manuales · firmware · garantia · rma · faq)
  /sobre-courvia · /contacto · /distribuidores · /cuenta
  /legal (T&C · privacidad [AR en EAU] · cookies · devoluciones)
```
**Mega-menú:** columna por deporte → Robots/Gear/Academy dentro. Selector país/idioma persistente + moneda ligada a market. **Footer:** Producto · Soporte · Empresa · Newsletter+idioma · franja legal.

---
