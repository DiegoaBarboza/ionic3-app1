import { supabase } from '../lib/supabaseClient.js';

/**
 * Fluxo de Construção de Máquinas / Células Robotizadas, validado pelo
 * Diego em 05/11/2026 (adaptado do PMBOK). Toda máquina nova é semeada
 * com essas 12 etapas fixas, na ordem. Cada etapa também é a "área"
 * usada para responsáveis e horas orçadas/apontadas.
 *
 * As cores seguem o mesmo matiz dos grupos de processo do PMBOK:
 * iniciação/planejamento em azul-ciano, execução em laranja/verde,
 * monitoramento em roxo, encerramento em cinza-escuro — só para dar
 * identidade visual a cada etapa no cronograma e nos cards.
 */
export const MACHINE_STAGES = [
  { key: 'levantamento_escopo', label: 'Levantamento & Escopo', color: '#0a7ea4' },
  { key: 'projeto_mecanico', label: 'Projeto Mecânico', color: '#0e7490' },
  { key: 'projeto_eletrico', label: 'Projeto Elétrico/Automação', color: '#6d28d9' },
  { key: 'compras_usinagem', label: 'Compras & Usinagem Externa', color: '#c27803' },
  { key: 'montagem_mecanica', label: 'Montagem Mecânica', color: '#ea580c' },
  { key: 'montagem_eletrica', label: 'Montagem Elétrica', color: '#db2777' },
  { key: 'programacao', label: 'Programação (CLP, robô, IHM, visão)', color: '#0a8f63' },
  { key: 'testes_fat', label: 'Testes Internos / FAT', color: '#15803d' },
  { key: 'expedicao_instalacao', label: 'Expedição & Instalação em Campo', color: '#2563eb' },
  { key: 'comissionamento_sat', label: 'Comissionamento / SAT', color: '#4f46e5' },
  { key: 'treinamento_documentacao', label: 'Treinamento & Documentação', color: '#0891b2' },
  { key: 'encerramento', label: 'Encerramento', color: '#475569' }
];

export function stageColor(stageKey) {
  return MACHINE_STAGES.find((s) => s.key === stageKey)?.color || '#475569';
}

/**
 * Status de cada etapa segue o ciclo PDCA (a pedido do Diego), com dois
 * estados de borda (não iniciada / concluída) e um para bloqueio.
 */
export const STAGE_STATUS = [
  { value: 'nao_iniciada', label: 'Não iniciada', color: '#94a3b8' },
  { value: 'plan', label: 'Plan — Planejar', color: '#0a7ea4' },
  { value: 'do', label: 'Do — Executar', color: '#ea580c' },
  { value: 'check', label: 'Check — Verificar', color: '#6d28d9' },
  { value: 'act', label: 'Act — Ajustar', color: '#db2777' },
  { value: 'concluida', label: 'Concluída', color: '#15803d' },
  { value: 'bloqueada', label: 'Bloqueada', color: '#dc2626' }
];

export function stageStatusInfo(status) {
  return STAGE_STATUS.find((s) => s.value === status) || STAGE_STATUS[0];
}

export async function listStages(projectId) {
  const { data, error } = await supabase
    .from('project_stages')
    .select('*')
    .eq('project_id', projectId)
    .order('stage_order', { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Cria as 12 etapas fixas para um projeto de máquina, caso ainda não
 * existam (idempotente — seguro chamar sempre que a tela abrir).
 */
export async function ensureStagesSeeded(projectId) {
  const existing = await listStages(projectId);
  if (existing.length > 0) return existing;

  const rows = MACHINE_STAGES.map((s, i) => ({
    project_id: projectId,
    stage_key: s.key,
    stage_order: i,
    stage_label: s.label,
    status: 'nao_iniciada'
  }));
  const { data, error } = await supabase.from('project_stages').insert(rows).select();
  if (error) throw error;
  return data.sort((a, b) => a.stage_order - b.stage_order);
}

export async function updateStage(id, fields) {
  const { data, error } = await supabase.from('project_stages').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/** Soma de horas já apontadas (tabela hours.stage_id) para uma etapa. */
export async function sumHoursByStage(projectId) {
  const { data, error } = await supabase.from('hours').select('stage_id, hours').eq('project_id', projectId);
  if (error) throw error;
  const totals = {};
  for (const h of data) {
    if (!h.stage_id) continue;
    totals[h.stage_id] = (totals[h.stage_id] || 0) + (Number(h.hours) || 0);
  }
  return totals;
}
