import { useEffect, useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { updateProject } from '../data/projects.js';
import { createHours, deleteHours, updateHours } from '../data/hours.js';
import { calcHoras, calcReembolso, formatDateShort, formatMoney } from '../lib/calc.js';
import { sumHours } from '../lib/aggregate.js';
import { buildActivityReportHtml, buildHoursReportHtml } from '../lib/report.js';
import { ensureStagesSeeded, stageColor } from '../data/stages.js';
import StatCard from '../components/StatCard.jsx';

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  start_time: '08:00',
  end_time: '17:00',
  lunch: true,
  description: '',
  km_ida: '',
  km_volta: '',
  valor_km: '',
  pedagio: '',
  stage_id: ''
};

export default function Hours() {
  const { project, hours, setProject, reloadProject } = useProject();
  const isMaquina = project.tipo_projeto === 'maquina';
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [contract, setContract] = useState({
    hourly_rate: project.hourly_rate ?? 0,
    total_hours_sold: project.total_hours_sold ?? 0
  });
  const [printStart, setPrintStart] = useState('');
  const [printEnd, setPrintEnd] = useState('');
  const [stages, setStages] = useState([]);

  useEffect(() => {
    if (!isMaquina) return;
    let active = true;
    ensureStagesSeeded(project.id).then((s) => {
      if (active) setStages(s.map((st) => ({ ...st, color: stageColor(st.stage_key) })));
    });
    return () => {
      active = false;
    };
  }, [project.id, isMaquina]);

  function stageLabel(stageId) {
    return stages.find((s) => s.id === stageId)?.stage_label || '—';
  }

  const preview = calcHoras(form.start_time, form.end_time, form.lunch);
  const reembolsoPreview = calcReembolso(form);
  const consumidas = sumHours(hours);
  const vendidas = Number(project.total_hours_sold) || 0;
  const restantes = Math.max(0, vendidas - consumidas);

  /**
   * Dispara o agente autônomo (Edge Function + Gemini) que analisa as
   * descrições diárias e preenche pendências/sugestões/dificuldades/atraso
   * do relatório de finalização. Roda em segundo plano a cada lançamento de
   * horas; falha silenciosa para nunca travar o registro da jornada.
   */
  function triggerServiceReportAgent() {
    supabase.functions.invoke('analyze-service-report', { body: { project_id: project.id } }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Agente de relatório indisponível:', err);
    });
  }

  async function saveContract() {
    const updated = await updateProject(project.id, {
      hourly_rate: Number(contract.hourly_rate) || 0,
      total_hours_sold: Number(contract.total_hours_sold) || 0
    });
    setProject(updated);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        lunch: form.lunch,
        hours: calcHoras(form.start_time, form.end_time, form.lunch),
        description: form.description || null,
        km_ida: Number(form.km_ida) || 0,
        km_volta: Number(form.km_volta) || 0,
        valor_km: Number(form.valor_km) || 0,
        pedagio: Number(form.pedagio) || 0,
        stage_id: isMaquina ? form.stage_id || null : null
      };
      if (editingId) {
        await updateHours(editingId, payload);
      } else {
        await createHours(project.id, payload);
      }
      setEditingId(null);
      setForm(emptyForm);
      await reloadProject();
      if (project.tipo_projeto === 'servico') triggerServiceReportAgent();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(h) {
    setEditingId(h.id);
    setForm({
      date: h.date,
      start_time: h.start_time,
      end_time: h.end_time,
      lunch: h.lunch,
      description: h.description || '',
      km_ida: h.km_ida || '',
      km_volta: h.km_volta || '',
      valor_km: h.valor_km || '',
      pedagio: h.pedagio || '',
      stage_id: h.stage_id || ''
    });
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta jornada?')) return;
    await deleteHours(id);
    await reloadProject();
  }

  function handlePrint() {
    const filtered = hours.filter((h) => (!printStart || h.date >= printStart) && (!printEnd || h.date <= printEnd));
    const html = buildHoursReportHtml({
      project,
      hours: filtered,
      periodStart: printStart || null,
      periodEnd: printEnd || null
    });
    const win = window.open('', '_blank');
    if (!win) {
      setError('Não foi possível abrir a janela de impressão. Verifique se o navegador está bloqueando pop-ups.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  }

  function handlePrintActivityReport() {
    const html = buildActivityReportHtml({ project, hours });
    const win = window.open('', '_blank');
    if (!win) {
      setError('Não foi possível abrir a janela de impressão. Verifique se o navegador está bloqueando pop-ups.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  }

  return (
    <div>
      {isMaquina ? (
        <div className="grid cols-4" style={{ marginBottom: 16 }}>
          {stages.map((s) => {
            const apontado = hours.filter((h) => h.stage_id === s.id).reduce((acc, h) => acc + (Number(h.hours) || 0), 0);
            const orcado = Number(s.horas_orcadas) || 0;
            if (orcado === 0 && apontado === 0) return null;
            return (
              <div key={s.id} className="stat-card" style={{ borderLeft: `4px solid ${s.color}` }}>
                <div className="label">{s.stage_label}</div>
                <div className="value mono">
                  {apontado}h{orcado > 0 ? ` / ${orcado}h` : ''}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="form-row">
              <div className="field">
                <label>Valor da hora (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={contract.hourly_rate}
                  onChange={(e) => setContract({ ...contract, hourly_rate: e.target.value })}
                  onBlur={saveContract}
                />
              </div>
              <div className="field">
                <label>Total de horas vendidas</label>
                <input
                  type="number"
                  step="0.5"
                  value={contract.total_hours_sold}
                  onChange={(e) => setContract({ ...contract, total_hours_sold: e.target.value })}
                  onBlur={saveContract}
                />
              </div>
            </div>
          </div>

          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            <StatCard label="Vendidas" value={`${vendidas}h`} />
            <StatCard label="Consumidas" value={`${consumidas}h`} />
            <StatCard label="Restantes" value={`${restantes}h`} />
            <StatCard label="Valor por hora" value={formatMoney(project.hourly_rate)} />
          </div>
        </>
      )}

      <form className="panel" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div className="field">
            <label>Data</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div className="field">
            <label>Início</label>
            <input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Fim</label>
            <input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <div className="checkbox-row">
              <input
                type="checkbox"
                id="lunch"
                checked={form.lunch}
                onChange={(e) => setForm({ ...form, lunch: e.target.checked })}
              />
              <label htmlFor="lunch">Teve almoço (-1h)</label>
            </div>
          </div>
        </div>
        <div className="field">
          <label>Descrição da atividade</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        {isMaquina && (
          <div className="field">
            <label>Área</label>
            <select value={form.stage_id} onChange={(e) => setForm({ ...form, stage_id: e.target.value })} required>
              <option value="">— selecione a área —</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.stage_label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-row">
          <div className="field">
            <label>KM de ida</label>
            <input
              type="number"
              step="0.1"
              value={form.km_ida}
              onChange={(e) => setForm({ ...form, km_ida: e.target.value })}
            />
          </div>
          <div className="field">
            <label>KM de volta</label>
            <input
              type="number"
              step="0.1"
              value={form.km_volta}
              onChange={(e) => setForm({ ...form, km_volta: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Valor por KM (R$)</label>
            <input
              type="number"
              step="0.01"
              value={form.valor_km}
              onChange={(e) => setForm({ ...form, valor_km: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Pedágio do dia (R$)</label>
            <input
              type="number"
              step="0.01"
              value={form.pedagio}
              onChange={(e) => setForm({ ...form, pedagio: e.target.value })}
            />
          </div>
        </div>
        <p className="muted">
          Horas calculadas: <span className="mono">{preview}h</span> · Reembolso de deslocamento:{' '}
          <span className="mono">{formatMoney(reembolsoPreview)}</span>
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="btn-row">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Registrar jornada'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="form-row" style={{ marginBottom: 12 }}>
          <div className="field">
            <label>Período do relatório — data inicial</label>
            <input type="date" value={printStart} onChange={(e) => setPrintStart(e.target.value)} />
          </div>
          <div className="field">
            <label>Período do relatório — data final</label>
            <input type="date" value={printEnd} onChange={(e) => setPrintEnd(e.target.value)} />
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Deixe em branco para imprimir todas as jornadas registradas.
        </p>
        <div className="btn-row">
          <button onClick={handlePrint}>🖨️ Imprimir / salvar como PDF</button>
          {project.tipo_projeto === 'servico' && (
            <button onClick={handlePrintActivityReport}>📋 Relatório de Atividades (finalização)</button>
          )}
        </div>
      </div>

      <div className="panel table-scroll">
        {hours.length === 0 && <p className="muted">Nenhuma jornada registrada.</p>}
        {hours.length > 0 && (
          <table className="hours-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Horas</th>
                <th>Descrição</th>
                {isMaquina && <th>Área</th>}
                <th>Início</th>
                <th>Fim</th>
                <th>Almoço</th>
                <th>Reembolso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDateShort(h.date)}</td>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                    {h.hours}h
                  </td>
                  <td className="hours-description">{h.description}</td>
                  {isMaquina && <td style={{ whiteSpace: 'nowrap' }}>{stageLabel(h.stage_id)}</td>}
                  <td style={{ whiteSpace: 'nowrap' }}>{h.start_time}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{h.end_time}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{h.lunch ? 'Sim' : 'Não'}</td>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                    {calcReembolso(h) > 0 ? formatMoney(calcReembolso(h)) : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="ghost" onClick={() => startEdit(h)}>
                      Editar
                    </button>
                    <button className="ghost danger" onClick={() => handleDelete(h.id)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
