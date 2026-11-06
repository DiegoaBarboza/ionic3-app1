import { supabase } from '../lib/supabaseClient.js';

/**
 * Fluxo de Construção de Máquinas / Células Robotizadas, validado pelo
 * Diego em 05/11/2026 (adaptado do PMBOK). Toda máquina nova é semeada
 * com essas 12 etapas fixas, na ordem.
 */
export const MACHINE_STAGES = [
  { key: 'levantamento_escopo', label: 'Levantamento & Escopo' },
  { key: 'projeto_mecanico', label: 'Projeto Mecânico' },
  { key: 'projeto_eletrico', label: 'Projeto Elétrico/Automação' },
  { key: 'compras_usinagem', label: 'Compras & Usinagem Externa' },
  { key: 'montagem_mecanica', label: 'Montagem Mecânica' },
  { key: 'montagem_eletrica', label: 'Montagem Elétrica' },
  { key: 'programacao', label: 'Programação (CLP, robô, IHM, visão)' },
  { key: 'testes_fat', label: 'Testes Internos / FAT' },
  { key: 'expedicao_instalacao', label: 'Expedição & Instalação em Campo' },
  { key: 'comissionamento_sat', label: 'Comissionamento / SAT' },
  { key: 'treinamento_documentacao', label: 'Treinamento & Documentação' },
  { key: 'encerramento', label: 'Encerramento' }
];

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
    status: 'pendente'
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
