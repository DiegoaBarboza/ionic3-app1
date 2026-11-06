import { supabase } from '../lib/supabaseClient.js';

export async function listFornecedores() {
  const { data, error } = await supabase.from('fornecedores').select('*').order('nome', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createFornecedor(fields) {
  const { data, error } = await supabase.from('fornecedores').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateFornecedor(id, fields) {
  const { data, error } = await supabase.from('fornecedores').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteFornecedor(id) {
  const { error } = await supabase.from('fornecedores').delete().eq('id', id);
  if (error) throw error;
}
