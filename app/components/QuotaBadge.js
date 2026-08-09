export default function QuotaBadge({ org }) {
  if (!org) return null;
  const pct = Math.min(100, Math.round((org.quota_calls_used / org.quota_calls_allowed) * 100));
  return (
    <div className="card" style={{ maxWidth: 260 }}>
      <div style={{ fontSize: 13, opacity: 0.7 }}>Usage this period</div>
      <div style={{ fontWeight: 700 }}>{org.quota_calls_used} / {org.quota_calls_allowed} calls</div>
      <div style={{ background: "#262b36", borderRadius: 6, height: 8, marginTop: 6 }}>
        <div style={{ width: `${pct}%`, background: pct > 90 ? "#ff5c5c" : "#4f7cff", height: 8, borderRadius: 6 }} />
      </div>
    </div>
  );
}
