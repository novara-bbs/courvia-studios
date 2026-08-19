import { THEME_ALIASES } from "@courvia/design-tokens";
import { Badge, Button, Card } from "@courvia/ui";

import { setTheme } from "./actions";

const THEME_LABELS: Record<keyof typeof THEME_ALIASES, string> = {
  volt: "Volt Precision",
  carbon: "Carbon Drive",
  club: "Club Real",
};

export default function HomePage() {
  return (
    <main className="page">
      <header className="hero">
        <Badge variant="accent">Courvia · fundaciones S0</Badge>
        <h1>
          Courvia<span className="ball" aria-hidden="true" />
        </h1>
        <p className="lead">
          Entrenamiento para deportes de raqueta: robots lanzapelotas, equipamiento y
          academy. Tres temas, un solo sistema de tokens.
        </p>
      </header>

      <Card>
        <h2>Sistema de temas</h2>
        <p>
          El tema activo se fija en el servidor (<code>data-theme</code> en{" "}
          <code>&lt;html&gt;</code>) a partir de la cookie <code>cv-theme</code>: sin FOUC.
          Cambia de tema y observa que todos los componentes se re-visten solo con
          variables <code>--cv-*</code>.
        </p>
        <form action={setTheme} className="theme-switcher">
          {(Object.keys(THEME_ALIASES) as Array<keyof typeof THEME_ALIASES>).map(
            (alias) => (
              <Button key={alias} type="submit" name="theme" value={alias} variant="ghost">
                {THEME_LABELS[alias]}
              </Button>
            ),
          )}
        </form>
      </Card>

      <Card>
        <h2>Componentes @courvia/ui</h2>
        <div className="samples">
          <Button variant="primary">Reservar Drill Pro</Button>
          <Button variant="ghost">Ver rutinas</Button>
          <Badge>Drill Series</Badge>
          <Badge variant="accent">Feed 04 · Topspin</Badge>
        </div>
      </Card>

      <footer className="foot">
        <p>
          Roadmap CLAUDE.md §16 · monorepo pnpm + Turborepo · tokens DTCG canónicos en{" "}
          <code>brand/courvia-tokens.json</code>
        </p>
      </footer>
    </main>
  );
}
