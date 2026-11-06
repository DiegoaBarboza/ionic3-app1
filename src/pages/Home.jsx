import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
import { createProject, listProjects, restoreProjectFromBackup } from '../data/projects.js';
import { readBackupFile } from '../lib/backup.js';
import { formatMoney } from '../lib/calc.js';

const emptyForm = {
  name: '',
  client_name: '',
  location: '',
  client_contact: '',
  hourly_rate: '',
  total_hours_sold: '',
  valor_fixo_projeto: '',
  tipo_projeto: 'servico',
  tipo_controle_horas: 'estimativa'
};

export default function Home() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setProjects(await listProjects());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const project = await createProject({
        name: form.name.trim(),
        client_name: form.client_name.trim(),
        location: form.location.trim(),
        client_contact: form.client_contact.trim(),
        hourly_rate: form.hourly_rate === '' ? 0 : Number(form.hourly_rate),
        total_hours_sold: form.total_hours_sold === '' ? 0 : Number(form.total_hours_sold),
        valor_fixo_projeto: form.valor_fixo_projeto === '' ? null : Number(form.valor_fixo_projeto),
        tipo_projeto: form.tipo_projeto,
        tipo_controle_horas: form.tipo_controle_horas
      });
      setForm(emptyForm);
      setShowForm(false);
      navigate(`/project/${project.id}/dashboard`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRestoreFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRestoring(true);
    setError('');
    try {
      const backup = await readBackupFile(file);
      const project = await restoreProjectFromBackup(backup);
      navigate(`/project/${project.id}/dashboard`);
    } catch (err) {
      setError('Não foi possível restaurar o backup: ' + err.message);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="content" style={{ maxWidth: 900 }}>
      <div className="topbar" style={{ marginBottom: 20, borderRadius: 'var(--radius)' }}>
        <Logo />
        <button className="ghost" onClick={signOut}>
          Sair
        </button>
      </div>

      <div className="btn-row" style={{ marginBottom: 16 }}>
        <button className="primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : '+ Criar novo projeto'}
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={restoring}>
          {restoring ? 'Restaurando…' : 'Restaurar projeto de backup (JSON)'}
        </button>
        <button onClick={() => navigate('/cadastros')}>👥 Fornecedores &amp; Equipe</button>
        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleRestoreFile} />
      </div>

      {error && <p className="error-text">{error}</p>}

      {showForm && (
        <form className="panel" onSubmit={handleCreate} style={{ marginBottom: 20 }}>
          <div className="form-row">
            <div className="field">
              <label>Nome do projeto *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Cliente</label>
              <input
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Local</label>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="field">
              <label>Contato do cliente</label>
              <input
                value={form.client_contact}
                onChange={(e) => setForm({ ...form, client_contact: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Tipo de projeto</label>
              <select
                value={form.tipo_projeto}
                onChange={(e) => setForm({ ...form, tipo_projeto: e.target.value })}
              >
                <option value="servico">Serviço (programação de robô/CLP em campo)</option>
                <option value="maquina">Construção de máquinas / células robotizadas</option>
              </select>
            </div>
            {form.tipo_projeto === 'servico' ? (
              <>
                <div className="field">
                  <label>Valor da hora (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.hourly_rate}
                    onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Total de horas vendidas</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.total_hours_sold}
                    onChange={(e) => setForm({ ...form, total_hours_sold: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Controle de horas</label>
                  <select
                    value={form.tipo_controle_horas}
                    onChange={(e) => setForm({ ...form, tipo_controle_horas: e.target.value })}
                  >
                    <option value="estimativa">Estimativa (orçamento, sem trava)</option>
                    <option value="contratado">Contratado (teto com alerta de estouro)</option>
                  </select>
                </div>
              </>
            ) : (
              <div className="field">
                <label>Valor fixo do projeto (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.valor_fixo_projeto}
                  onChange={(e) => setForm({ ...form, valor_fixo_projeto: e.target.value })}
                  placeholder="Preço fechado combinado com o cliente"
                />
              </div>
            )}
          </div>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Criando…' : 'Criar projeto'}
          </button>
        </form>
      )}

      {loading && <p className="muted">Carregando projetos…</p>}

      {!loading && projects.length === 0 && <p className="muted">Nenhum projeto ainda. Crie o primeiro acima.</p>}

      <div className="grid cols-2">
        {projects.map((p) => (
          <button
            key={p.id}
            className="panel"
            style={{ textAlign: 'left', cursor: 'pointer' }}
            onClick={() => navigate(`/project/${p.id}/dashboard`)}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
            <div className="muted">
              {p.client_name || 'Sem cliente'} {p.location ? `· ${p.location}` : ''}
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="badge">{p.tipo_projeto === 'maquina' ? 'Construção de máquina' : 'Serviço'}</span>
            </div>
            <div className="mono muted" style={{ marginTop: 8 }}>
              {p.tipo_projeto === 'maquina'
                ? `Valor fixo: ${formatMoney(p.valor_fixo_projeto)}`
                : `${formatMoney(p.hourly_rate)}/h · ${p.total_hours_sold || 0}h vendidas`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
