import { useEffect, useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import { ensureStagesSeeded, stageColor, stageStatusInfo, sumHoursByStage, updateStage, STAGE_STATUS } from '../data/stages.js';
import { listStageTeam, listPessoas, assignPessoaToStage, removePessoaFromStage } from '../data/pessoas.js';
import { listFornecedores, createFornecedor } from '../data/fornecedores.js';
import {
  ENCOMENDA_STATUS_INFO,
  TIPO_ENCOMENDA,
  createEncomenda,
  deleteEncomenda,
  encomendaStatus,
  listEncomendas,
  updateEncomenda
} from '../data/encomendas.js';
import { formatDate, formatMoney } from '../lib/calc.js';

const emptyEncomenda = {
  descricao: '',
  fornecedor_id: '',
  tipo: 'peca_comprada',
  data_pedido: '',
  prazo_combinado: '',
  data_entrega: '',
  observacoes: ''
};

function isStageAtrasada(stage) {
  const today = new Date().toISOString().slice(0, 10);
  return stage.status !== 'concluida' && stage.planned_end && stage.planned_end < today;
}

function StatusChip({ status }) {
  const info = stageStatusInfo(status);
  return (
    <span
      className="badge"
      style={{ background: `${info.color}22`, borderColor: `${info.color}55`, color: info.color, fontWeight: 600 }}
    >
      {info.label}
    </span>
  );
}

function TeamPicker({ stage, team, pessoas, onAdd, onRemove }) {
  const [pessoaId, setPessoaId] = useState('');
  const stageTeam = team.filter((t) => t.stage_id === stage.id);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {stageTeam.length === 0 && <span className="muted">Sem responsável definido.</span>}
        {stageTeam.map((t) => (
          <span key={t.id} className="badge">
            {t.pessoas?.nome}
            {t.papel ? ` · ${t.papel}` : ''}{' '}
            <button
              className="ghost"
              style={{ padding: '0 2px', marginLeft: 4, fontSize: 11 }}
              onClick={() => onRemove(t.id)}
              title="Remover"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={pessoaId} onChange={(e) => setPessoaId(e.target.value)} style={{ flex: 1 }}>
          <option value="">+ adicionar pessoa…</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} {p.especialidade ? `(${p.especialidade})` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (!pessoaId) return;
            onAdd(stage, pessoaId);
            setPessoaId('');
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function Gantt({ stages }) {
  const withDates = stages.filter((s) => s.planned_start && s.planned_end);
  if (withDates.length === 0) {
    return <p className="muted">Preencha as datas previstas das etapas para ver o cronograma visual.</p>;
  }
  const toTime = (d) => new Date(d + 'T00:00:00').getTime();
  const allDates = stages.flatMap((s) => [s.planned_start, s.planned_end, s.actual_start, s.actual_end]).filter(Boolean);
  const min = Math.min(...allDates.map(toTime));
  const max = Math.max(...allDates.map(toTime));
  const span = Math.max(max - min, 86400000);
  const todayPct = Math.min(100, Math.max(0, ((Date.now() - min) / span) * 100));
  const ticks = buildGanttTicks(min, max);

  const LABEL_W = 190;
  const HEADER_H = 26;
  const ROW_H = 34;
  const chartHeight = HEADER_H + ROW_H * stages.length;

  return (
    <div style={{ minWidth: 680 }}>
      <div style={{ display: 'flex' }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }}>
          <div style={{ height: HEADER_H }} />
          {stages.map((s) => (
            <div key={s.id} style={{ height: ROW_H, display: 'flex', alignItems: 'center', fontSize: 13 }}>
              {s.stage_label}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, position: 'relative', height: chartHeight }}>
          {ticks.map((t, i) => {
            const pct = ((t.getTime() - min) / span) * 100;
            return (
              <div key={i} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0 }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
                <div
                  className="muted"
                  style={{ position: 'absolute', top: 0, left: 4, fontSize: 11, whiteSpace: 'nowrap' }}
                >
                  {ganttTickLabel(t)}
                </div>
              </div>
            );
          })}
          <div
            style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: 'var(--negative)', opacity: 0.6 }}
          />

          {stages.map((s, i) => {
            const hasPlanned = s.planned_start && s.planned_end;
            const hasActual = s.actual_start;
            const pStart = hasPlanned ? ((toTime(s.planned_start) - min) / span) * 100 : 0;
            const pWidth = hasPlanned ? Math.max(1, ((toTime(s.planned_end) - toTime(s.planned_start)) / span) * 100) : 0;
            const aEnd = s.actual_end || new Date().toISOString().slice(0, 10);
            const aStart = hasActual ? ((toTime(s.actual_start) - min) / span) * 100 : 0;
            const aWidth = hasActual ? Math.max(1, ((toTime(aEnd) - toTime(s.actual_start)) / span) * 100) : 0;
            const rowTop = HEADER_H + i * ROW_H;
            return (
              <div key={s.id}>
                {hasPlanned && (
                  <div
                    title={`Previsto: ${formatDate(s.planned_start)} a ${formatDate(s.planned_end)}`}
                    style={{
                      position: 'absolute',
                      left: `${pStart}%`,
                      width: `${pWidth}%`,
                      top: rowTop + 4,
                      height: 10,
                      borderRadius: 4,
                      background: s.color
                    }}
                  />
                )}
                {hasActual && (
                  <div
                    title={`Real: ${formatDate(s.actual_start)}${s.actual_end ? ' a ' + formatDate(s.actual_end) : ' (em andamento)'}`}
                    style={{
                      position: 'absolute',
                      left: `${aStart}%`,
                      width: `${aWidth}%`,
                      top: rowTop + 18,
                      height: 10,
                      borderRadius: 4,
                      background: s.color,
                      opacity: 0.45
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Barra cheia = previsto · barra clara = realizado · linha vermelha = hoje.
      </p>
    </div>
  );
}

const GANTT_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function ganttTickLabel(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${GANTT_MESES[d.getMonth()]}`;
}

/** Marcas verticais do cronograma: semanais se o período for curto, mensais se for longo. */
function buildGanttTicks(min, max) {
  const spanDays = (max - min) / 86400000;
  const ticks = [];
  if (spanDays <= 45) {
    const t = new Date(min);
    t.setHours(0, 0, 0, 0);
    while (t.getTime() <= max) {
      ticks.push(new Date(t));
      t.setDate(t.getDate() + 7);
    }
  } else {
    const t = new Date(min);
    t.setDate(1);
    t.setHours(0, 0, 0, 0);
    while (t.getTime() <= max) {
      ticks.push(new Date(t));
      t.setMonth(t.getMonth() + 1);
    }
  }
  return ticks;
}

export default function MachineProject() {
  const { project } = useProject();
  const [stages, setStages] = useState([]);
  const [team, setTeam] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [horasApontadas, setHorasApontadas] = useState({});
  const [loadingStages, setLoadingStages] = useState(true);
  const [encomendas, setEncomendas] = useState([]);
  const [form, setForm] = useState(emptyEncomenda);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [novoFornecedor, setNovoFornecedor] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadingStages(true);
      try {
        const seeded = await ensureStagesSeeded(project.id);
        const [tm, ps, forn, horas, enc] = await Promise.all([
          listStageTeam(project.id),
          listPessoas(),
          listFornecedores(),
          sumHoursByStage(project.id),
          listEncomendas(project.id)
        ]);
        if (!active) return;
        setStages(seeded.map((s) => ({ ...s, color: stageColor(s.stage_key) })));
        setTeam(tm);
        setPessoas(ps);
        setFornecedores(forn);
        setHorasApontadas(horas);
        setEncomendas(enc);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoadingStages(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [project.id]);

  async function reloadEncomendas() {
    setEncomendas(await listEncomendas(project.id));
  }

  async function reloadFornecedores() {
    setFornecedores(await listFornecedores());
  }

  async function handleStageField(stage, field, value) {
    const updated = await updateStage(stage.id, { [field]: value === '' ? null : value });
    setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...updated, color: s.color } : s)));
  }

  async function handleAddTeam(stage, pessoaId) {
    const row = await assignPessoaToStage(project.id, stage.id, pessoaId);
    setTeam((prev) => [...prev, row]);
  }

  async function handleRemoveTeam(id) {
    await removePessoaFromStage(id);
    setTeam((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleQuickAddFornecedor() {
    if (!novoFornecedor.trim()) return;
    const f = await createFornecedor({ nome: novoFornecedor.trim() });
    setNovoFornecedor('');
    await reloadFornecedores();
    setForm((prev) => ({ ...prev, fornecedor_id: f.id }));
  }

  async function handleEncomendaSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        descricao: form.descricao,
        fornecedor_id: form.fornecedor_id || null,
        tipo: form.tipo,
        data_pedido: form.data_pedido || null,
        prazo_combinado: form.prazo_combinado || null,
        data_entrega: form.data_entrega || null,
        observacoes: form.observacoes || null
      };
      if (editingId) {
        await updateEncomenda(editingId, payload);
      } else {
        await createEncomenda(project.id, payload);
      }
      setEditingId(null);
      setForm(emptyEncomenda);
      await reloadEncomendas();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(e) {
    setEditingId(e.id);
    setForm({
      descricao: e.descricao || '',
      fornecedor_id: e.fornecedor_id || '',
      tipo: e.tipo || 'peca_comprada',
      data_pedido: e.data_pedido || '',
      prazo_combinado: e.prazo_combinado || '',
      data_entrega: e.data_entrega || '',
      observacoes: e.observacoes || ''
    });
  }

  async function handleDeleteEncomenda(id) {
    if (!confirm('Excluir esta encomenda?')) return;
    await deleteEncomenda(id);
    await reloadEncomendas();
  }

  const etapasAtrasadas = stages.filter(isStageAtrasada);
  const encomendasAtrasadas = encomendas.filter((e) => encomendaStatus(e) === 'atrasado');
  const etapasConcluidas = stages.filter((s) => s.status === 'concluida').length;
  const pctConcluido = stages.length ? Math.round((etapasConcluidas / stages.length) * 100) : 0;
  const totalOrcado = stages.reduce((acc, s) => acc + (Number(s.horas_orcadas) || 0), 0);
  const totalApontado = Object.values(horasApontadas).reduce((acc, h) => acc + h, 0);

  return (
    <div>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="label">Valor fixo do projeto</div>
          <div className="value mono">{formatMoney(project.valor_fixo_projeto)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Etapas concluídas</div>
          <div className="value mono">
            {etapasConcluidas}/{stages.length} ({pctConcluido}%)
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Horas orçadas</div>
          <div className="value mono">{totalOrcado}h</div>
        </div>
        <div className="stat-card">
          <div className="label">Horas apontadas</div>
          <div className="value mono">{totalApontado}h</div>
        </div>
      </div>

      {(etapasAtrasadas.length > 0 || encomendasAtrasadas.length > 0) && (
        <div className="panel" style={{ marginBottom: 16, borderColor: 'rgba(220, 38, 38, 0.4)' }}>
          <div className="label" style={{ color: 'var(--negative)', marginBottom: 6 }}>
            ⚠️ Atenção
          </div>
          {etapasAtrasadas.length > 0 && (
            <p style={{ margin: '2px 0' }}>
              {etapasAtrasadas.length} etapa(s) passaram do fim previsto sem concluir:{' '}
              {etapasAtrasadas.map((s) => s.stage_label).join(', ')}.
            </p>
          )}
          {encomendasAtrasadas.length > 0 && (
            <p style={{ margin: '2px 0' }}>
              {encomendasAtrasadas.length} encomenda(s) atrasada(s):{' '}
              {encomendasAtrasadas.map((e) => e.descricao).join(', ')}.
            </p>
          )}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="panel table-scroll" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          Cronograma visual
        </div>
        {loadingStages ? <p className="muted">Carregando…</p> : <Gantt stages={stages} />}
      </div>

      {loadingStages ? (
        <p className="muted">Carregando etapas…</p>
      ) : (
        <div className="grid cols-2" style={{ marginBottom: 16 }}>
          {stages.map((stage) => {
            const apontado = horasApontadas[stage.id] || 0;
            const orcado = Number(stage.horas_orcadas) || 0;
            const pct = orcado > 0 ? Math.min(100, (apontado / orcado) * 100) : 0;
            const over = orcado > 0 && apontado > orcado;
            return (
              <div key={stage.id} className="panel" style={{ borderLeft: `5px solid ${stage.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontWeight: 600 }}>
                    {stage.stage_label}
                    {isStageAtrasada(stage) && <span style={{ color: 'var(--negative)' }}> ⚠️</span>}
                  </div>
                  <StatusChip status={stage.status} />
                </div>

                <div className="field" style={{ marginTop: 10 }}>
                  <label>Status (PDCA)</label>
                  <select value={stage.status} onChange={(e) => handleStageField(stage, 'status', e.target.value)}>
                    {STAGE_STATUS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <div className="field">
                    <label>Início previsto</label>
                    <input
                      type="date"
                      defaultValue={stage.planned_start || ''}
                      onBlur={(e) => handleStageField(stage, 'planned_start', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Fim previsto</label>
                    <input
                      type="date"
                      defaultValue={stage.planned_end || ''}
                      onBlur={(e) => handleStageField(stage, 'planned_end', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Início real</label>
                    <input
                      type="date"
                      defaultValue={stage.actual_start || ''}
                      onBlur={(e) => handleStageField(stage, 'actual_start', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Fim real</label>
                    <input
                      type="date"
                      defaultValue={stage.actual_end || ''}
                      onBlur={(e) => handleStageField(stage, 'actual_end', e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Horas orçadas para esta área</label>
                  <input
                    type="number"
                    step="0.5"
                    defaultValue={stage.horas_orcadas || 0}
                    onBlur={(e) => handleStageField(stage, 'horas_orcadas', Number(e.target.value) || 0)}
                  />
                </div>
                {orcado > 0 && (
                  <>
                    <div className="progress" style={{ marginBottom: 4 }}>
                      <span style={{ width: `${pct}%`, background: over ? 'var(--negative)' : stage.color }} />
                    </div>
                    <p className="muted" style={{ marginBottom: 10 }}>
                      {apontado}h apontadas de {orcado}h orçadas{over ? ' — estourou o orçado' : ''}
                    </p>
                  </>
                )}

                <div className="label" style={{ marginBottom: 6, marginTop: 4 }}>
                  Responsáveis
                </div>
                <TeamPicker stage={stage} team={team} pessoas={pessoas} onAdd={handleAddTeam} onRemove={handleRemoveTeam} />
              </div>
            );
          })}
        </div>
      )}

      <form className="panel" onSubmit={handleEncomendaSubmit} style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          Compras &amp; Usinagem Externa
        </div>
        <div className="form-row">
          <div className="field">
            <label>Descrição</label>
            <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} required />
          </div>
          <div className="field">
            <label>Fornecedor</label>
            <select value={form.fornecedor_id} onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value })}>
              <option value="">— selecione —</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tipo</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {TIPO_ENCOMENDA.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Data do pedido</label>
            <input
              type="date"
              value={form.data_pedido}
              onChange={(e) => setForm({ ...form, data_pedido: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Prazo combinado</label>
            <input
              type="date"
              value={form.prazo_combinado}
              onChange={(e) => setForm({ ...form, prazo_combinado: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Data de entrega (quando chegar)</label>
            <input
              type="date"
              value={form.data_entrega}
              onChange={(e) => setForm({ ...form, data_entrega: e.target.value })}
            />
          </div>
        </div>
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 2 }}>
            <label>Observações</label>
            <input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          <div className="field">
            <label>Fornecedor não está na lista?</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={novoFornecedor}
                onChange={(e) => setNovoFornecedor(e.target.value)}
                placeholder="Nome do fornecedor"
              />
              <button type="button" onClick={handleQuickAddFornecedor}>
                + Cadastrar
              </button>
            </div>
          </div>
        </div>
        <div className="btn-row">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Registrar encomenda'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyEncomenda);
              }}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      <div className="panel table-scroll">
        {encomendas.length === 0 && <p className="muted">Nenhuma encomenda registrada ainda.</p>}
        {encomendas.length > 0 && (
          <table className="hours-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Fornecedor</th>
                <th>Prazo combinado</th>
                <th>Entrega</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {encomendas.map((e) => {
                const st = ENCOMENDA_STATUS_INFO[encomendaStatus(e)];
                return (
                  <tr key={e.id}>
                    <td className="hours-description">{e.descricao}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{e.fornecedores?.nome || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{e.prazo_combinado ? formatDate(e.prazo_combinado) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{e.data_entrega ? formatDate(e.data_entrega) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className={'badge' + (st.tone ? ` ${st.tone}` : '')}>{st.label}</span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="ghost" onClick={() => startEdit(e)}>
                        Editar
                      </button>
                      <button className="ghost danger" onClick={() => handleDeleteEncomenda(e.id)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
