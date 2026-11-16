import { afterEach, describe, expect, it, vi } from 'vitest';

// Módulos de dados importam o cliente do Supabase; nos testes de cálculo ele não é usado.
vi.mock('../lib/supabaseClient.js', () => ({ supabase: {} }));

import {
  almocoMinutos,
  formatAlmoco,
  calcHoras,
  calcReembolso,
  formatDate,
  formatMoney,
  isPagamento,
  revenueCategoryInfo,
  todayLocal
} from '../lib/calc.js';
import {
  computeTotals,
  financeiroPorProjeto,
  receitaAReceber,
  resumoNegocio,
  sumHours,
  sumPagamentos
} from '../lib/aggregate.js';
import { parseBRL } from '../components/MoneyInput.jsx';
import { recalcSchedule } from '../data/stages.js';
import { custoPeca, resumoBom } from '../data/pecas.js';
import { faturaStatus } from '../data/faturas.js';
import { agrupar, progresso } from '../data/checklists.js';

afterEach(() => vi.useRealTimers());

describe('campo de dinheiro (parseBRL)', () => {
  it.each([
    ['1.500', 1500],
    ['1.500,50', 1500.5],
    ['12,5', 12.5],
    ['6.29', 6.29],
    ['1.250.000', 1250000],
    ['1500', 1500],
    ['0,99', 0.99],
    ['10.000,00', 10000],
    ['', 0]
  ])('"%s" vira %s', (texto, esperado) => {
    expect(parseBRL(texto)).toBe(esperado);
  });
});

describe('horas da jornada (calcHoras)', () => {
  it('desconta 1h de almoço', () => expect(calcHoras('08:00', '17:00', true)).toBe(8));
  it('sem almoço conta tudo', () => expect(calcHoras('08:00', '17:00', false)).toBe(9));
  it('quebra de minutos', () => expect(calcHoras('07:30', '16:45', true)).toBe(8.25));
  it('jornada que vira a noite', () => expect(calcHoras('22:00', '02:00', false)).toBe(4));
  it('nunca fica negativa', () => expect(calcHoras('08:00', '08:30', true)).toBe(0));
  it('sem horário dá zero', () => expect(calcHoras('', '17:00', true)).toBe(0));
  it('almoço de 30 min', () => expect(calcHoras('08:00', '17:00', 30)).toBe(8.5));
  it('almoço de 1h30', () => expect(calcHoras('08:00', '17:00', 90)).toBe(7.5));
  it('almoço 0 = sem almoço', () => expect(calcHoras('08:00', '17:00', 0)).toBe(9));
});

describe('almoço configurável', () => {
  it('registro antigo: lunch=true vale 60 min, false vale 0', () => {
    expect(almocoMinutos({ lunch: true })).toBe(60);
    expect(almocoMinutos({ lunch: false })).toBe(0);
  });
  it('registro novo usa almoco_minutos (mesmo com lunch)', () => {
    expect(almocoMinutos({ lunch: true, almoco_minutos: 30 })).toBe(30);
    expect(almocoMinutos({ lunch: false, almoco_minutos: 0 })).toBe(0);
  });
  it.each([
    [0, 'Não'],
    [30, '30 min'],
    [45, '45 min'],
    [60, '1h'],
    [90, '1h30'],
    [120, '2h']
  ])('%s min -> "%s"', (m, txt) => expect(formatAlmoco(m)).toBe(txt));
});

describe('reembolso de deslocamento', () => {
  it('(km ida + km volta) x R$/km + pedágio', () => {
    expect(calcReembolso({ km_ida: 42, km_volta: 42, valor_km: 1.2, pedagio: 18.6 })).toBeCloseTo(119.4, 2);
  });
  it('campos vazios contam como zero', () => expect(calcReembolso({})).toBe(0));
});

describe('datas', () => {
  it('formatDate', () => expect(formatDate('2026-11-15')).toBe('15/11/2026'));
  it('todayLocal usa o dia do Brasil mesmo depois das 21h (UTC já virou)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T01:30:00Z')); // 22h30 de 15/11 em Brasília
    expect(todayLocal()).toBe('2026-11-15');
  });
  it('formatMoney em reais', () => expect(formatMoney(1500.5).replace(/\s/g, ' ')).toBe('R$ 1.500,50'));
});

describe('receitas: só "Pagamento" abate o a receber', () => {
  const entries = [
    { project_id: 'p1', type: 'receita', category: 'pagamento', amount: 15000 },
    { project_id: 'p1', type: 'receita', category: 'adiantamento', amount: 800 },
    { project_id: 'p1', type: 'receita', category: null, amount: 100 }, // antigo, sem categoria = pagamento
    { project_id: 'p1', type: 'gasto', category: 'combustivel', amount: 250 }
  ];

  it('isPagamento trata categoria vazia como pagamento', () => {
    expect(isPagamento({ category: null })).toBe(true);
    expect(isPagamento({ category: 'reembolso' })).toBe(false);
    expect(revenueCategoryInfo(undefined).value).toBe('pagamento');
  });
  it('sumPagamentos ignora adiantamento e gasto', () => expect(sumPagamentos(entries)).toBe(15100));
  it('totais gerais contam toda receita', () => {
    expect(computeTotals(entries)).toEqual({ receita: 15900, gasto: 250, lucro: 15650 });
  });
  it('serviço: horas x valor/hora - pagamentos', () => {
    const hours = [{ hours: 40 }, { hours: 12.5 }];
    expect(sumHours(hours)).toBe(52.5);
    expect(receitaAReceber(entries, hours, 150)).toBe(52.5 * 150 - 15100);
  });
  it('portfólio: máquina usa valor fixo; nunca fica negativo', () => {
    const projects = [
      { id: 'p1', tipo_projeto: 'maquina', valor_fixo_projeto: 50000 },
      { id: 'p2', tipo_projeto: 'servico', hourly_rate: 100 }
    ];
    const fin = financeiroPorProjeto(
      projects,
      [...entries, { project_id: 'p2', type: 'receita', category: 'pagamento', amount: 9999 }],
      [{ project_id: 'p2', hours: 10 }]
    );
    expect(fin.p1).toEqual({ recebido: 15900, aReceber: 50000 - 15100 });
    expect(fin.p2).toEqual({ recebido: 9999, aReceber: 0 });
  });
});

