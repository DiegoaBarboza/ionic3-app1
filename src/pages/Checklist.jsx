import { useEffect, useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import {
  PARECERES,
  RESULTADOS,
  addItem,
  agrupar,
  criarChecklistDoModelo,
  deleteItem,
  getAta,
  listChecklist,
  progresso,
  saveAta,
  updateItem
} from '../data/checklists.js';
import { buildChecklistAtaHtml } from '../lib/report.js';

const ATA_VAZIA = {
  data_teste: '',
  local_teste: '',
  participantes_cliente: '',
  participantes_zenite: '',
  parecer: '',
  observacoes: ''
};

function ItemRow({ it, onChange, onDelete }) {
  const [obs, setObs] = useState(it.observacao || '');
  useEffect(() => setObs(it.observacao || ''), [it.observacao]);
  const precisaObs = it.resultado === 'nok' && !obs.trim();

  return (
    <div className="list-row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{it.item}</div>
        <input
          value={obs}
          placeholder={it.resultado === 'nok' ? 'O que está errado e o que fazer (obrigatório no não OK)' : 'Observação'}
          onChange={(e) => setObs(e.target.value)}
          onBlur={() => obs !== (it.observacao || '') && onChange(it, { observacao: obs.trim() || null })}
          style={{ marginTop: 6, fontSize: 13, width: '100%', ...(precisaObs ? { borderColor: 'var(--negative)' } : {}) }}
        />
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {RESULTADOS.map((r) => {
          const ativo = it.resultado === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => onChange(it, { resultado: ativo ? 'pendente' : r.value })}
              style={
                ativo
                  ? { background: r.color, color: '#fff', borderColor: r.color, fontWeight: 600 }
                  : { color: r.color }
              }
            >
              {r.label}
            </button>
          );
        })}
        <button type="button" className="ghost danger" title="Remover item" onClick={() => onDelete(it)}>
          ✕
        </button>
      </div>
    </div>
  );
}

/**
 * Checklist de FAT (fábrica) e SAT (cliente) para Construção de Máquinas.
 * Começa de um modelo editável; cada item é marcado OK / Não OK / N/A com
 * observação, e no fim gera a ata pra imprimir/salvar em PDF e assinar.
 */
