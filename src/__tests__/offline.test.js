import { beforeEach, describe, expect, it, vi } from 'vitest';

// localStorage e navigator.onLine de mentira (os testes rodam em Node)
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const nav = { onLine: true };
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });

// o que o "servidor" responde a cada insert
const inserts = [];
let responder = () => ({ error: null });
let sessao = { user: { id: 'u1' } };
vi.mock('../lib/supabaseClient.js', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: sessao } }) },
    from: (tabela) => ({
      insert: async (row) => {
        const r = responder(tabela, row);
        if (!r.error) inserts.push({ tabela, row });
        return r;
      }
    })
  }
}));

import { criarOuEnfileirar, descartar, ehErroDeRede, lerFila, pendentes, sincronizar } from '../lib/offline.js';

beforeEach(() => {
  mem.clear();
  inserts.length = 0;
  nav.onLine = true;
  responder = () => ({ error: null });
  sessao = { user: { id: 'u1' } };
});

const jornada = { date: '2026-11-16', start_time: '08:00', end_time: '17:00', hours: 8 };

describe('fila offline', () => {
  it('online: grava direto, sem fila', async () => {
    const online = vi.fn(async () => ({ id: 'srv-1', ...jornada }));
    const r = await criarOuEnfileirar('hours', 'p1', jornada, online);
    expect(online).toHaveBeenCalled();
    expect(r.id).toBe('srv-1');
    expect(lerFila()).toHaveLength(0);
  });

  it('sem sinal: guarda no aparelho e aparece como pendente', async () => {
    nav.onLine = false;
    const online = vi.fn();
    const r = await criarOuEnfileirar('hours', 'p1', jornada, online);
    expect(online).not.toHaveBeenCalled();
    expect(r).toMatchObject({ _pendente: true, project_id: 'p1', hours: 8 });
    expect(pendentes('p1', 'hours')).toHaveLength(1);
    expect(pendentes('p1', 'entries')).toHaveLength(0);
    expect(pendentes('outro', 'hours')).toHaveLength(0);
  });

  it('rede cai no meio do envio: vai pra fila em vez de dar erro', async () => {
    const r = await criarOuEnfileirar('entries', 'p1', { amount: 50 }, async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(r._pendente).toBe(true);
    expect(lerFila()).toHaveLength(1);
  });

  it('erro de dado (não de rede) continua sendo erro na tela', async () => {
    await expect(
      criarOuEnfileirar('entries', 'p1', { amount: -1 }, async () => {
        throw new Error('new row violates check constraint');
      })
    ).rejects.toThrow('check constraint');
    expect(lerFila()).toHaveLength(0);
  });

  it('volta o sinal: envia tudo na ordem e limpa a fila', async () => {
    nav.onLine = false;
    await criarOuEnfileirar('hours', 'p1', { ...jornada, date: '2026-11-14' }, vi.fn());
    await criarOuEnfileirar('entries', 'p1', { amount: 80 }, vi.fn());
    nav.onLine = true;
    const r = await sincronizar();
    expect(r).toEqual({ enviados: 2, comErro: 0, restantes: 0 });
    expect(inserts.map((i) => [i.tabela, i.row.project_id])).toEqual([
      ['hours', 'p1'],
      ['entries', 'p1']
    ]);
    expect(inserts[0].row).not.toHaveProperty('_pendente');
  });

  it('ainda sem sinal: não tenta enviar', async () => {
    nav.onLine = false;
    await criarOuEnfileirar('hours', 'p1', jornada, vi.fn());
    const r = await sincronizar();
    expect(r.restantes).toBe(1);
    expect(inserts).toHaveLength(0);
  });

  it('rede falha no envio: para e mantém tudo pra tentar depois', async () => {
    nav.onLine = false;
    await criarOuEnfileirar('hours', 'p1', jornada, vi.fn());
    await criarOuEnfileirar('hours', 'p1', jornada, vi.fn());
    nav.onLine = true;
    responder = () => ({ error: { message: 'TypeError: Failed to fetch' } });
    const r = await sincronizar();
    expect(r).toMatchObject({ enviados: 0, restantes: 2 });
    expect(lerFila().every((i) => !i.erro)).toBe(true);
  });

  it('login expirado: não marca erro, tenta de novo depois', async () => {
    nav.onLine = false;
    await criarOuEnfileirar('hours', 'p1', jornada, vi.fn());
    nav.onLine = true;
    responder = () => ({ error: { message: 'JWT expired', status: 401 } });
    await sincronizar();
    expect(lerFila()[0].erro).toBeNull();
    sessao = null;
    responder = () => ({ error: null });
    const semLogin = await sincronizar();
    expect(semLogin.restantes).toBe(1);
  });

  it('item com dado inválido fica marcado e não trava os outros', async () => {
    nav.onLine = false;
    await criarOuEnfileirar('hours', 'apagado', jornada, vi.fn());
    await criarOuEnfileirar('hours', 'p1', jornada, vi.fn());
    nav.onLine = true;
    responder = (t, row) =>
      row.project_id === 'apagado' ? { error: { message: 'violates foreign key constraint' } } : { error: null };
    const r = await sincronizar();
    expect(r).toEqual({ enviados: 1, comErro: 1, restantes: 1 });
    const [ruim] = lerFila();
    expect(ruim.erro).toMatch(/foreign key/);
    expect(pendentes('apagado', 'hours')[0]._erro).toMatch(/foreign key/);
    descartar(ruim.localId);
    expect(lerFila()).toHaveLength(0);
  });

  it('reconhece mensagens de erro de rede dos navegadores', () => {
    expect(ehErroDeRede(new TypeError('Failed to fetch'))).toBe(true); // Chrome
    expect(ehErroDeRede(new TypeError('Load failed'))).toBe(true); // Safari / iPhone
    expect(ehErroDeRede(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true); // Firefox
    expect(ehErroDeRede(new Error('duplicate key value'))).toBe(false);
  });
});
