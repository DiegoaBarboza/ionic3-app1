import { useEffect, useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import { ensureStagesSeeded, updateStage } from '../data/stages.js';
import {
  ENCOMENDA_STATUS_INFO,
  TIPO_ENCOMENDA,
  createEncomenda,
  deleteEncomenda,
  encomendaStatus,
  listEncomendas,
  updateEncomenda
} from '../data/encomendas.js';
import { formatDate } from '../lib/calc.js';

const STAGE_STATUS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'bloqueada', label: 'Bloqueada' }
];

const emptyEncomenda = {
  descricao: '',
  fornecedor: '',
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

export default function MachineProject() {
  const { project } = useProject();
  const [stages, setStages] = useState([]);
  const [loadingStages, setLoadingStages] = useState(true);
  const [encomendas, setEncomendas] = useState([]);
  const [form, setForm] = useState(emptyEncomenda);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadingStages(true);
      try {
        const seeded = await ensureStagesSeeded(project.id);
        if (active) setStages(seeded);
        const enc = await listEncomendas(project.id);
        if (active) setEncomendas(enc);
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

  async function handleStageField(stage, field, value) {
    const updated = await updateStage(stage.id, { [field]: value || null });
    setStages((prev) => prev.map((s) => (s.id === stage.id ? updated : s)));
  }

  async function handleEncomendaSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        descricao: form.descricao,
        fornecedor: form.fornecedor || null,
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
      fornecedor: e.fornecedor || '',
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

  return (
    <div>
      {(etapasAtrasadas.length > 0 || encomendasAtrasadas.length > 0) && (
        <div className="panel" style={{ marginBottom: 16, borderColor: 'rgba(220, 38, 38, 0.4)' }}>
          <div className="label" style={{ color: 'var(--negative)', marginBottom: 6 }}>
            ⚠️ Atenção
          </div>
          {etapasAtrasadas.length > 0 && (
            <p style={{ margin: '2px 0' }}>
              {etapasAtrasadas.length} etapa(s) passaram do fim previsto e ainda não foram concluídas:{' '}
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
          Etapas do projeto
        </div>
        {loadingStages ? (
          <p className="muted">Carregando etapas…</p>
        ) : (
          <table className="hours-table">
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Status</th>
                <th>Início previsto</th>
                <th>Fim previsto</th>
                <th>Início real</th>
                <th>Fim real</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.id}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: isStageAtrasada(s) ? 600 : 400 }}>
                    {s.stage_label}
                    {isStageAtrasada(s) && <span style={{ color: 'var(--negative)' }}> ⚠️</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <select value={s.status} onChange={(e) => handleStageField(s, 'status', e.target.value)}>
                      {STAGE_STATUS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <input
                      type="date"
                      defaultValue={s.planned_start || ''}
                      onBlur={(e) => handleStageField(s, 'planned_start', e.target.value)}
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <input
                      type="date"
                      defaultValue={s.planned_end || ''}
                      onBlur={(e) => handleStageField(s, 'planned_end', e.target.value)}
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <input
                      type="date"
                      defaultValue={s.actual_start || ''}
                      onBlur={(e) => handleStageField(s, 'actual_start', e.target.value)}
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <input
                      type="date"
                      defaultValue={s.actual_end || ''}
                      onBlur={(e) => handleStageField(s, 'actual_end', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
            <input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
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
        <div className="field">
          <label>Observações</label>
          <input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
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
                    <td style={{ whiteSpace: 'nowrap' }}>{e.fornecedor || '—'}</td>
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
