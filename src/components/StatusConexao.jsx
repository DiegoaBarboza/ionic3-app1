import { useEffect, useState } from 'react';
import { EVENTO_FILA, lerFila, sincronizar } from '../lib/offline.js';

const INTERVALO_MS = 30000;

/**
 * Faixa fixa no rodapé: avisa quando está sem internet e quantos lançamentos
 * estão esperando envio, e manda a fila sozinho quando o sinal volta (ao
 * reconectar, ao abrir o app e a cada 30s enquanto houver pendência).
 */
export default function StatusConexao() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [fila, setFila] = useState(() => lerFila());
  const [enviando, setEnviando] = useState(false);
  const [ultimoEnvio, setUltimoEnvio] = useState(null);

  async function enviar() {
    if (lerFila().length === 0 || navigator.onLine === false) return;
    setEnviando(true);
    try {
      const r = await sincronizar();
      if (r.enviados > 0) {
        setUltimoEnvio(r.enviados);
        setTimeout(() => setUltimoEnvio(null), 5000);
      }
    } finally {
      setEnviando(false);
      setFila(lerFila());
    }
  }

  useEffect(() => {
    const atualizarFila = () => setFila(lerFila());
    const ficouOnline = () => {
      setOnline(true);
      enviar();
    };
    const ficouOffline = () => setOnline(false);
    window.addEventListener(EVENTO_FILA, atualizarFila);
    window.addEventListener('online', ficouOnline);
    window.addEventListener('offline', ficouOffline);
    // fila de outra aba / app reaberto
    window.addEventListener('storage', atualizarFila);
    enviar();
    const t = setInterval(enviar, INTERVALO_MS);
    return () => {
      window.removeEventListener(EVENTO_FILA, atualizarFila);
      window.removeEventListener('online', ficouOnline);
      window.removeEventListener('offline', ficouOffline);
      window.removeEventListener('storage', atualizarFila);
      clearInterval(t);
    };
  }, []);

  const comErro = fila.filter((i) => i.erro).length;
  const aguardando = fila.length - comErro;

  let texto = null;
  let cor = 'var(--accent)';
  if (!online) {
    cor = '#475569';
    texto = aguardando
      ? `📴 Sem internet — ${aguardando} ${aguardando > 1 ? 'lançamentos guardados' : 'lançamento guardado'} no aparelho, envio automático quando o sinal voltar`
      : '📴 Sem internet — dá pra lançar horas e gastos; eles são enviados quando o sinal voltar';
  } else if (enviando && aguardando) {
    texto = `🔄 Enviando ${aguardando} ${aguardando > 1 ? 'lançamentos' : 'lançamento'} guardados…`;
  } else if (aguardando) {
    texto = `⏳ ${aguardando} ${aguardando > 1 ? 'lançamentos aguardando' : 'lançamento aguardando'} envio`;
  } else if (ultimoEnvio) {
    cor = '#15803d';
    texto = `✓ ${ultimoEnvio} ${ultimoEnvio > 1 ? 'lançamentos enviados' : 'lançamento enviado'}`;
  }
  if (comErro) {
    cor = 'var(--negative)';
    texto = `${texto ? texto + ' · ' : ''}⚠️ ${comErro} não ${comErro > 1 ? 'puderam' : 'pôde'} ser enviado${comErro > 1 ? 's' : ''} — veja na lista e descarte ou relance`;
  }
  if (!texto) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 50,
        margin: '0 auto',
        maxWidth: 640,
        padding: '10px 14px',
        borderRadius: 12,
        background: cor,
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 8px 24px -8px rgba(20, 55, 80, 0.45)',
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }}
    >
      <span style={{ flex: 1 }}>{texto}</span>
      {online && aguardando > 0 && !enviando && (
        <button
          type="button"
          onClick={enviar}
          style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '4px 10px' }}
        >
          Enviar agora
        </button>
      )}
    </div>
  );
}
