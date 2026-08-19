/**
 * Visible marker while draft mode is on, with the way out. Deliberately
 * unlocalized chrome: it is editor tooling, not site UI.
 */
export function DraftModeBar({ exitPath }: { exitPath: string }) {
  return (
    <div className="draft-bar" role="status">
      <span>Borrador — vista previa</span>
      <a href={`/next/exit-preview?path=${encodeURIComponent(exitPath)}`}>Salir</a>
    </div>
  );
}
