/** While the squad loads from FPL: the dugout's shape, in dark plates. */
export default function Loading() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading your team">
      <div className="skel" style={{ width: 160, height: 14, marginBottom: 14 }} />
      <div className="skel" style={{ width: "min(420px, 80%)", height: 52, marginBottom: 28 }} />
      <div className="dugout-skel">
        <div className="skel" style={{ height: 620 }} />
        <div className="skel" style={{ height: 620 }} />
      </div>
    </div>
  );
}
