import { useEffect, useState } from 'react';
import { updateProject } from '../data/projects.js';
import { todayLocal } from '../lib/calc.js';

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function dataLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function duracao(ms) {
  const min = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

/** Jornadas a partir de 6h normalmente têm almoço; abaixo disso, não. */
const HORAS_COM_ALMOCO = 6;

/**
 * Atalhos pra lançar horas no celular:
 * - Cronômetro: "Iniciar" grava o instante no projeto (projects.cronometro_inicio,
 *   então continua valendo se fechar o app ou trocar de aparelho); "Parar"
 *   preenche o formulário com data, início e fim pra você revisar e salvar.
 * - Repetir a última jornada: copia horário, almoço, deslocamento e área da
 *   jornada mais recente, com a data de hoje (a descrição fica em branco).
 */
export default function JornadaRapida({ project, hours, setProject, onFill }) {
  const inicio = project.cronometro_inicio ? new Date(project.cronometro_inicio) : null;
  const [agora, setAgora] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!inicio) return undefined;
    const t = setInterval(() => setAgora(Date.now()), 30000);
    setAgora(Date.now());
    return () => clearInterval(t);
  }, [project.cronometro_inicio]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvarInicio(valor) {
    const updated = await updateProject(project.id, { cronometro_inicio: valor });
    setProject(updated);
  }

  async function iniciar() {
    setBusy(true);
    setErro('');
    try {
      await salvarInicio(new Date().toISOString());
    } catch (err) {
      setErro('Não foi possível iniciar: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function parar() {
    const fim = new Date();
    const horas = (fim - inicio) / 3600000;
    setBusy(true);
    setErro('');
    try {
      await salvarInicio(null);
      onFill({
        date: dataLocal(inicio),
        start_time: hhmm(inicio),
        end_time: hhmm(fim),
        lunch: horas >= HORAS_COM_ALMOCO
      });
    } catch (err) {
      setErro('Não foi possível parar: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function descartar() {
    if (!confirm('Descartar o cronômetro em andamento? Nada será lançado.')) return;
    setBusy(true);
    try {
      await salvarInicio(null);
    } catch (err) {
      setErro(err.message);
    } finally {
      setBusy(false);
    }
  }

  const ultima = hours[0];

  function repetirUltima() {
    onFill({
      date: todayLocal(),
      start_time: ultima.start_time?.slice(0, 5) || '08:00',
      end_time: ultima.end_time?.slice(0, 5) || '17:00',
      lunch: ultima.lunch ?? true,
      description: '',
      km_ida: ultima.km_ida || '',
      km_volta: ultima.km_volta || '',
      valor_km: ultima.valor_km || '',
      pedagio: ultima.pedagio || '',
      stage_id: ultima.stage_id || ''
    });
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      {inicio ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div className="label">⏱️ Jornada em andamento</div>
            <div className="value mono" style={{ fontSize: 26, fontWeight: 600, color: 'var(--accent)' }}>
              {duracao(agora - inicio)}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              desde {hhmm(inicio)}
              {dataLocal(inicio) !== todayLocal() && ` de ${inicio.toLocaleDateString('pt-BR')}`}
            </div>
          </div>
          <div className="btn-row">
            <button className="primary" onClick={parar} disabled={busy}>
              ⏹️ Parar e preencher
            </button>
            <button className="ghost" onClick={descartar} disabled={busy}>
              Descartar
            </button>
          </div>
        </div>
      ) : (
        <div className="btn-row">
          <button className="primary" onClick={iniciar} disabled={busy}>
            ▶️ Iniciar jornada agora
          </button>
          {ultima && (
            <button onClick={repetirUltima} title="Copia horário, almoço, deslocamento e área da última jornada">
              ↺ Repetir última jornada ({ultima.start_time?.slice(0, 5)}–{ultima.end_time?.slice(0, 5)})
            </button>
          )}
        </div>
      )}
      {erro && <p className="error-text" style={{ marginTop: 8 }}>{erro}</p>}
      {!inicio && (
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Toque em Iniciar ao chegar no cliente e em Parar ao sair: o formulário abaixo é preenchido sozinho pra você
          revisar, escrever a atividade e registrar.
        </p>
      )}
    </div>
  );
}
