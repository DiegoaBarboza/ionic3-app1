import { supabase } from '../lib/supabaseClient.js';

export async function listEncomendas(projectId) {
  const { data, error } = await supabase
    .from('encomendas')
    .select('*')
    .eq('project_id', projectId)
    .order('prazo_combinado', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function createEncomenda(projectId, fields) {
  const { data, error } = await supabase
    .from('encomendas')
    .insert({ ...fields, project_id: projectId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEncomenda(id, fields) {
  const { data, error } = await supabase.from('encomendas').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteEncomenda(id) {
  const { error } = await supabase.from('encomendas').delete().eq('id', id);
  if (error) throw error;
}

export const TIPO_ENCOMENDA = [
  { value: 'peca_comprada', label: 'Peça comprada' },
  { value: 'usinagem_externa', label: 'Usinagem externa' },
  { value: 'projeto_terceirizado', label: 'Projeto terceirizado' },
  { value: 'outro', label: 'Outro' }
];

/** 'atrasado' | 'entregue_atraso' | 'entregue' | 'no_prazo' | 'sem_prazo' */
export function encomendaStatus(e) {
  const today = new Date().toISOString().slice(0, 10);
  if (e.data_entrega) {
    return e.prazo_combinado && e.data_entrega > e.prazo_combinado ? 'entregue_atraso' : 'entregue';
  }
  if (!e.prazo_combinado) return 'sem_prazo';
  return e.prazo_combinado < today ? 'atrasado' : 'no_prazo';
}

export const ENCOMENDA_STATUS_INFO = {
  atrasado: { label: 'Atrasado', tone: 'negative' },
  entregue_atraso: { label: 'Entregue com atraso', tone: 'negative' },
  entregue: { label: 'Entregue', tone: 'positive' },
  no_prazo: { label: 'No prazo', tone: null },
  sem_prazo: { label: 'Sem prazo definido', tone: null }
};
