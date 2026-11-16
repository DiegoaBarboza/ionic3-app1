/**
 * Janelas de confirmação/aviso no visual do Zentro, no lugar das caixas
 * cinzas do navegador (confirm/alert/prompt). Uso, de qualquer lugar:
 *
 *   if (!(await confirmar({ titulo: 'Excluir jornada?', confirmar: 'Excluir', perigo: true }))) return;
 *   const opcao = await escolher({ titulo, opcoes: [{ valor: 'a', label: '…' }] });
 *   const nome = await pedirTexto({ titulo, esperado: project.name });
 *   await avisar('Nome não confere.');
 *
 * O componente <Dialogos /> (montado no main.jsx) desenha a janela. Se ele
 * não estiver montado (ex.: testes), cai nas caixas do navegador.
 */

let abrir = null;

/** Chamado pelo <Dialogos /> pra receber os pedidos. */
export function registrarDialogos(fn) {
  abrir = fn;
  return () => {
    if (abrir === fn) abrir = null;
  };
}

function mostrar(config) {
  if (abrir) return new Promise((resolve) => abrir({ ...config, resolve }));
  // reserva: sem o componente montado
  if (config.tipo === 'aviso') {
    globalThis.alert?.(config.mensagem || config.titulo);
    return Promise.resolve(true);
  }
  if (config.tipo === 'texto') return Promise.resolve(globalThis.prompt?.(config.mensagem || config.titulo) ?? null);
  if (config.tipo === 'escolha') {
    const ok = globalThis.confirm?.(`${config.titulo}\n\n${config.mensagem || ''}`);
    return Promise.resolve(ok ? config.opcoes[0].valor : null);
  }
  return Promise.resolve(!!globalThis.confirm?.(`${config.titulo}\n\n${config.mensagem || ''}`));
}

/** Sim/não. Resolve true se confirmou. `perigo` deixa o botão vermelho. */
export function confirmar({ titulo, mensagem, confirmar: textoOk = 'Confirmar', cancelar = 'Cancelar', perigo = false }) {
  return mostrar({ tipo: 'confirmar', titulo, mensagem, textoOk, cancelar, perigo });
}

/** Várias saídas. Resolve o `valor` escolhido, ou null se cancelou. */
export function escolher({ titulo, mensagem, opcoes, cancelar = 'Cancelar' }) {
  return mostrar({ tipo: 'escolha', titulo, mensagem, opcoes, cancelar });
}

/** Pede um texto. Com `esperado`, o botão só libera quando digitar exatamente aquilo. Resolve o texto ou null. */
export function pedirTexto({ titulo, mensagem, confirmar: textoOk = 'Confirmar', cancelar = 'Cancelar', perigo = false, esperado, placeholder }) {
  return mostrar({ tipo: 'texto', titulo, mensagem, textoOk, cancelar, perigo, esperado, placeholder });
}

/** Só informa. Aceita texto direto ou { titulo, mensagem }. */
export function avisar(config) {
  const c = typeof config === 'string' ? { titulo: config } : config;
  return mostrar({ tipo: 'aviso', titulo: c.titulo, mensagem: c.mensagem, textoOk: c.ok || 'Entendi' });
}
