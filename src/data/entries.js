import { supabase } from '../lib/supabaseClient.js';

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
