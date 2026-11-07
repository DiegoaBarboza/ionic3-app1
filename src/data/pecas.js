import { supabase } from '../lib/supabaseClient.js';

export async function listPecas(projectId) {
  const { data, error } = await supabase
    .from('pecas')
    .select('*, encomendas(id, descricao)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createPeca(projectId, fields) {
  const { data, error } = await supabase
    .from('pecas')
    .insert({ ...fields, project_id: projectId })
    .select('*, encomendas(id, descricao)')
    .single();
  if (error) throw error;
  return data;
}

export async function updatePeca(id, fields) {
  const { data, error } = await supabase
    .from('pecas')
    .update(fields)
    .eq('id', id)
    .select('*, encomendas(id, descricao)')
    .single();
  if (error) throw error;
  return data;
}

export async function deletePeca(id) {
  const { error } = await supabase.from('pecas').delete().eq('id', id);
  if (error) throw error;
}

export const PECA_STATUS = [
  { value: 'a_comprar', label: 'A comprar', tone: 'negative' },
  { value: 'em_estoque', label: 'Em estoque', tone: null },
  { value: 'comprado', label: 'Comprado', tone: 'positive' }
];

export function pecaStatusInfo(status) {
  return PECA_STATUS.find((s) => s.value === status) || PECA_STATUS[0];
}
