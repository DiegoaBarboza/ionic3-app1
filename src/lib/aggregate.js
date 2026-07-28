import { CATEGORIES, categoryInfo } from './calc.js';

export function computeTotals(entries) {
  let receita = 0;
  let gasto = 0;
  for (const e of entries) {
    if (e.type === 'receita') receita += Number(e.amount) || 0;
    else gasto += Number(e.amount) || 0;
  }
  return { receita, gasto, lucro: receita - gasto };
}

export function sumHours(hours) {
  return hours.reduce((acc, h) => acc + (Number(h.hours) || 0), 0);
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
