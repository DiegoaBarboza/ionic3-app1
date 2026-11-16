import { almocoMinutos, calcReembolso, categoryInfo, formatAlmoco, revenueCategoryInfo, todayLocal } from './calc.js';

const MOEDA = '"R$" #,##0.00';
const NUM2 = '#,##0.00';
const DATA = 'dd/mm/yyyy';

const HEADER = { fontWeight: 'bold', backgroundColor: '#E5EDF3', borderColor: '#B8C7D3', borderStyle: 'thin' };
const TOTAL = { fontWeight: 'bold', backgroundColor: '#F4F7FB' };

function slug(text) {
  return (text || 'projeto')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** "2026-11-15" -> Date no meio-dia UTC (evita a data "voltar um dia" por fuso). */
function toDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function header(labels) {
  return labels.map((value) => ({ value, ...HEADER }));
}

function periodoTexto(inicio, fim) {
  const br = (iso) => iso.split('-').reverse().join('/');
  if (inicio && fim) return `${br(inicio)} a ${br(fim)}`;
  if (inicio) return `a partir de ${br(inicio)}`;
  if (fim) return `até ${br(fim)}`;
  return 'todo o período';
}

function noPeriodo(lista, inicio, fim) {
  return lista
    .filter((x) => (!inicio || x.date >= inicio) && (!fim || x.date <= fim))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || ''));
}

function titulo(project, assunto, inicio, fim) {
  return [
    [{ value: `${project.name} — ${assunto}`, fontWeight: 'bold', fontSize: 14 }],
    [`Cliente: ${project.client_name || '—'} · Período: ${periodoTexto(inicio, fim)} · Gerado em ${todayLocal().split('-').reverse().join('/')}`],
    []
  ];
}

async function salvar(sheets, nomeArquivo) {
  // carregado só quando o botão é usado, pra não pesar o app
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  await writeExcelFile(sheets, { fontFamily: 'Calibri', fontSize: 11 }).toFile(nomeArquivo);
}

/** Planilha de lançamentos (receitas e gastos) do período, com totais. */
export async function exportarLancamentos(project, entries, { inicio, fim } = {}) {
  const lista = noPeriodo(entries, inicio, fim);
  const linhas = lista.map((e) => {
    const cat = e.type === 'receita' ? revenueCategoryInfo(e.category) : categoryInfo(e.category);
    const valor = Number(e.amount) || 0;
    return [
      { value: toDate(e.date), format: DATA },
      e.type === 'receita' ? 'Receita' : 'Gasto',
      cat?.label || '',
      e.description || '',
      e.city || '',
      e.state || '',
      { value: e.type === 'receita' ? valor : -valor, format: MOEDA, textColor: e.type === 'receita' ? '#15803D' : '#DC2626' },
      e.receipt_url ? 'Sim' : ''
    ];
  });
  const receitas = lista.filter((e) => e.type === 'receita').reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const gastos = lista.filter((e) => e.type !== 'receita').reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const total = (label, value) => [
    { value: label, ...TOTAL },
    null,
    null,
    null,
    null,
    null,
    { value, format: MOEDA, ...TOTAL },
    null
  ];

  const data = [
    ...titulo(project, 'Lançamentos', inicio, fim),
    header(['Data', 'Tipo', 'Categoria', 'Descrição', 'Cidade', 'UF', 'Valor (R$)', 'Foto da nota']),
    ...linhas,
    [],
    total('Total de receitas', receitas),
    total('Total de gastos', -gastos),
    total('Saldo', receitas - gastos)
  ];

  await salvar(
    [
      {
        data,
        sheet: 'Lançamentos',
        columns: [{ width: 12 }, { width: 9 }, { width: 16 }, { width: 40 }, { width: 16 }, { width: 5 }, { width: 16 }, { width: 11 }]
      }
    ],
    `lancamentos-${slug(project.name)}-${todayLocal()}.xlsx`
  );
  return lista.length;
}

/**
 * Planilha de horas do período: jornadas, deslocamento/pedágio (reembolso)
 * e, em projeto de serviço, o valor das horas pelo valor/hora do contrato.
 */
export async function exportarHoras(project, hours, { inicio, fim, stages = [] } = {}) {
  const lista = noPeriodo(hours, inicio, fim);
  const isMaquina = project.tipo_projeto === 'maquina';
  const valorHora = Number(project.hourly_rate) || 0;
  const area = (id) => stages.find((s) => s.id === id)?.stage_label || '';

  const cab = ['Data', 'Início', 'Fim', 'Almoço', 'Horas'];
  if (isMaquina) cab.push('Área');
  cab.push('Descrição', 'KM ida', 'KM volta', 'R$/km', 'Pedágio', 'Reembolso');
  if (!isMaquina) cab.push('Valor das horas');

  let totHoras = 0;
  let totReembolso = 0;
  const linhas = lista.map((h) => {
    const horas = Number(h.hours) || 0;
    const reembolso = calcReembolso(h);
    totHoras += horas;
    totReembolso += reembolso;
    const row = [
      { value: toDate(h.date), format: DATA },
      (h.start_time || '').slice(0, 5),
      (h.end_time || '').slice(0, 5),
      formatAlmoco(almocoMinutos(h)),
      { value: horas, format: NUM2 }
    ];
    if (isMaquina) row.push(area(h.stage_id));
    row.push(
      { value: h.description || '', wrap: true },
      { value: Number(h.km_ida) || 0, format: NUM2 },
      { value: Number(h.km_volta) || 0, format: NUM2 },
      { value: Number(h.valor_km) || 0, format: MOEDA },
      { value: Number(h.pedagio) || 0, format: MOEDA },
      { value: reembolso, format: MOEDA }
    );
    if (!isMaquina) row.push({ value: horas * valorHora, format: MOEDA });
    return row;
  });

  const totalRow = [{ value: 'Total', ...TOTAL }, null, null, null, { value: totHoras, format: NUM2, ...TOTAL }];
  if (isMaquina) totalRow.push(null);
  totalRow.push(null, null, null, null, null, { value: totReembolso, format: MOEDA, ...TOTAL });
  if (!isMaquina) totalRow.push({ value: totHoras * valorHora, format: MOEDA, ...TOTAL });

  const resumo = !isMaquina
    ? [
        [],
        [{ value: 'Valor da hora', ...TOTAL }, { value: valorHora, format: MOEDA }],
        [{ value: 'Horas × valor/hora', ...TOTAL }, { value: totHoras * valorHora, format: MOEDA }],
        [{ value: 'Reembolso de deslocamento', ...TOTAL }, { value: totReembolso, format: MOEDA }],
        [{ value: 'Total a cobrar no período', ...TOTAL }, { value: totHoras * valorHora + totReembolso, format: MOEDA, ...TOTAL }]
      ]
    : [];

  const columns = [{ width: 12 }, { width: 7 }, { width: 7 }, { width: 8 }, { width: 8 }];
  if (isMaquina) columns.push({ width: 24 });
  columns.push({ width: 50 }, { width: 8 }, { width: 9 }, { width: 10 }, { width: 11 }, { width: 13 });
  if (!isMaquina) columns.push({ width: 15 });

  await salvar(
    [
      {
        data: [...titulo(project, 'Horas', inicio, fim), header(cab), ...linhas, [], totalRow, ...resumo],
        sheet: 'Horas',
        columns
      }
    ],
    `horas-${slug(project.name)}-${todayLocal()}.xlsx`
  );
  return lista.length;
}