export default function Checklist() {
  const { project } = useProject();
  const [tipo, setTipo] = useState('fat');
  const [itens, setItens] = useState([]);
  const [ata, setAta] = useState(ATA_VAZIA);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState({ grupo: '', item: '' });
  const [ataStatus, setAtaStatus] = useState('');

  async function carregar(t = tipo) {
    const [its, a] = await Promise.all([listChecklist(project.id, t), getAta(project.id, t)]);
    setItens(its);
    setAta(a ? { ...ATA_VAZIA, ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v ?? ''])) } : ATA_VAZIA);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErro('');
    Promise.all([listChecklist(project.id, tipo), getAta(project.id, tipo)])
      .then(([its, a]) => {
        if (!active) return;
        setItens(its);
        setAta(a ? { ...ATA_VAZIA, ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v ?? ''])) } : ATA_VAZIA);
      })
      .catch((err) => active && setErro(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [project.id, tipo]);

  const grupos = agrupar(itens);
  const prog = progresso(itens);
  const verificados = prog.total - prog.pendente;

  async function criarDoModelo() {
    setBusy(true);
    setErro('');
    try {
      await criarChecklistDoModelo(project.id, tipo);
      await carregar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleChange(it, fields) {
    setItens((lista) => lista.map((x) => (x.id === it.id ? { ...x, ...fields } : x)));
    try {
      await updateItem(it.id, fields);
    } catch (err) {
      setErro('Não salvou: ' + err.message);
      await carregar();
    }
  }

  async function handleDelete(it) {
    if (!confirm(`Remover o item "${it.item}" do checklist?`)) return;
    try {
      await deleteItem(it.id);
      setItens((lista) => lista.filter((x) => x.id !== it.id));
    } catch (err) {
      setErro(err.message);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    const grupo = novo.grupo.trim();
    const item = novo.item.trim();
    if (!grupo || !item) return;
    try {
      const doGrupo = itens.filter((x) => x.grupo === grupo);
      const ordem = doGrupo.length
        ? Math.max(...doGrupo.map((x) => x.ordem)) + 1
        : Math.max(0, ...itens.map((x) => x.ordem)) + 10;
      const criado = await addItem(project.id, tipo, grupo, item, ordem);
      setItens((lista) => [...lista, criado].sort((a, b) => a.ordem - b.ordem));
      setNovo({ grupo, item: '' });
    } catch (err) {
      setErro(err.message);
    }
  }

  async function salvarAta(campos) {
    const proxima = { ...ata, ...campos };
    setAta(proxima);
    setAtaStatus('salvando…');
    try {
      await saveAta(project.id, tipo, {
        data_teste: proxima.data_teste || null,
        local_teste: proxima.local_teste || null,
        participantes_cliente: proxima.participantes_cliente || null,
        participantes_zenite: proxima.participantes_zenite || null,
        parecer: proxima.parecer || null,
        observacoes: proxima.observacoes || null
      });
      setAtaStatus('✓ salvo');
      setTimeout(() => setAtaStatus(''), 2000);
    } catch (err) {
      setAtaStatus('erro ao salvar');
      setErro(err.message);
    }
  }

  function campoAta(nome) {
    return {
      value: ata[nome],
      onChange: (e) => setAta({ ...ata, [nome]: e.target.value }),
      onBlur: (e) => salvarAta({ [nome]: e.target.value })
    };
  }

  function imprimirAta() {
    const html = buildChecklistAtaHtml({ project, tipo, ata, grupos, prog });
    const win = window.open('', '_blank');
    if (!win) {
      setErro('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  }

  const nomeTipo = tipo === 'fat' ? 'FAT — na fábrica' : 'SAT — no cliente';

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button className={tipo === 'fat' ? 'primary' : ''} onClick={() => setTipo('fat')}>
          FAT (fábrica)
        </button>
        <button className={tipo === 'sat' ? 'primary' : ''} onClick={() => setTipo('sat')}>
          SAT (cliente)
        </button>
      </div>

      {erro && <p className="error-text">{erro}</p>}
      {loading && <p className="muted">Carregando checklist…</p>}

      {!loading && itens.length === 0 && (
        <div className="panel">
          <p style={{ marginBottom: 12 }}>
            Ainda não tem checklist de <strong>{nomeTipo}</strong> neste projeto.
          </p>
          <button className="primary" onClick={criarDoModelo} disabled={busy}>
            {busy ? 'Criando…' : 'Criar a partir do modelo padrão'}
          </button>
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            O modelo traz itens de documentação, segurança (NR-12), mecânica, elétrica, automação e desempenho. Depois dá
            pra remover o que não se aplica e incluir itens próprios.
          </p>
        </div>
      )}

      {!loading && itens.length > 0 && (
        <>
          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="label">Verificados</div>
              <div className="value mono">
                {verificados}/{prog.total}
              </div>
            </div>
            <div className="stat-card">
              <div className="label">OK</div>
              <div className="money positive">{prog.ok}</div>
            </div>
            <div className="stat-card">
              <div className="label">Não OK</div>
              <div className={'money' + (prog.nok ? ' negative' : '')}>{prog.nok}</div>
            </div>
            <div className="stat-card">
              <div className="label">N/A</div>
              <div className="value mono">{prog.na}</div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 10 }}>
              Dados da ata {ataStatus && <span className="muted" style={{ marginLeft: 8, textTransform: 'none' }}>{ataStatus}</span>}
            </div>
            <div className="form-row">
              <div className="field">
                <label>Data do teste</label>
                <input type="date" {...campoAta('data_teste')} onChange={(e) => salvarAta({ data_teste: e.target.value })} />
              </div>
              <div className="field">
                <label>Local</label>
                <input placeholder={project.location || ''} {...campoAta('local_teste')} />
              </div>
              <div className="field">
                <label>Parecer</label>
                <select value={ata.parecer} onChange={(e) => salvarAta({ parecer: e.target.value })}>
                  <option value="">— em andamento —</option>
                  {PARECERES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Participantes do cliente</label>
                <input {...campoAta('participantes_cliente')} />
              </div>
              <div className="field">
                <label>Participantes da Zênite</label>
                <input {...campoAta('participantes_zenite')} />
              </div>
            </div>
            <div className="field">
              <label>Observações / ressalvas</label>
              <textarea rows={2} {...campoAta('observacoes')} />
            </div>
            <div className="btn-row">
              <button className="primary" onClick={imprimirAta}>
                🖨️ Gerar ata (imprimir / PDF)
              </button>
            </div>
            {prog.pendente > 0 && (
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Ainda há {prog.pendente} {prog.pendente > 1 ? 'itens pendentes' : 'item pendente'} — eles saem como
                "Pendente" na ata.
              </p>
            )}
          </div>

          {grupos.map((g) => {
            const pg = progresso(g.itens);
            return (
              <div key={g.grupo} className="panel" style={{ marginBottom: 12 }}>
                <div className="label" style={{ marginBottom: 6 }}>
                  {g.grupo}{' '}
                  <span className="muted" style={{ textTransform: 'none' }}>
                    · {pg.total - pg.pendente}/{pg.total}
                    {pg.nok ? ` · ${pg.nok} não OK` : ''}
                  </span>
                </div>
                {g.itens.map((it) => (
                  <ItemRow key={it.id} it={it} onChange={handleChange} onDelete={handleDelete} />
                ))}
              </div>
            );
          })}

          <form className="panel" onSubmit={handleAdd}>
            <div className="label" style={{ marginBottom: 10 }}>
              Incluir item
            </div>
            <div className="form-row">
              <div className="field">
                <label>Grupo</label>
                <input
                  list="grupos-checklist"
                  value={novo.grupo}
                  placeholder="Escolha ou digite um grupo novo"
                  onChange={(e) => setNovo({ ...novo, grupo: e.target.value })}
                />
                <datalist id="grupos-checklist">
                  {grupos.map((g) => (
                    <option key={g.grupo} value={g.grupo} />
                  ))}
                </datalist>
              </div>
              <div className="field" style={{ flex: 2 }}>
                <label>Item a verificar</label>
                <input value={novo.item} onChange={(e) => setNovo({ ...novo, item: e.target.value })} />
              </div>
            </div>
            <button type="submit">+ Incluir</button>
          </form>
        </>
      )}
    </div>
  );
}
