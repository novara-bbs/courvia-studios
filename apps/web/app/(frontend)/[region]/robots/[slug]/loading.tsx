/** Skeleton for the first uncached render of a PDP. */
export default function Loading() {
  return (
    <main className="page" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-lead" />
      <div className="skeleton skeleton-block" />
      <div className="skeleton skeleton-block" />
    </main>
  );
}
