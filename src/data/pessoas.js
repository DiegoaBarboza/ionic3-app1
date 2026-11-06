import { supabase } from '../lib/supabaseClient.js';

export async function listPessoas() {
  const { data, error } = await supabase.from('pessoas').select('*').order('nome', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createPessoa(fields) {
  const { data, error } = await supabase.from('pessoas').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updatePessoa(id, fields) {
  const { data, error } = await supabase.from('pessoas').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePessoa(id) {
  const { error } = await supabase.from('pessoas').delete().eq('id', id);
  if (error) throw error;
}

export async function listStageTeam(projectId) {
  const { data, error } = await supabase
    .from('project_stage_team')
    .select('*, pessoas(*)')
    .eq('project_id', projectId);
  if (error) throw error;
  return data;
}

export async function assignPessoaToStage(projectId, stageId, pessoaId, papel) {
  const { data, error } = await supabase
    .from('project_stage_team')
    .insert({ project_id: projectId, stage_id: stageId, pessoa_id: pessoaId, papel: papel || null })
    .select('*, pessoas(*)')
    .single();
  if (error) throw error;
  return data;
}

export async function removePessoaFromStage(id) {
  const { error } = await supabase.from('project_stage_team').delete().eq('id', id);
  if (error) throw error;
}
