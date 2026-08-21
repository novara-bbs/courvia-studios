/** Skeleton for the first uncached render of a PDP.
 *
 * It carries `page--pdp` on purpose: a one-column skeleton under a
 * two-column page makes the first paint jump sideways the moment the real
 * markup arrives. The two children mirror the two tracks of the first row. */
export default function Loading() {
  return (
    <main className="page page--pdp" aria-busy="true">
      <div className="pdp-rail">
        <div className="pdp-rail-sticky">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-lead" />
        </div>
      </div>
      <div className="pdp-gallery">
        <div className="skeleton skeleton-block" />
      </div>
    </main>
  );
}
