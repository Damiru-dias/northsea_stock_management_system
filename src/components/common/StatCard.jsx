export function StatCard({ label, value, icon, accent, change }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${accent}`}>{icon}</span></div><div className="stat-value">{value ?? "—"}</div><div className="stat-change"><span>↗</span> {change}</div></article>;
}
