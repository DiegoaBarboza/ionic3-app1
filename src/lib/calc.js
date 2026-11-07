function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calcula as horas trabalhadas entre startTime e endTime (formato "HH:MM").
 * Trata virada de dia (ex: início 22:00, fim 02:00) somando 24h ao intervalo,
 * e desconta 1h de almoço quando lunch=true.
 */
export function calcHoras(startTime, endTime, lunch) {
  if (!startTime || !endTime) return 0;
  let start = toMinutes(startTime);
  let end = toMinutes(endTime);
  if (end <= start) end += 24 * 60;
  let minutes = end - start;
  if (lunch) minutes -= 60;
  if (minutes < 0) minutes = 0;
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Reembolso de deslocamento de uma jornada: (km de ida + km de volta) x valor
 * por km, mais o pedágio do dia. Usado no relatório de horas para solicitar
 * o reembolso ao cliente.
 */
export function calcReembolso(h) {
  const km = (Number(h.km_ida) || 0) + (Number(h.km_volta) || 0);
  return km * (Number(h.valor_km) || 0) + (Number(h.pedagio) || 0);
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y.slice(-2)}`;
}

export const CATEGORIES = [
  { value: 'combustivel', label: 'Combustível', icon: '⛽', color: '#e8b84b' },
  { value: 'alimentacao', label: 'Alimentação', icon: '🍔', color: '#2fd4a9' },
  { value: 'pedagio', label: 'Pedágio', icon: '🛣️', color: '#8b96a5' },
  { value: 'hospedagem', label: 'Hospedagem', icon: '🏨', color: '#2fb8dc' },
  { value: 'impostos', label: 'Impostos', icon: '📋', color: '#ef5a5a' },
  { value: 'diversos', label: 'Diversos', icon: '📦', color: '#a78bfa' }
];

export function categoryInfo(value) {
  return CATEGORIES.find((c) => c.value === value) || CATEGORIES[CATEGORIES.length - 1];
}

/**
 * Só "Pagamento" abate do valor a receber (horas trabalhadas x valor/hora,
 * ou valor fixo combinado, menos os pagamentos já lançados). Os outros tipos
 * entram na receita total/lucro do projeto, mas não quitam o valor pendente.
 */
export const REVENUE_CATEGORIES = [
  { value: 'pagamento', label: 'Pagamento', icon: '💰', color: '#15803d' },
  { value: 'adiantamento', label: 'Adiantamento', icon: '⏩', color: '#2fb8dc' },
  { value: 'reembolso', label: 'Reembolso', icon: '↩️', color: '#8b96a5' },
  { value: 'outro', label: 'Outro', icon: '📎', color: '#a78bfa' }
];

export function revenueCategoryInfo(value) {
  // lançamentos antigos não tinham categoria — tratados como Pagamento
  return REVENUE_CATEGORIES.find((c) => c.value === value) || REVENUE_CATEGORIES[0];
}

/** true se o lançamento de receita conta como pagamento (abate o valor a receber). */
export function isPagamento(entry) {
  return !entry.category || entry.category === 'pagamento';
}
