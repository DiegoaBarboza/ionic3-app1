import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useProject } from '../context/ProjectContext.jsx';
import { updateProject } from '../data/projects.js';
import { formatMoney } from '../lib/calc.js';
import { computeTotals, monthlyBarData, pieDataByCategory, receitaAReceber, sumHours } from '../lib/aggregate.js';
import StatCard from '../components/StatCard.jsx';

function InlineField({ value, onSave, placeholder }) {
  const [draft, setDraft] = useState(value || '');

  return (
    <input
      className="inline-edit"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== (value || '')) onSave(draft);
      }}
    />
  );
}

export default function Dashboard() {
  const { project, entries, hours, setProject, reloadProject } = useProject();

  async function saveField(field, value) {
    const updated = await updateProject(project.id, { [field]: value });
    setProject(updated);
  }

  const isMaquina = project.tipo_projeto === 'maquina';
  const totals = computeTotals(entries);
  const aReceber = isMaquina
    ? (Number(project.valor_fixo_projeto) || 0) - totals.receita
    : receitaAReceber(entries, hours, project.hourly_rate);
  const lucro = isMaquina ? (Number(project.valor_fixo_projeto) || 0) - totals.gasto : totals.lucro;
  const horasConsumidas = sumHours(hours);
  const horasVendidas = Number(project.total_hours_sold) || 0;
  const pct = horasVendidas > 0 ? Math.min(100, (horasConsumidas / horasVendidas) * 100) : 0;
  const pieData = pieDataByCategory(entries);
  const barData = monthlyBarData(entries);

  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div className="field">
            <label>Cliente</label>
            <InlineField value={project.client_name} placeholder="—" onSave={(v) => saveField('client_name', v)} />
          </div>
          <div className="field">
            <label>Local</label>
            <InlineField value={project.location} placeholder="—" onSave={(v) => saveField('location', v)} />
          </div>
          <div className="field">
            <label>Contato do cliente</label>
            <InlineField
              value={project.client_contact}
              placeholder="—"
              onSave={(v) => saveField('client_contact', v)}
            />
          </div>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        {isMaquina ? (
          <StatCard label="Valor fixo do projeto" value={formatMoney(project.valor_fixo_projeto)} />
        ) : (
          <StatCard label="Receita total" value={formatMoney(totals.receita)} tone="positive" />
        )}
        <StatCard label="Gastos totais" value={formatMoney(totals.gasto)} tone="negative" />
        <StatCard
          label={isMaquina ? 'Lucro projetado' : 'Lucro do projeto'}
          value={formatMoney(lucro)}
          tone={lucro >= 0 ? 'positive' : 'negative'}
        />
        {isMaquina ? (
          <StatCard label="Recebido até agora" value={formatMoney(totals.receita)} tone="positive" />
        ) : (
          <StatCard label="Horas consumidas / vendidas" value={`${horasConsumidas}h / ${horasVendidas}h`} />
        )}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="label">Receita a receber</div>
        <div className={'money' + (aReceber > 0 ? ' positive' : '')} style={{ fontSize: 28, fontWeight: 600, marginTop: 4 }}>
          {formatMoney(Math.max(0, aReceber))}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          {isMaquina
            ? 'Valor fixo do projeto ainda não recebido em lançamentos de receita. Some um lançamento de receita quando o cliente pagar para abater esse valor.'
            : `Horas já lançadas (${horasConsumidas}h × ${formatMoney(project.hourly_rate)}) ainda não recebidas em lançamentos de receita. Some um lançamento de receita quando o cliente pagar para abater esse valor.`}
        </p>
      </div>

      {!isMaquina && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            Consumo de horas do contrato ({pct.toFixed(0)}%)
          </div>
          <div className={'progress' + (pct >= 90 ? ' danger' : '')}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      {isMaquina && (
        <p className="muted" style={{ marginBottom: 16 }}>
          Etapas, equipe, horas por área e cronograma ficam na aba <strong>Construção</strong>.
        </p>
      )}

      <div className="grid cols-2">
        <div className="panel">
          <div className="label" style={{ marginBottom: 12 }}>
            Gastos por categoria
          </div>
          {pieData.length === 0 ? (
            <p className="muted">Sem gastos lançados ainda.</p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="var(--panel)" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatMoney(value)}
                    contentStyle={{ background: '#ffffff', border: '1px solid #d7e0e8', borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="label" style={{ marginBottom: 12 }}>
            Receita vs. gasto por mês
          </div>
          {barData.length === 0 ? (
            <p className="muted">Sem lançamentos ainda.</p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d7e0e8" />
                  <XAxis dataKey="month" tick={{ fill: '#5b6b7a', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#5b6b7a', fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => formatMoney(value)}
                    contentStyle={{ background: '#ffffff', border: '1px solid #d7e0e8', borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="receita" name="Receita" fill="#15803d" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="gasto" name="Gasto" fill="#dc2626" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
