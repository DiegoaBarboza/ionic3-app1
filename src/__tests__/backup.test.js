import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Banco falso em memória que imita o pedaço do cliente do Supabase usado na
 * restauração (insert/update/delete/select com eq/order/single). Serve pra
 * testar backup -> restauração de ponta a ponta sem tocar no banco real.
 */
const db = {};
let seq = 0;
/** Regra extra opcional (ex.: simular chave estrangeira) checada antes de cada operação. */
let antesDeExecutar = null;

function tabela(nome) {
  if (!db[nome]) db[nome] = [];
  return db[nome];
}

function builder(table) {
  const q = { op: 'select', payload: null, filters: [], single: false, order: null };
  const api = {
    insert(rows) {
      q.op = 'insert';
      q.payload = rows;
      return api;
    },
    update(fields) {
      q.op = 'update';
      q.payload = fields;
      return api;
    },
    delete() {
      q.op = 'delete';
      return api;
    },
    select() {
      return api;
    },
    eq(col, val) {
      q.filters.push([col, val]);
      return api;
    },
    order(col) {
      q.order = col;
      return api;
    },
    single() {
      q.single = true;
      return api;
    },
    maybeSingle() {
      q.single = true;
      return api;
    },
    then(resolve, reject) {
      try {
        resolve(executar(table, q));
      } catch (err) {
        reject(err);
      }
    }
  };
  return api;
}

function executar(table, q) {
  antesDeExecutar?.(table, q);
  const rows = tabela(table);
  const casa = (r) => q.filters.every(([c, v]) => r[c] === v);
  let data;
  if (q.op === 'insert') {
    const lista = (Array.isArray(q.payload) ? q.payload : [q.payload]).map((r) => ({ id: `${table}-${++seq}`, ...r }));
    rows.push(...lista);
    data = lista;
  } else if (q.op === 'update') {
    data = rows.filter(casa);
    data.forEach((r) => Object.assign(r, q.payload));
  } else if (q.op === 'delete') {
    db[table] = rows.filter((r) => !casa(r));
    data = [];
  } else {
    data = rows.filter(casa);
    if (q.order) data = [...data].sort((a, b) => (a[q.order] > b[q.order] ? 1 : -1));
  }
  return { data: q.single ? data[0] ?? null : data, error: null };
}

vi.mock('../lib/supabaseClient.js', () => ({
  supabase: { from: (t) => builder(t), storage: { from: () => ({ remove: async () => ({}) }) } }
}));

import { buildBackupPayload } from '../lib/backup.js';
import { overwriteProjectFromBackup, restoreProjectFromBackup } from '../data/projects.js';

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  seq = 0;
  antesDeExecutar = null;
});

/** Projeto de máquina "original" com tudo preenchido e com os vínculos entre tabelas. */
function projetoOriginal() {
  const project = {
    id: 'orig',
    name: 'Célula de solda',
    tipo_projeto: 'maquina',
    status: 'andamento',
    valor_fixo_projeto: 80000,
    client_name: 'Metalúrgica X',
    created_at: '2026-10-01'
  };
  const stages = [
    { id: 'st-a', stage_key: 'levantamento_escopo', planned_start: '2026-10-01', duracao_dias: 5, status: 'concluida' },
    { id: 'st-b', stage_key: 'montagem_mecanica', planned_start: '2026-10-06', duracao_dias: 10, status: 'do' }
  ];
  const entries = [
    { id: 'en-1', type: 'receita', category: 'pagamento', amount: 24000, date: '2026-10-05', description: 'Sinal' },
    { id: 'en-2', type: 'gasto', category: 'diversos', amount: 1200, date: '2026-10-08', receipt_url: 'r.jpg' }
  ];
  const hours = [
    { date: '2026-10-07', start_time: '08:00', end_time: '17:00', lunch: true, hours: 8, stage_id: 'st-b', km_ida: 10 }
  ];
  const encomendas = [
    { id: 'enc-1', descricao: 'Robô', fornecedor_id: 'forn-1', tipo: 'peca_comprada', prazo_combinado: '2026-11-01' },
    { id: 'enc-2', descricao: 'Usinagem base', fornecedor_id: null, tipo: 'usinagem_externa' }
  ];
  const pecas = [
    { item: 'Robô M-20', quantidade: 1, unidade: 'un', status: 'comprado', preco_unitario: 32000, fornecedor_id: 'forn-1', encomenda_id: 'enc-1' },
    { item: 'Base usinada', quantidade: 1, unidade: 'un', status: 'comprado', preco_unitario: 4000, encomenda_id: 'enc-2' },
    { item: 'Sensor', quantidade: 8, unidade: 'un', status: 'a_comprar', preco_unitario: 145, encomenda_id: null }
  ];
  const faturas = [
    { descricao: '1ª medição', valor: 24000, vencimento: '2026-10-05', data_pagamento: '2026-10-05', entry_id: 'en-1' },
    { descricao: '2ª medição', valor: 32000, vencimento: '2026-12-01', data_pagamento: null, entry_id: null }
  ];
  const checklistItens = [{ tipo: 'fat', grupo: 'Segurança', item: 'Emergência', ordem: 10, resultado: 'nok', observacao: 'Rearme' }];
  const checklistAtas = [{ tipo: 'fat', data_teste: '2026-11-10', parecer: 'aprovado_ressalvas' }];
  return { project, entries, hours, extra: { stages, stageTeam: [], encomendas, pecas, faturas, checklistItens, checklistAtas } };
}

