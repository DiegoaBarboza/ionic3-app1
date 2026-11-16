import { useEffect, useRef, useState } from 'react';
import { registrarDialogos } from '../lib/dialogo.js';

/** Desenha as janelas pedidas por lib/dialogo.js (uma por vez, em fila). */
export default function Dialogos() {
  const [fila, setFila] = useState([]);
  const [texto, setTexto] = useState('');
  const principalRef = useRef(null);
  const inputRef = useRef(null);
  const atual = fila[0];

  useEffect(() => registrarDialogos((config) => setFila((f) => [...f, config])), []);

  useEffect(() => {
    if (!atual) return undefined;
    setTexto('');
    const t = setTimeout(() => (atual.tipo === 'texto' ? inputRef.current : principalRef.current)?.focus(), 30);
    return () => clearTimeout(t);
  }, [atual]);

  function fechar(valor) {
    atual.resolve(valor);
    setFila((f) => f.slice(1));
  }

  function cancelar() {
    if (atual.tipo === 'aviso') return fechar(true);
    if (atual.tipo === 'confirmar') return fechar(false);
    return fechar(null);
  }

  useEffect(() => {
    if (!atual) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!atual) return null;

  const textoOk = atual.tipo === 'texto' && atual.esperado != null ? texto.trim() === atual.esperado : true;

  return (
    <div className="dialogo-fundo" onClick={cancelar}>
      <div
        className="dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogo-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dialogo-titulo" className="dialogo-titulo">
          {atual.titulo}
        </h2>
        {atual.mensagem && <div className="dialogo-mensagem">{atual.mensagem}</div>}

        {atual.tipo === 'texto' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (textoOk) fechar(texto.trim());
            }}
          >
            <input
              ref={inputRef}
              value={texto}
              placeholder={atual.placeholder || atual.esperado || ''}
              onChange={(e) => setTexto(e.target.value)}
              style={{ width: '100%', marginTop: 4 }}
            />
          </form>
        )}

        <div className="dialogo-botoes">
          {atual.tipo === 'escolha' ? (
            <>
              {atual.opcoes.map((op, i) => (
                <button
                  key={op.valor}
                  ref={i === 0 ? principalRef : undefined}
                  className={op.perigo ? 'danger-solid' : i === 0 ? 'primary' : ''}
                  onClick={() => fechar(op.valor)}
                >
                  {op.label}
                </button>
              ))}
              <button className="ghost" onClick={() => fechar(null)}>
                {atual.cancelar}
              </button>
            </>
          ) : atual.tipo === 'aviso' ? (
            <button ref={principalRef} className="primary" onClick={() => fechar(true)}>
              {atual.textoOk}
            </button>
          ) : (
            <>
              <button
                ref={principalRef}
                className={atual.perigo ? 'danger-solid' : 'primary'}
                disabled={!textoOk}
                onClick={() => fechar(atual.tipo === 'texto' ? texto.trim() : true)}
              >
                {atual.textoOk}
              </button>
              <button className="ghost" onClick={cancelar}>
                {atual.cancelar}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
