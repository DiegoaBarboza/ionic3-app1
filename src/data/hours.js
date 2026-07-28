import { supabase } from '../lib/supabaseClient.js';

export async function listHours(projectId) {
  const { data, error } = await supabase
    .from('hours')
    .select('*')
    .eq('project_id', projectId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createHours(projectId, fields) {
  const { data, error } = await supabase
    .from('hours')
    .insert({ ...fields, project_id: projectId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateHours(id, fields) {
  const { data, error } = await supabase.from('hours').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteHours(id) {
  const { error } = await supabase.from('hours').delete().eq('id', id);
  if (error) throw error;
}
