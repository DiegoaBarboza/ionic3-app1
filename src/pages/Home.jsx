import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
import { createProject, listProjects, restoreProjectFromBackup } from '../data/projects.js';
import { listAllEntriesFinanceiro } from '../data/entries.js';
import { listAllHoursFinanceiro } from '../data/hours.js';
import { listFaturasEmAberto } from '../data/faturas.js';
import { readBackupFile } from '../lib/backup.js';
import { formatMoney, todayLocal } from '../lib/calc.js';
import { financeiroPorProjeto, resumoNegocio } from '../lib/aggregate.js';
import { getPushStatus, pushSupported, subscribeToPush, unsubscribeFromPush } from '../lib/push.js';
import MoneyInput from '../components/MoneyInput.jsx';
import { EVENTO_SINCRONIZADO, ehErroDeRede, estaOffline, guardarCache, lerCache } from '../lib/offline.js';

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

export const STATUS_PROJETO = [
  { value: 'andamento', label: 'Em andamento' },
  { value: 'concluido', label: 'Concluídos' },
  { value: 'arquivado', label: 'Arquivados' },
  { value: 'todos', label: 'Todos' }
];

function semAcento(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function ResumoCard({ label, value, tone, detail }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className={tone ? `money ${tone}` : 'value mono'} style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>
        {value}
      </div>
      {detail && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {detail}
        </div>
      )}
    </div>
  );
}

function formatHoras(h) {
  return `${h.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`;
}

