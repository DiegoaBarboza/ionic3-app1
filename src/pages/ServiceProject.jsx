import { useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { getProject, updateProject } from '../data/projects.js';
import { formatDate } from '../lib/calc.js';

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

function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
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

  async function saveField(field, value) {
    const updated = await updateProject(project.id, { [field]: value });
    setProject(updated);
  }

  function field(name) {
    return {
      value: draft[name],
      onChange: (e) => setDraft({ ...draft, [name]: e.target.value }),
      onBlur: () => {
        if (draft[name] !== (project[name] || '')) saveField(name, draft[name] || null);
      }
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
        <Field label="Escopo solicitado pelo cliente">
          <textarea rows={3} {...field('escopo_solicitado')} />
        </Field>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          2. Pedido
        </div>
        <Field label="Data do pedido">
          <input type="date" {...field('data_pedido')} />
        </Field>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          3. Cronograma / Agendamento do serviço
        </div>
        <div className="form-row">
          <Field label="Início agendado">
            <input type="date" {...field('data_inicio_agendada')} />
          </Field>
          <Field label="Término previsto">
            <input type="date" {...field('data_termino_prevista')} />
          </Field>
        </div>
      </div>

      <div className="panel">
        <div className="label" style={{ marginBottom: 10 }}>
          4. Finalização — relatório de atividades
        </div>
        <Field label="Data de finalização">
          <input type="date" {...field('data_finalizacao')} />
        </Field>

        <div className="btn-row" style={{ margin: '4px 0 14px' }}>
          <button type="button" onClick={handleAnalyzeNow} disabled={analyzing}>
            {analyzing ? 'Analisando…' : '🤖 Analisar agora com IA'}
          </button>
        </div>
        {analyzeMsg && <p className="muted" style={{ marginBottom: 14 }}>{analyzeMsg}</p>}

        <p className="muted" style={{ marginBottom: 10 }}>
          Os três campos abaixo são preenchidos automaticamente pelo agente de IA a cada lançamento de horas, com
          base nas descrições diárias. Revise e ajuste à vontade.
        </p>

        <Field label="Pendências">
          <textarea rows={3} {...field('relatorio_pendencias')} />
        </Field>
        <Field label="Sugestões">
          <textarea rows={3} {...field('relatorio_sugestoes')} />
        </Field>
        <Field label="Dificuldades encontradas">
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
          <Field label="Motivo do atraso">
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