describe('visão geral do negócio', () => {
  it('soma mês atual e anterior, e faturas vencidas', () => {
    const r = resumoNegocio({
      entries: [
        { type: 'receita', amount: 1000, date: '2026-11-03' },
        { type: 'receita', amount: 300, date: '2026-10-20' },
        { type: 'gasto', amount: 200, date: '2026-11-05' },
        { type: 'receita', amount: 999, date: '2025-11-01' }
      ],
      hours: [
        { hours: 8, date: '2026-11-10' },
        { hours: 4.5, date: '2026-10-02' }
      ],
      faturasAbertas: [
        { valor: 5000, vencimento: '2026-11-01' },
        { valor: 7000, vencimento: '2026-12-01' }
      ],
      financeiro: { a: { aReceber: 1000 }, b: { aReceber: 0 } },
      mes: '2026-11',
      hoje: '2026-11-15'
    });
    expect(r).toMatchObject({
      aReceber: 1000,
      projetosComSaldo: 1,
      faturasAtrasadas: 5000,
      qtdFaturasAtrasadas: 1,
      recebidoMes: 1000,
      recebidoMesAnterior: 300,
      gastoMes: 200,
      horasMes: 8,
      horasMesAnterior: 4.5
    });
  });
  it('janeiro compara com dezembro do ano anterior', () => {
    const r = resumoNegocio({
      entries: [{ type: 'receita', amount: 50, date: '2025-12-31' }],
      hours: [],
      faturasAbertas: [],
      financeiro: {},
      mes: '2026-01',
      hoje: '2026-01-10'
    });
    expect(r.recebidoMesAnterior).toBe(50);
  });
});

describe('cronograma da construção (recalcSchedule)', () => {
  it('encadeia as etapas e empurra quando a anterior atrasou', () => {
    const r = recalcSchedule([
      { planned_start: '2026-11-02', duracao_dias: 5 },
      { duracao_dias: 3, actual_end: null },
      { duracao_dias: 2 }
    ]);
    expect(r.map((s) => [s.planned_start, s.planned_end])).toEqual([
      ['2026-11-02', '2026-11-06'],
      ['2026-11-07', '2026-11-09'],
      ['2026-11-10', '2026-11-11']
    ]);
    const atrasada = recalcSchedule([
      { planned_start: '2026-11-02', duracao_dias: 5, actual_end: '2026-11-10' },
      { duracao_dias: 3 }
    ]);
    expect(atrasada[1].planned_start).toBe('2026-11-11');
  });
  it('etapa sem duração deixa as seguintes sem data', () => {
    const r = recalcSchedule([{ planned_start: '2026-11-02', duracao_dias: 0 }, { duracao_dias: 3 }]);
    expect(r[1].planned_start).toBeNull();
  });
});

describe('lista de peças (BOM)', () => {
  const pecas = [
    { quantidade: 1, preco_unitario: 32000, status: 'comprado' },
    { quantidade: 24, preco_unitario: 85.5, status: 'a_comprar' },
    { quantidade: 8, preco_unitario: 145, status: 'em_estoque' },
    { quantidade: 1, preco_unitario: null, status: 'a_comprar' }
  ];
  it('custo da linha', () => expect(custoPeca(pecas[1])).toBe(2052));
  it('resumo: previsto, garantido, a comprar e sem preço', () => {
    expect(resumoBom(pecas)).toEqual({ total: 35212, garantido: 33160, aComprar: 2052, semPreco: 1 });
  });
});

describe('faturas', () => {
  it.each([
    [{ data_pagamento: '2026-11-01', vencimento: '2026-10-01' }, 'paga'],
    [{ vencimento: '2026-11-14' }, 'atrasada'],
    [{ vencimento: '2026-11-15' }, 'vence_logo'],
    [{ vencimento: '2026-11-22' }, 'vence_logo'],
    [{ vencimento: '2026-11-23' }, 'em_aberto']
  ])('%o -> %s', (f, esperado) => expect(faturaStatus(f, '2026-11-15')).toBe(esperado));
  it('vence_logo atravessa a virada de mês', () => expect(faturaStatus({ vencimento: '2026-12-03' }, '2026-11-28')).toBe('vence_logo'));
});

describe('checklist FAT/SAT', () => {
  const itens = [
    { grupo: 'Segurança', item: 'a', resultado: 'ok' },
    { grupo: 'Elétrica', item: 'b', resultado: 'nok' },
    { grupo: 'Segurança', item: 'c', resultado: 'pendente' },
    { grupo: 'Elétrica', item: 'd', resultado: 'na' }
  ];
  it('agrupa mantendo a ordem de aparição', () => {
    expect(agrupar(itens).map((g) => [g.grupo, g.itens.map((i) => i.item)])).toEqual([
      ['Segurança', ['a', 'c']],
      ['Elétrica', ['b', 'd']]
    ]);
  });
  it('conta o progresso', () => expect(progresso(itens)).toEqual({ total: 4, ok: 1, nok: 1, na: 1, pendente: 1 }));
});
