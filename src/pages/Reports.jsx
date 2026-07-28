import { useMemo, useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import { formatMoney } from '../lib/calc.js';
import { computeTotals, rankingByCategory, sumHours } from '../lib/aggregate.js';
import StatCard from '../components/StatCard.jsx';

export default function Reports() {
  const { project, entries, hours } = useProject();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => (!start || e.date >= start) && (!end || e.date <= end));
  }, [entries, start, end]);

  const filteredHours = useMemo(() => {
    return hours.filter((h) => (!start || h.date >= start) && (!end || h.date <= end));
  }, [hours, start, end]);

  const totals = computeTotals(filteredEntries);
  const horasPeriodo = sumHours(filteredHours);
  const ranking = rankingByCategory(filteredEntries);
  const horasConsumidasTotal = sumHours(hours);
  const vendidas = Number(project.total_hours_sold) || 0;
  const valorContrato = vendidas * (Number(project.hourly_rate) || 0);

  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div className="field">
            <label>Data inicial</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label>Data final</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <label>&nbsp;</label>
            <button
              type="button"
              onClick={() => {
                setStart('');
                setEnd('');
              }}
            >
              Limpar período
            </button>
          </div>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="Receita no período" value={formatMoney(totals.receita)} tone="positive" />
        <StatCard label="Gasto no período" value={formatMoney(totals.gasto)} tone="negative" />
        <StatCard label="Lucro no período" value={formatMoney(totals.lucro)} tone={totals.lucro >= 0 ? 'positive' : 'negative'} />
        <StatCard label="Horas no período" value={`${horasPeriodo}h`} />
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <div className="label" style={{ marginBottom: 12 }}>
            Onde estou gastando mais
          </div>
          {ranking.length === 0 && <p className="muted">Sem gastos no período selecionado.</p>}
          {ranking.map((r) => (
            <div key={r.name} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>{r.name}</span>
                <span className="mono">
                  {formatMoney(r.value)} ({r.pct.toFixed(0)}%)
                </span>
              </div>
              <div className="progress">
                <span style={{ width: `${r.pct}%`, background: r.color }} />
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="label" style={{ marginBottom: 12 }}>
            Resumo do contrato de horas
          </div>
          <div className="list-row">
            <span className="muted">Valor da hora</span>
            <span className="mono">{formatMoney(project.hourly_rate)}</span>
          </div>
          <div className="list-row">
            <span className="muted">Horas vendidas no contrato</span>
            <span className="mono">{vendidas}h</span>
          </div>
          <div className="list-row">
            <span className="muted">Horas consumidas (total geral)</span>
            <span className="mono">{horasConsumidasTotal}h</span>
          </div>
          <div className="list-row">
            <span className="muted">Valor total do contrato</span>
            <span className="mono">{formatMoney(valorContrato)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
