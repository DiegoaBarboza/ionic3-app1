import { CATEGORIES, categoryInfo, isPagamento } from './calc.js';

export function computeTotals(entries) {
  let receita = 0;
  let gasto = 0;
  for (const e of entries) {
    if (e.type === 'receita') receita += Number(e.amount) || 0;
    else gasto += Number(e.amount) || 0;
  }
  return { receita, gasto, lucro: receita - gasto };
}

/** Soma só os lançamentos de receita marcados como Pagamento — é isso que abate o valor a receber. */
export function sumPagamentos(entries) {
  return entries.reduce((acc, e) => (e.type === 'receita' && isPagamento(e) ? acc + (Number(e.amount) || 0) : acc), 0);
}

export function sumHours(hours) {
  return hours.reduce((acc, h) => acc + (Number(h.hours) || 0), 0);
}

/**
 * Valor projetado a receber pelas horas já lançadas (horas x valor/hora),
 * menos os pagamentos já recebidos (lançamentos de receita categoria
 * "Pagamento" — outros tipos de receita, como adiantamento/reembolso, não
 * abatem). Mesma lógica da view v_projetos_financeiro no Supabase —
 * calculado aqui no cliente porque o Dashboard já tem entries/hours
 * carregados, sem precisar de outra consulta.
 */
export function receitaAReceber(entries, hours, hourlyRate) {
  const projetado = sumHours(hours) * (Number(hourlyRate) || 0);
  return projetado - sumPagamentos(entries);
}

/**
 * Recebido e a receber de cada projeto, pra visão de portfólio (tela Home,
 * lista de projetos). Mesma regra do Dashboard de cada projeto: serviço usa
 * horas lançadas x valor/hora, máquina usa o valor fixo combinado.
 */
export function financeiroPorProjeto(projects, entries, hours) {
  const recebidoPorProjeto = {};
  const pagamentosPorProjeto = {};
  for (const e of entries) {
    if (e.type !== 'receita') continue;
    recebidoPorProjeto[e.project_id] = (recebidoPorProjeto[e.project_id] || 0) + (Number(e.amount) || 0);
    if (isPagamento(e)) {
      pagamentosPorProjeto[e.project_id] = (pagamentosPorProjeto[e.project_id] || 0) + (Number(e.amount) || 0);
    }
  }
  const horasPorProjeto = {};
  for (const h of hours) {
    horasPorProjeto[h.project_id] = (horasPorProjeto[h.project_id] || 0) + (Number(h.hours) || 0);
  }
  const result = {};
  for (const p of projects) {
    const recebido = recebidoPorProjeto[p.id] || 0;
    const pagamentos = pagamentosPorProjeto[p.id] || 0;
    const projetado =
      p.tipo_projeto === 'maquina'
        ? Number(p.valor_fixo_projeto) || 0
        : (horasPorProjeto[p.id] || 0) * (Number(p.hourly_rate) || 0);
    result[p.id] = { recebido, aReceber: Math.max(0, projetado - pagamentos) };
  }
  return result;
}

export function pieDataByCategory(entries) {
  const totals = {};
  for (const e of entries) {
    if (e.type !== 'gasto') continue;
    const key = e.category || 'diversos';
    totals[key] = (totals[key] || 0) + (Number(e.amount) || 0);
  }
  return Object.entries(totals)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => {
      const info = categoryInfo(key);
      return { name: info.label, value, color: info.color };
    });
}

export function monthlyBarData(entries) {
  const months = {};
  for (const e of entries) {
    if (!e.date) continue;
    const key = e.date.slice(0, 7); // YYYY-MM
    if (!months[key]) months[key] = { month: key, receita: 0, gasto: 0 };
    if (e.type === 'receita') months[key].receita += Number(e.amount) || 0;
    else months[key].gasto += Number(e.amount) || 0;
  }
  return Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
}

export function rankingByCategory(entries) {
  const data = pieDataByCategory(entries);
  const total = data.reduce((acc, d) => acc + d.value, 0);
  return data
    .map((d) => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export { CATEGORIES };
