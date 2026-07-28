export default function Logo({ withText = true, height = 32 }) {
  return (
    <div className="brand">
      <img src="/logo-zenite.svg" alt="Zênite Robótica" height={height} />
      {withText && <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>Zênite Financeiro</span>}
    </div>
  );
}
