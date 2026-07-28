import { useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import { updateProject } from '../data/projects.js';
import { createHours, deleteHours, updateHours } from '../data/hours.js';
import { calcHoras, formatDate, formatMoney } from '../lib/calc.js';
import { sumHours } from '../lib/aggregate.js';
import { buildHoursReportHtml, downloadHtml } from '../lib/report.js';
import StatCard from '../components/StatCard.jsx';

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  start_time: '08:00',
  end_time: '17:00',
  lunch: true,
  description: ''
};

export default function Hours() {
  const { project, hours, setProject, reloadProject } = useProject();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [contract, setContract] = useState({
    hourly_rate: project.hourly_rate ?? 0,
    total_hours_sold: project.total_hours_sold ?? 0
  });

  const preview = calcHoras(form.start_time, form.end_time, form.lunch);
  const consumidas = sumHours(hours);
  const vendidas = Number(project.total_hours_sold) || 0;
  const restantes = Math.max(0, vendidas - consumidas);

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
        description: form.description || null
      };
      if (editingId) {
        await updateHours(editingId, payload);
      } else {
        await createHours(project.id, payload);
      }
      setEditingId(null);
      setForm(emptyForm);
      await reloadProject();
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
      description: h.description || ''
    });
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta jornada?')) return;
    await deleteHours(id);
    await reloadProject();
  }

  function handlePrint() {
    const html = buildHoursReportHtml({ project, hours });
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

  function handleDownloadHtml() {
    const html = buildHoursReportHtml({ project, hours });
    downloadHtml(`relatorio-horas-${project.name.toLowerCase().replace(/\s+/g, '-')}.html`, html);
  }

  return (
    <div>
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
        <p className="muted">
          Horas calculadas: <span className="mono">{preview}h</span>
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

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button onClick={handlePrint}>🖨️ Imprimir / salvar como PDF</button>
        <button onClick={handleDownloadHtml}>⬇️ Baixar relatório (HTML)</button>
      </div>

      <div className="panel table-scroll">
        {hours.length === 0 && <p className="muted">Nenhuma jornada registrada.</p>}
        {hours.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Almoço</th>
                <th>Horas</th>
                <th>Descrição</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h.id}>
                  <td>{formatDate(h.date)}</td>
                  <td>{h.start_time}</td>
                  <td>{h.end_time}</td>
                  <td>{h.lunch ? 'Sim' : 'Não'}</td>
                  <td className="mono">{h.hours}h</td>
                  <td>{h.description}</td>
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
