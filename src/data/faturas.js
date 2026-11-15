import { supabase } from '../lib/supabaseClient.js';
import { todayLocal } from '../lib/calc.js';
import { createEntry, deleteEntry, updateEntry } from './entries.js';

/**
 * Contas a receber: cada fatura/medição tem valor, NF e vencimento. Ao
 * marcar como paga, cria um lançamento de receita "Pagamento" (que abate o
 * valor a receber do projeto) e guarda o vínculo em entry_id, pra desfazer
 * ou ajustar junto depois.
 */

export async function listFaturas(projectId) {
  const { data, error } = await supabase
    .from('faturas')
    .select('*')
    .eq('project_id', projectId)
    .order('vencimento', { ascending: true });
  if (error) throw error;
  return data;
}

/** Só o necessário pra visão de portfólio (Início): faturas em aberto de todos os projetos. */
export async function listFaturasEmAberto() {
  const { data, error } = await supabase
    .from('faturas')
    .select('project_id, valor, vencimento')
    .is('data_pagamento', null);
  if (error) throw error;
  return data;
}

export async function createFatura(projectId, fields) {
  const { data, error } = await supabase
    .from('faturas')
    .insert({ ...fields, project_id: projectId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

function descricaoLancamento(f) {
  return ['Pagamento', f.numero_nf ? `NF ${f.numero_nf}` : null, f.descricao].filter(Boolean).join(' — ');
}

/** Atualiza a fatura e, se já estiver paga, mantém o lançamento de pagamento igual. */
export async function updateFatura(fatura, fields) {
  const { data, error } = await supabase.from('faturas').update(fields).eq('id', fatura.id).select().single();
  if (error) throw error;
  if (data.entry_id) {
    await updateEntry(data.entry_id, {
      amount: data.valor,
      date: data.data_pagamento,
      description: descricaoLancamento(data)
    });
  }
  return data;
}

export async function marcarFaturaPaga(fatura, dataPagamento = todayLocal()) {
  const entry = await createEntry(fatura.project_id, {
    type: 'receita',
    category: 'pagamento',
    amount: fatura.valor,
    date: dataPagamento,
    description: descricaoLancamento(fatura)
  });
  const { data, error } = await supabase
    .from('faturas')
    .update({ data_pagamento: dataPagamento, entry_id: entry.id })
    .eq('id', fatura.id)
    .select()
    .single();
  if (error) {
    // não deixa um pagamento lançado sem a fatura marcada
    await deleteEntry(entry.id).catch(() => {});
    throw error;
  }
  return data;
}

/** Volta a fatura pra "em aberto" e apaga o lançamento de pagamento que ela tinha criado. */
export async function desmarcarFaturaPaga(fatura) {
  const { data, error } = await supabase
    .from('faturas')
    .update({ data_pagamento: null, entry_id: null })
    .eq('id', fatura.id)
    .select()
    .single();
  if (error) throw error;
  if (fatura.entry_id) await deleteEntry(fatura.entry_id);
  return data;
}

export async function deleteFatura(fatura, { apagarPagamento = false } = {}) {
  const { error } = await supabase.from('faturas').delete().eq('id', fatura.id);
  if (error) throw error;
  if (apagarPagamento && fatura.entry_id) await deleteEntry(fatura.entry_id);
}

/** 'paga' | 'atrasada' | 'vence_logo' | 'em_aberto' */
export function faturaStatus(f, today = todayLocal()) {
  if (f.data_pagamento) return 'paga';
  if (f.vencimento < today) return 'atrasada';
  const em7 = new Date(today + 'T12:00:00');
  em7.setDate(em7.getDate() + 7);
  const limite = `${em7.getFullYear()}-${String(em7.getMonth() + 1).padStart(2, '0')}-${String(em7.getDate()).padStart(2, '0')}`;
  return f.vencimento <= limite ? 'vence_logo' : 'em_aberto';
}

export const FATURA_STATUS_INFO = {
  paga: { label: 'Paga', color: '#15803d' },
  atrasada: { label: 'Atrasada', color: '#dc2626' },
  vence_logo: { label: 'Vence em até 7 dias', color: '#c27803' },
  em_aberto: { label: 'Em aberto', color: '#0a7ea4' }
};