describe('backup -> restauração', () => {
  it('o arquivo guarda os vínculos por chave/posição, não por id do banco', () => {
    const o = projetoOriginal();
    const b = buildBackupPayload(o.project, o.entries, o.hours, o.extra);
    expect(b.version).toBe(2);
    expect(b.info).toMatchObject({ name: 'Célula de solda', tipo_projeto: 'maquina', status: 'andamento', valor_fixo_projeto: 80000 });
    expect(b.hours[0].stageKey).toBe('montagem_mecanica');
    expect(b.pecas.map((p) => p.encomendaIndex)).toEqual([0, 1, null]);
    expect(b.faturas.map((f) => f.entryIndex)).toEqual([0, null]);
    expect(b.entries[1].receiptUrl).toBe('r.jpg');
  });

  it('restaura como projeto novo, religando tudo pelos ids novos', async () => {
    const o = projetoOriginal();
    const backup = JSON.parse(JSON.stringify(buildBackupPayload(o.project, o.entries, o.hours, o.extra)));
    db.fornecedores = [{ id: 'forn-1', nome: 'Fanuc' }];

    const novo = await restoreProjectFromBackup(backup);

    expect(novo).toMatchObject({ name: 'Célula de solda', tipo_projeto: 'maquina', status: 'andamento' });
    const doProjeto = (t) => (db[t] || []).filter((r) => r.project_id === novo.id);

    // 12 etapas semeadas, com os dados do backup aplicados
    const etapas = doProjeto('project_stages');
    expect(etapas).toHaveLength(12);
    const montagem = etapas.find((s) => s.stage_key === 'montagem_mecanica');
    expect(montagem).toMatchObject({ planned_start: '2026-10-06', duracao_dias: 10, status: 'do' });

    // hora volta ligada à etapa nova certa
    const [hora] = doProjeto('hours');
    expect(hora.stage_id).toBe(montagem.id);

    // peças ligadas às encomendas recriadas, na ordem
    const encs = doProjeto('encomendas');
    const pecas = doProjeto('pecas');
    expect(pecas.map((p) => p.encomenda_id)).toEqual([encs[0].id, encs[1].id, null]);
    expect(pecas[0]).toMatchObject({ preco_unitario: 32000, fornecedor_id: 'forn-1' });

    // fatura paga aponta pro lançamento de pagamento recriado
    const entries = doProjeto('entries');
    const faturas = doProjeto('faturas');
    expect(faturas[0].entry_id).toBe(entries.find((e) => e.description === 'Sinal').id);
    expect(faturas[1].entry_id).toBeNull();

    // foto da nota, checklist e ata preservados
    expect(entries.find((e) => e.type === 'gasto').receipt_url).toBe('r.jpg');
    expect(doProjeto('checklist_itens')[0]).toMatchObject({ resultado: 'nok', observacao: 'Rearme' });
    expect(doProjeto('checklist_atas')[0]).toMatchObject({ parecer: 'aprovado_ressalvas' });
  });

  it('restaurar por cima substitui os dados sem duplicar', async () => {
    const o = projetoOriginal();
    const backup = buildBackupPayload(o.project, o.entries, o.hours, o.extra);
    const p = await restoreProjectFromBackup(backup);
    await overwriteProjectFromBackup(p.id, backup);
    const doProjeto = (t) => (db[t] || []).filter((r) => r.project_id === p.id);
    expect(doProjeto('entries')).toHaveLength(2);
    expect(doProjeto('faturas')).toHaveLength(2);
    expect(doProjeto('pecas')).toHaveLength(3);
    expect(doProjeto('project_stages')).toHaveLength(12);
    expect(doProjeto('checklist_itens')).toHaveLength(1);
  });

  it('fornecedor excluído do cadastro não derruba a restauração', async () => {
    const o = projetoOriginal();
    const backup = buildBackupPayload(o.project, o.entries, o.hours, o.extra);
    db.fornecedores = []; // o fornecedor do backup foi apagado do cadastro
    antesDeExecutar = (table, q) => {
      if (q.op !== 'insert' || !['encomendas', 'pecas'].includes(table)) return;
      const r = Array.isArray(q.payload) ? q.payload[0] : q.payload;
      if (r.fornecedor_id && !db.fornecedores.some((f) => f.id === r.fornecedor_id)) {
        throw new Error('insert or update violates foreign key constraint');
      }
    };
    const novo = await restoreProjectFromBackup(backup);
    const doProjeto = (t) => (db[t] || []).filter((r) => r.project_id === novo.id);
    expect(doProjeto('encomendas')).toHaveLength(2);
    expect(doProjeto('pecas')).toHaveLength(3);
    expect(doProjeto('pecas')[0].fornecedor_id).toBeNull();
    expect(doProjeto('pecas')[0].encomenda_id).toBe(doProjeto('encomendas')[0].id);
  });
});
