import { supabase } from './supabaseClient.js';

/**
 * Funcionamento sem internet (fase 1: horas e gastos/receitas).
 *
 * - Fila: lançamentos criados sem sinal ficam guardados no aparelho e são
 *   enviados sozinhos quando a conexão volta (evento "online", ao abrir o
 *   app e a cada 30s enquanto houver pendência).
 * - Cache: a última versão carregada de cada projeto (e da lista do Início)
 *   fica guardada, pra dar pra abrir e lançar mesmo sem sinal.
 *
 * Guarda no localStorage do aparelho: é por aparelho e some se o navegador
 * apagar os dados do site — por isso a fila é enviada assim que possível.
 */

const FILA_KEY = 'zentro-fila-offline-v1';
const CACHE_PREFIX = 'zentro-cache-v1:';
export const EVENTO_FILA = 'zentro-fila-mudou';
export const EVENTO_SINCRONIZADO = 'zentro-sincronizado';
const TABELAS = ['hours', 'entries'];

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function ler(key, padrao) {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(key, valor) {
  try {
    storage()?.setItem(key, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

function avisar(nome) {
  try {
    globalThis.dispatchEvent?.(new Event(nome));
  } catch {
    // ambiente sem eventos (testes)
  }
}

export function estaOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Login expirado/sem sessão: não é culpa do lançamento — tenta de novo depois. */
export function ehErroDeSessao(err) {
  const msg = String(err?.message || err || '');
  return err?.status === 401 || /jwt|token|expired|not authenticated|invalid claim/i.test(msg);
}

/** Erro de rede (sem sinal / servidor inalcançável), e não erro de dado inválido. */
export function ehErroDeRede(err) {
  if (estaOffline()) return true;
  const msg = String(err?.message || err || '');
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|aborted/i.test(msg);
}

// ---------- fila ----------

export function lerFila() {
  return ler(FILA_KEY, []);
}

function gravarFila(fila) {
  const ok = gravar(FILA_KEY, fila);
  avisar(EVENTO_FILA);
  return ok;
}

/** Guarda o lançamento pra enviar depois. Devolve um registro "pendente" pra já aparecer na tela. */
export function enfileirar(tabela, projectId, payload) {
  if (!TABELAS.includes(tabela)) throw new Error(`Tabela ${tabela} não pode ir pra fila offline`);
  const item = {
    localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tabela,
    projectId,
    payload,
    criadoEm: new Date().toISOString(),
    erro: null
  };
  if (!gravarFila([...lerFila(), item])) {
    throw new Error('Sem internet e sem espaço no aparelho pra guardar o lançamento.');
  }
  return paraRegistro(item);
}

function paraRegistro(item) {
  return { ...item.payload, id: item.localId, project_id: item.projectId, _pendente: true, _erro: item.erro };
}

/** Pendentes de um projeto e tabela, no formato de registro (pra misturar na lista da tela). */
export function pendentes(projectId, tabela) {
  return lerFila()
    .filter((i) => i.projectId === projectId && i.tabela === tabela)
    .map(paraRegistro);
}

export function descartar(localId) {
  gravarFila(lerFila().filter((i) => i.localId !== localId));
}

let enviando = null;

/**
 * Envia a fila. Para no primeiro erro de rede (tenta de novo depois). Erro
 * de dado (ex.: projeto excluído) marca o item com o motivo e segue pros
 * outros — ele fica na tela pra você descartar.
 */
export function sincronizar() {
  if (enviando) return enviando;
  enviando = (async () => {
    const resultado = { enviados: 0, comErro: 0, restantes: 0 };
    if (estaOffline()) {
      resultado.restantes = lerFila().length;
      return resultado;
    }
    // garante login válido antes de enviar (renova se expirou enquanto estava sem sinal)
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        resultado.restantes = lerFila().length;
        return resultado;
      }
    } catch {
      resultado.restantes = lerFila().length;
      return resultado;
    }
    for (const item of lerFila()) {
      if (item.erro) {
        resultado.comErro++;
        continue;
      }
      let erro = null;
      try {
        const { error } = await supabase.from(item.tabela).insert({ ...item.payload, project_id: item.projectId });
        erro = error;
      } catch (err) {
        erro = err;
      }
      if (!erro) {
        gravarFila(lerFila().filter((i) => i.localId !== item.localId));
        resultado.enviados++;
      } else if (ehErroDeRede(erro) || ehErroDeSessao(erro)) {
        break;
      } else {
        gravarFila(lerFila().map((i) => (i.localId === item.localId ? { ...i, erro: erro.message || String(erro) } : i)));
        resultado.comErro++;
      }
    }
    resultado.restantes = lerFila().length;
    if (resultado.enviados > 0) avisar(EVENTO_SINCRONIZADO);
    return resultado;
  })().finally(() => {
    enviando = null;
  });
  return enviando;
}

/**
 * Cria o lançamento online; se estiver sem sinal (ou a rede falhar), põe na
 * fila em vez de dar erro. `inserirOnline` é a função normal de criação.
 */
export async function criarOuEnfileirar(tabela, projectId, payload, inserirOnline) {
  if (estaOffline()) return enfileirar(tabela, projectId, payload);
  try {
    return await inserirOnline();
  } catch (err) {
    if (ehErroDeRede(err)) return enfileirar(tabela, projectId, payload);
    throw err;
  }
}

// ---------- cache de leitura ----------

export function guardarCache(chave, dados) {
  gravar(CACHE_PREFIX + chave, { dados, em: new Date().toISOString() });
}

export function lerCache(chave) {
  return ler(CACHE_PREFIX + chave, null);
}
