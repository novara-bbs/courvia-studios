/** Skeleton for the first uncached render of the catalog grid. */
export default function Loading() {
  return (
    <main className="page" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-lead" />
      <div className="catalog-grid">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
    </main>
  );
}
