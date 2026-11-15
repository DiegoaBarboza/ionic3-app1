import { supabase } from '../lib/supabaseClient.js';

export async function listPecas(projectId) {
  const { data, error } = await supabase
    .from('pecas')
    .select('*, encomendas(id, descricao), fornecedores(id, nome)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createPeca(projectId, fields) {
  const { data, error } = await supabase
    .from('pecas')
    .insert({ ...fields, project_id: projectId })
    .select('*, encomendas(id, descricao), fornecedores(id, nome)')
    .single();
  if (error) throw error;
  return data;
}

export async function updatePeca(id, fields) {
  const { data, error } = await supabase
    .from('pecas')
    .update(fields)
    .eq('id', id)
    .select('*, encomendas(id, descricao), fornecedores(id, nome)')
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

/** Custo previsto da linha (quantidade x preço unitário); 0 quando não tem preço. */
export function custoPeca(p) {
  return (Number(p.quantidade) || 0) * (Number(p.preco_unitario) || 0);
}

/** Totais da BOM: custo previsto total, já comprado/em estoque, a comprar, e quantas linhas estão sem preço. */
export function resumoBom(pecas) {
  const r = { total: 0, garantido: 0, aComprar: 0, semPreco: 0 };
  for (const p of pecas) {
    const c = custoPeca(p);
    r.total += c;
    if (p.status === 'a_comprar') r.aComprar += c;
    else r.garantido += c;
    if (p.preco_unitario == null || p.preco_unitario === '') r.semPreco++;
  }
  return r;
}
