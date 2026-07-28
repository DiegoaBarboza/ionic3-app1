export default function StatCard({ label, value, tone }) {
  const cls = tone ? `money ${tone}` : 'value';
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className={tone ? cls : 'value mono'}>{value}</div>
    </div>
  );
}
