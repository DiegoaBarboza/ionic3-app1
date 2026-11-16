import { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import {
  CATEGORIAS_ANEXO,
  LIMITE_BYTES,
  abrirAnexo,
  categoriaAnexo,
  deleteAnexo,
  formatTamanho,
  listAnexos,
  updateAnexo,
  uploadAnexo
} from '../data/anexos.js';
import { confirmar } from '../lib/dialogo.js';

function dataCurta(ts) {
  return new Date(ts).toLocaleDateString('pt-BR');
}

/**
 * Arquivos do projeto: desenhos, diagramas elétricos, fotos de campo,
 * propostas, atas de FAT/SAT. Ficam no bucket privado "anexos" do Supabase e
 * abrem com link temporário.
 */
export default function Anexos() {
  const { project } = useProject();
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const [anexos, setAnexos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoria, setCategoria] = useState('desenho');
  const [descricao, setDescricao] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [enviando, setEnviando] = useState(null);
  const [erro, setErro] = useState('');
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState({ descricao: '', categoria: 'outro' });

  async function reload() {
    setAnexos(await listAnexos(project.id));
  }

  useEffect(() => {
    let active = true;
    listAnexos(project.id)
      .then((a) => active && setAnexos(a))
      .catch((err) => active && setErro(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [project.id]);

  const contagem = useMemo(() => {
    const c = { todos: anexos.length };
    for (const a of anexos) c[a.categoria] = (c[a.categoria] || 0) + 1;
    return c;
  }, [anexos]);

  const visiveis = filtro === 'todos' ? anexos : anexos.filter((a) => a.categoria === filtro);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setErro('');
    const grandes = files.filter((f) => f.size > LIMITE_BYTES);
    const ok = files.filter((f) => f.size <= LIMITE_BYTES);
    const falhas = grandes.map((f) => `"${f.name}" passa de 50 MB`);
    for (let i = 0; i < ok.length; i++) {
      setEnviando(`Enviando ${i + 1} de ${ok.length}: ${ok[i].name}`);
      try {
        await uploadAnexo(project.id, ok[i], {
          categoria,
          descricao: descricao.trim() || null
        });
      } catch (err) {
        falhas.push(`"${ok[i].name}": ${err.message}`);
      }
    }
    setEnviando(null);
    setDescricao('');
    if (falhas.length) setErro('Não enviados: ' + falhas.join('; '));
    await reload();
  }

  async function handleDelete(a) {
    if (!(await confirmar({ titulo: `Excluir "${a.nome}"?`, mensagem: 'O arquivo é apagado de vez.', confirmar: 'Excluir', cancelar: 'Manter', perigo: true }))) return;
    setErro('');
    try {
      await deleteAnexo(a);
      await reload();
    } catch (err) {
      setErro(err.message);
    }
  }

  async function handleAbrir(a, baixar = false) {
    setErro('');
    try {
      await abrirAnexo(a, { baixar });
    } catch (err) {
      setErro('Não foi possível abrir o arquivo: ' + err.message);
    }
  }

  async function salvarEdicao(a) {
    setErro('');
    try {
      await updateAnexo(a.id, { descricao: editDraft.descricao.trim() || null, categoria: editDraft.categoria });
      setEditId(null);
      await reload();
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          Adicionar arquivos
        </div>
        <div className="form-row">
          <div className="field">
            <label>Tipo</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {CATEGORIAS_ANEXO.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label>Descrição (opcional)</label>
            <input
              value={descricao}
              placeholder="Ex.: Layout geral rev. B"
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
        </div>
        <div className="btn-row">
          <button className="primary" onClick={() => fileRef.current?.click()} disabled={!!enviando}>
            📎 Escolher arquivos
          </button>
          <button onClick={() => cameraRef.current?.click()} disabled={!!enviando}>
            📷 Tirar foto
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {enviando && <p className="muted" style={{ marginTop: 8 }}>{enviando}…</p>}
        {erro && <p className="error-text" style={{ marginTop: 8 }}>{erro}</p>}
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          PDF, DWG, imagens, planilhas — qualquer arquivo até 50 MB. Ficam guardados de forma privada e só abrem logado.
        </p>
      </div>

      {anexos.length > 0 && (
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className={filtro === 'todos' ? 'primary' : ''} onClick={() => setFiltro('todos')}>
            Todos ({contagem.todos})
          </button>
          {CATEGORIAS_ANEXO.filter((c) => contagem[c.value]).map((c) => (
            <button key={c.value} className={filtro === c.value ? 'primary' : ''} onClick={() => setFiltro(c.value)}>
              {c.icon} {c.label} ({contagem[c.value]})
            </button>
          ))}
        </div>
      )}

      <div className="panel">
        {loading && <p className="muted">Carregando anexos…</p>}
        {!loading && anexos.length === 0 && <p className="muted">Nenhum arquivo neste projeto ainda.</p>}
        {visiveis.map((a) => {
          const cat = categoriaAnexo(a.categoria);
          const editando = editId === a.id;
          return (
            <div key={a.id} className="list-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 20 }}>{cat.icon}</span>
                  <button
                    className="ghost"
                    style={{
                      padding: 0,
                      fontWeight: 600,
                      textAlign: 'left',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0
                    }}
                    title={a.nome}
                    onClick={() => handleAbrir(a)}
                  >
                    {a.nome}
                  </button>
                </div>
                {editando ? (
                  <div className="form-row" style={{ marginTop: 6 }}>
                    <select
                      value={editDraft.categoria}
                      onChange={(e) => setEditDraft({ ...editDraft, categoria: e.target.value })}
                    >
                      {CATEGORIAS_ANEXO.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.icon} {c.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={editDraft.descricao}
                      placeholder="Descrição"
                      onChange={(e) => setEditDraft({ ...editDraft, descricao: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    {cat.label} · {formatTamanho(a.tamanho)} · {dataCurta(a.created_at)}
                    {a.descricao && ` · ${a.descricao}`}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {editando ? (
                  <>
                    <button className="primary" onClick={() => salvarEdicao(a)}>
                      Salvar
                    </button>
                    <button onClick={() => setEditId(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button className="ghost" onClick={() => handleAbrir(a)}>
                      Abrir
                    </button>
                    <button className="ghost" onClick={() => handleAbrir(a, true)}>
                      Baixar
                    </button>
                    <button
                      className="ghost"
                      onClick={() => {
                        setEditId(a.id);
                        setEditDraft({ descricao: a.descricao || '', categoria: a.categoria });
                      }}
                    >
                      Editar
                    </button>
                    <button className="ghost danger" onClick={() => handleDelete(a)}>
                      Excluir
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
