import { useEffect, useRef, useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { getProject, updateProject } from '../data/projects.js';
import { formatDate } from '../lib/calc.js';

const SAVE_DEBOUNCE_MS = 700;

function phaseOf(project, hours) {
  if (project.data_finalizacao && (project.relatorio_pendencias || project.relatorio_sugestoes || project.relatorio_dificuldades)) {
    return 'Finalização';
  }
  if (hours.length > 0 && !project.data_finalizacao) return 'Execução';
  if (project.data_inicio_agendada && project.data_termino_prevista) return 'Cronograma';
  if (project.data_pedido) return 'Pedido';
  if (project.escopo_solicitado) return 'Descoberta & Escopo';
  return 'Descoberta & Escopo';
}

function Field({ label, status, children }) {
  return (
    <div className="field">
      <label>
        {label}
        {status === 'saving' && (
          <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>
            salvando…
          </span>
        )}
        {status === 'saved' && (
          <span className="muted" style={{ marginLeft: 8, fontWeight: 400, color: 'var(--positive)' }}>
            ✓ salvo
          </span>
        )}
        {status === 'erro' && (
          <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--negative)' }}>
            erro ao salvar — tente de novo
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

export default function ServiceProject() {
  const { project, hours, setProject } = useProject();
  const [draft, setDraft] = useState({
    escopo_solicitado: project.escopo_solicitado || '',
    data_pedido: project.data_pedido || '',
    data_inicio_agendada: project.data_inicio_agendada || '',
    data_termino_prevista: project.data_termino_prevista || '',
    data_finalizacao: project.data_finalizacao || '',
    relatorio_pendencias: project.relatorio_pendencias || '',
    relatorio_sugestoes: project.relatorio_sugestoes || '',
    relatorio_dificuldades: project.relatorio_dificuldades || '',
    teve_atraso: project.teve_atraso || false,
    motivo_atraso: project.motivo_atraso || ''
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState('');
  const [saveStatus, setSaveStatus] = useState({});
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const timers = useRef({});
  const statusClearTimers = useRef({});

  // Garante que qualquer edição pendente (debounce ainda não disparado) seja
  // salva se o usuário sair da tela antes dos 700ms — comum no celular,
  // quando o blur do campo não dá tempo de disparar antes da troca de aba.
  useEffect(() => {
    return () => {
      Object.entries(timers.current).forEach(([name, timer]) => {
        clearTimeout(timer);
        const value = draftRef.current[name];
        if (value !== (project[name] || '')) {
          updateProject(project.id, { [name]: value === '' ? null : value }).catch(() => {});
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function saveField(name, value) {
    setSaveStatus((s) => ({ ...s, [name]: 'saving' }));
    try {
      const updated = await updateProject(project.id, { [name]: value === '' ? null : value });
      setProject(updated);
      setSaveStatus((s) => ({ ...s, [name]: 'saved' }));
      clearTimeout(statusClearTimers.current[name]);
      statusClearTimers.current[name] = setTimeout(() => {
        setSaveStatus((s) => ({ ...s, [name]: null }));
      }, 2000);
    } catch (err) {
      setSaveStatus((s) => ({ ...s, [name]: 'erro' }));
    }
  }

  function flushSave(name) {
    clearTimeout(timers.current[name]);
    delete timers.current[name];
    if (draftRef.current[name] !== (project[name] || '')) saveField(name, draftRef.current[name]);
  }

  function field(name) {
    return {
      value: draft[name],
      onChange: (e) => {
        const value = e.target.value;
        setDraft((d) => ({ ...d, [name]: value }));
        clearTimeout(timers.current[name]);
        timers.current[name] = setTimeout(() => flushSave(name), SAVE_DEBOUNCE_MS);
      },
      onBlur: () => flushSave(name)
    };
  }

  async function toggleAtraso(checked) {
    setDraft({ ...draft, teve_atraso: checked });
    await saveField('teve_atraso', checked);
  }

  async function handleAnalyzeNow() {
    setAnalyzing(true);
    setAnalyzeMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('analyze-service-report', {
        body: { project_id: project.id }
      });
      if (error) throw error;
      if (data?.skipped) {
        setAnalyzeMsg(data.reason || 'Nada para analisar ainda.');
      } else if (data?.ok) {
        setDraft({
          ...draft,
          relatorio_pendencias: data.relatorio_pendencias || '',
          relatorio_sugestoes: data.relatorio_sugestoes || '',
          relatorio_dificuldades: data.relatorio_dificuldades || '',
          teve_atraso: data.teve_atraso || false,
          motivo_atraso: data.motivo_atraso || ''
        });
        const updated = await getProject(project.id);
        setProject(updated);
        setAnalyzeMsg('Atualizado pelo agente a partir das descrições de horas.');
      } else {
        setAnalyzeMsg(data?.error || 'Não foi possível analisar agora.');
      }
    } catch (err) {
      setAnalyzeMsg(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  const phase = phaseOf(project, hours);

  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="label">Fase atual</div>
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{phase}</div>
        <p className="muted" style={{ marginTop: 6 }}>
          Calculada a partir dos campos preenchidos abaixo e das horas já lançadas — não precisa marcar manualmente.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          1. Descoberta &amp; Escopo
        </div>
        <Field label="Escopo solicitado pelo cliente" status={saveStatus.escopo_solicitado}>
          <textarea rows={3} {...field('escopo_solicitado')} />
        </Field>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          2. Pedido
        </div>
        <Field label="Data do pedido" status={saveStatus.data_pedido}>
          <input type="date" {...field('data_pedido')} />
        </Field>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          3. Cronograma / Agendamento do serviço
        </div>
        <div className="form-row">
          <Field label="Início agendado" status={saveStatus.data_inicio_agendada}>
            <input type="date" {...field('data_inicio_agendada')} />
          </Field>
          <Field label="Término previsto" status={saveStatus.data_termino_prevista}>
            <input type="date" {...field('data_termino_prevista')} />
          </Field>
        </div>
      </div>

      <div className="panel">
        <div className="label" style={{ marginBottom: 10 }}>
          4. Finalização — relatório de atividades
        </div>
        <Field label="Data de finalização" status={saveStatus.data_finalizacao}>
          <input type="date" {...field('data_finalizacao')} />
        </Field>

        <div className="btn-row" style={{ margin: '4px 0 14px', alignItems: 'center' }}>
          <button type="button" onClick={handleAnalyzeNow} disabled={analyzing}>
            {analyzing ? (
              <>
                <span className="spinner" /> Analisando…
              </>
            ) : (
              '🤖 Analisar agora com IA'
            )}
          </button>
          {analyzing && <span className="muted">Pode levar até 15-20s (resposta do Gemini).</span>}
        </div>
        {analyzeMsg && <p className="muted" style={{ marginBottom: 14 }}>{analyzeMsg}</p>}

        <p className="muted" style={{ marginBottom: 10 }}>
          Os três campos abaixo são preenchidos automaticamente pelo agente de IA a cada lançamento de horas, com
          base nas descrições diárias. Revise e ajuste à vontade.
        </p>

        <Field label="Pendências" status={saveStatus.relatorio_pendencias}>
          <textarea rows={3} {...field('relatorio_pendencias')} />
        </Field>
        <Field label="Sugestões" status={saveStatus.relatorio_sugestoes}>
          <textarea rows={3} {...field('relatorio_sugestoes')} />
        </Field>
        <Field label="Dificuldades encontradas" status={saveStatus.relatorio_dificuldades}>
          <textarea rows={3} {...field('relatorio_dificuldades')} />
        </Field>

        <div className="checkbox-row" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            id="teve_atraso"
            checked={draft.teve_atraso}
            onChange={(e) => toggleAtraso(e.target.checked)}
          />
          <label htmlFor="teve_atraso">Houve atraso em relação ao previsto</label>
        </div>

        {draft.teve_atraso && (
          <Field label="Motivo do atraso" status={saveStatus.motivo_atraso}>
            <textarea rows={2} {...field('motivo_atraso')} />
          </Field>
        )}

        {project.data_termino_prevista && (
          <p className="muted">Término previsto: {formatDate(project.data_termino_prevista)}</p>
        )}
      </div>
    </div>
  );
}
