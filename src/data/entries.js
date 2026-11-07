import { supabase } from '../lib/supabaseClient.js';

/** Só os campos usados pra calcular recebido/a receber de todos os projetos (visão de portfólio). */
export async function listAllEntriesFinanceiro() {
  const { data, error } = await supabase.from('entries').select('project_id, type, amount');
  if (error) throw error;
  return data;
}

export async function listEntries(projectId) {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('project_id', projectId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createEntry(projectId, fields) {
  const { data, error } = await supabase
    .from('entries')
    .insert({ ...fields, project_id: projectId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEntry(id, fields) {
  const { data, error } = await supabase.from('entries').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteEntry(id) {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
}