/** Visão geral do negócio: soma de todos os projetos (a receber, atrasos, mês atual x anterior). */
function VisaoGeral({ resumo: r }) {
  const mes = MESES[new Date().getMonth()];
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="label" style={{ marginBottom: 8 }}>
        Visão geral do negócio
      </div>
      <div className="grid cols-4">
        <ResumoCard
          label="A receber (todos)"
          value={formatMoney(r.aReceber)}
          detail={r.projetosComSaldo ? `em ${r.projetosComSaldo} projeto${r.projetosComSaldo > 1 ? 's' : ''}` : 'tudo recebido'}
        />
        <ResumoCard
          label="Faturas atrasadas"
          value={formatMoney(r.faturasAtrasadas)}
          tone={r.qtdFaturasAtrasadas ? 'negative' : 'positive'}
          detail={
            r.qtdFaturasAtrasadas
              ? `${r.qtdFaturasAtrasadas} fatura${r.qtdFaturasAtrasadas > 1 ? 's' : ''} vencida${r.qtdFaturasAtrasadas > 1 ? 's' : ''}`
              : 'nenhuma em atraso'
          }
        />
        <ResumoCard
          label={`Recebido em ${mes}`}
          value={formatMoney(r.recebidoMes)}
          tone="positive"
          detail={`gastos: ${formatMoney(r.gastoMes)} · mês passado: ${formatMoney(r.recebidoMesAnterior)}`}
        />
        <ResumoCard
          label={`Horas em ${mes}`}
          value={formatHoras(r.horasMes)}
          detail={`mês passado: ${formatHoras(r.horasMesAnterior)}`}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [financeiro, setFinanceiro] = useState({});
  const [atrasadas, setAtrasadas] = useState({});
  const [resumo, setResumo] = useState(null);
  const [offlineDesde, setOfflineDesde] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('andamento');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const contagem = useMemo(() => {
    const c = { andamento: 0, concluido: 0, arquivado: 0, todos: projects.length };
    for (const p of projects) c[p.status || 'andamento']++;
    return c;
  }, [projects]);

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return projects.filter(
      (p) =>
        (filtroStatus === 'todos' || (p.status || 'andamento') === filtroStatus) &&
        (filtroTipo === 'todos' || p.tipo_projeto === filtroTipo) &&
        (!q || semAcento(`${p.name} ${p.client_name} ${p.location}`).includes(q))
    );
  }, [projects, busca, filtroStatus, filtroTipo]);
  const [pushStatus, setPushStatus] = useState('unsupported');
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    window.addEventListener(EVENTO_SINCRONIZADO, refresh);
    return () => window.removeEventListener(EVENTO_SINCRONIZADO, refresh);
  });

  useEffect(() => {
    refresh();
    if (pushSupported()) getPushStatus().then(setPushStatus);
  }, []);

  async function handleTogglePush() {
    setPushBusy(true);
    setError('');
    try {
      if (pushStatus === 'subscribed') {
        await unsubscribeFromPush();
        setPushStatus('unsubscribed');
      } else {
        await subscribeToPush();
        setPushStatus('subscribed');
      }
    } catch (err) {
      setError(err.message);
      setPushStatus(await getPushStatus());
    } finally {
      setPushBusy(false);
    }
  }

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      let projs, entries, hours, faturasAbertas;
      const cacheRapido = estaOffline() ? lerCache('inicio') : null;
      try {
        if (cacheRapido) throw new Error('offline');
        [projs, entries, hours, faturasAbertas] = await Promise.all([
          listProjects(),
          listAllEntriesFinanceiro(),
          listAllHoursFinanceiro(),
          // se a consulta de faturas falhar, a tela continua funcionando
          listFaturasEmAberto().catch(() => [])
        ]);
        guardarCache('inicio', { projs, entries, hours, faturasAbertas });
        setOfflineDesde(null);
      } catch (err) {
        const cache = ehErroDeRede(err) ? lerCache('inicio') : null;
        if (!cache) throw err;
        ({ projs, entries, hours, faturasAbertas } = cache.dados);
        setOfflineDesde(cache.em);
      }
      setProjects(projs);
      const fin = financeiroPorProjeto(projs, entries, hours);
      setFinanceiro(fin);
      const hoje = todayLocal();
      setResumo(resumoNegocio({ entries, hours, faturasAbertas, financeiro: fin, mes: hoje.slice(0, 7), hoje }));
      const porProjeto = {};
      for (const f of faturasAbertas) {
        if (f.vencimento >= hoje) continue;
        const atual = porProjeto[f.project_id] || { qtd: 0, total: 0 };
        porProjeto[f.project_id] = { qtd: atual.qtd + 1, total: atual.total + (Number(f.valor) || 0) };
      }
      setAtrasadas(porProjeto);
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
        {pushSupported() && (
          <button onClick={handleTogglePush} disabled={pushBusy}>
            {pushBusy
              ? 'Aguarde…'
              : pushStatus === 'subscribed'
                ? '🔔 Alertas ativados (tocar p/ desativar)'
                : '🔕 Ativar alertas neste celular'}
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleRestoreFile} />
      </div>

      {error && <p className="error-text">{error}</p>}
      {offlineDesde && (
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          📴 Sem internet — mostrando os dados salvos neste aparelho em{' '}
          {new Date(offlineDesde).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
        </p>
      )}

      {resumo && projects.length > 0 && <VisaoGeral resumo={resumo} />}

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
                  <MoneyInput value={form.hourly_rate} onChange={(v) => setForm({ ...form, hourly_rate: v })} />
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
                <MoneyInput
                  value={form.valor_fixo_projeto}
                  onChange={(v) => setForm({ ...form, valor_fixo_projeto: v })}
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

      {projects.length > 0 && (
        <div className="panel" style={{ marginBottom: 12, padding: 12 }}>
          <div className="btn-row" style={{ marginBottom: 10 }}>
            {STATUS_PROJETO.map((st) => (
              <button
                key={st.value}
                type="button"
                className={filtroStatus === st.value ? 'primary' : ''}
                onClick={() => setFiltroStatus(st.value)}
              >
                {st.label} ({contagem[st.value] || 0})
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div className="field" style={{ flex: '2 1 240px', marginBottom: 0 }}>
              <input
                type="search"
                placeholder="🔍 Buscar por nome, cliente ou local"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                <option value="todos">Todos os tipos</option>
                <option value="servico">Serviço</option>
                <option value="maquina">Construção de máquina</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {!loading && projects.length > 0 && visiveis.length === 0 && (
        <p className="muted">Nenhum projeto encontrado com esses filtros.</p>
      )}

      <div className="grid cols-2">
        {visiveis.map((p) => {
          const fin = financeiro[p.id] || { recebido: 0, aReceber: 0 };
          const atraso = atrasadas[p.id];
          return (
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
                {p.status === 'concluido' && (
                  <span className="badge" style={{ marginLeft: 6, color: '#15803d', borderColor: '#15803d55' }}>
                    ✓ Concluído
                  </span>
                )}
                {p.status === 'arquivado' && (
                  <span className="badge" style={{ marginLeft: 6, color: 'var(--text-dim)' }}>
                    🗄️ Arquivado
                  </span>
                )}
              </div>
              <div className="mono muted" style={{ marginTop: 8 }}>
                {p.tipo_projeto === 'maquina'
                  ? `Valor fixo: ${formatMoney(p.valor_fixo_projeto)}`
                  : `${formatMoney(p.hourly_rate)}/h · ${p.total_hours_sold || 0}h vendidas`}
              </div>
              <div className="form-row" style={{ marginTop: 10, gap: 16 }}>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Recebido
                  </div>
                  <div className="money positive" style={{ fontWeight: 600 }}>
                    {formatMoney(fin.recebido)}
                  </div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    A receber
                  </div>
                  <div className="money" style={{ fontWeight: 600 }}>
                    {formatMoney(fin.aReceber)}
                  </div>
                </div>
              </div>
              {atraso && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(220, 38, 38, 0.08)',
                    color: 'var(--negative)',
                    fontSize: 13,
                    fontWeight: 600
                  }}
                >
                  ⚠️ {atraso.qtd} fatura{atraso.qtd > 1 ? 's' : ''} atrasada{atraso.qtd > 1 ? 's' : ''} ·{' '}
                  {formatMoney(atraso.total)}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
