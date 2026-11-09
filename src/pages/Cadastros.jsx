import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createFornecedor,
  deleteFornecedor,
  listFornecedores,
  updateFornecedor
} from '../data/fornecedores.js';
import { createPessoa, deletePessoa, listPessoas, updatePessoa } from '../data/pessoas.js';
import { supabase } from '../lib/supabaseClient.js';

const emptyFornecedor = { nome: '', especialidade: '', contato: '', observacoes: '' };
const emptyPessoa = { nome: '', especialidade: '', contato: '', observacoes: '' };

function RegistryForm({ title, placeholder, fields, form, setForm, onSubmit, editingId, onCancel, saving }) {
  return (
    <form className="panel" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
      <div className="label" style={{ marginBottom: 10 }}>
        {title}
      </div>
      <div className="form-row">
        <div className="field">
          <label>Nome *</label>
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        </div>
        <div className="field">
          <label>{fields.especialidadeLabel}</label>
          <input
            value={form.especialidade}
            placeholder={placeholder}
            onChange={(e) => setForm({ ...form, especialidade: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Contato</label>
          <input value={form.contato} onChange={(e) => setForm({ ...form, contato: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>Observações</label>
        <input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
      </div>
      <div className="btn-row">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Adicionar'}
        </button>
        {editingId && (
          <button type="button" onClick={onCancel}>
            Cancelar edição
          </button>
        )}
      </div>
    </form>
  );
}

export default function Cadastros() {
  const navigate = useNavigate();
  const [fornecedores, setFornecedores] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [fornForm, setFornForm] = useState(emptyFornecedor);
  const [fornEditingId, setFornEditingId] = useState(null);
  const [fornSaving, setFornSaving] = useState(false);

  const [pessoaForm, setPessoaForm] = useState(emptyPessoa);
  const [pessoaEditingId, setPessoaEditingId] = useState(null);
  const [pessoaSaving, setPessoaSaving] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [f, p] = await Promise.all([listFornecedores(), listPessoas()]);
      setFornecedores(f);
      setPessoas(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFornSubmit(e) {
    e.preventDefault();
    setFornSaving(true);
    setError('');
    try {
      const payload = {
        nome: fornForm.nome.trim(),
        especialidade: fornForm.especialidade.trim() || null,
        contato: fornForm.contato.trim() || null,
        observacoes: fornForm.observacoes.trim() || null
      };
      if (fornEditingId) await updateFornecedor(fornEditingId, payload);
      else await createFornecedor(payload);
      setFornForm(emptyFornecedor);
      setFornEditingId(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setFornSaving(false);
    }
  }

  async function handlePessoaSubmit(e) {
    e.preventDefault();
    setPessoaSaving(true);
    setError('');
    try {
      const payload = {
        nome: pessoaForm.nome.trim(),
        especialidade: pessoaForm.especialidade.trim() || null,
        contato: pessoaForm.contato.trim() || null,
        observacoes: pessoaForm.observacoes.trim() || null
      };
      if (pessoaEditingId) await updatePessoa(pessoaEditingId, payload);
      else await createPessoa(payload);
      setPessoaForm(emptyPessoa);
      setPessoaEditingId(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPessoaSaving(false);
    }
  }

  async function handleDeleteForn(f) {
    setError('');
    try {
      const { count, error: countErr } = await supabase
        .from('encomendas')
        .select('id', { count: 'exact', head: true })
        .eq('fornecedor_id', f.id);
      if (countErr) throw countErr;
      if (count > 0) {
        alert(
          `"${f.nome}" não pode ser excluído: está vinculado a ${count} encomenda${count > 1 ? 's' : ''} de Compras & Usinagem Externa. Desvincule ou exclua essas encomendas primeiro.`
        );
        return;
      }
      if (!confirm(`Excluir o fornecedor "${f.nome}"?`)) return;
      await deleteFornecedor(f.id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeletePessoa(p) {
    setError('');
    try {
      const { count, error: countErr } = await supabase
        .from('project_stage_team')
        .select('id', { count: 'exact', head: true })
        .eq('pessoa_id', p.id);
      if (countErr) throw countErr;
      const aviso =
        count > 0
          ? `"${p.nome}" está atribuído em ${count} etapa${count > 1 ? 's' : ''} de Construção de Máquinas — excluir remove essas atribuições também, sem como desfazer. `
          : '';
      if (!confirm(`${aviso}Excluir "${p.nome}" do cadastro?`)) return;
      await deletePessoa(p.id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="content" style={{ maxWidth: 900 }}>
      <div className="topbar" style={{ marginBottom: 20, borderRadius: 'var(--radius)' }}>
        <button className="ghost icon-btn" onClick={() => navigate('/')} title="Voltar">
          ←
        </button>
        <span style={{ fontWeight: 700 }}>Cadastros · Fornecedores &amp; Equipe</span>
      </div>

      <p className="muted" style={{ marginBottom: 16 }}>
        Esses cadastros são únicos e reaproveitados em todos os projetos de construção de máquinas.
      </p>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Carregando…</p>}

      <RegistryForm
        title="Novo fornecedor"
        placeholder="Ex: Usinagem CNC, Componentes elétricos…"
        fields={{ especialidadeLabel: 'Especialidade' }}
        form={fornForm}
        setForm={setFornForm}
        onSubmit={handleFornSubmit}
        editingId={fornEditingId}
        onCancel={() => {
          setFornEditingId(null);
          setFornForm(emptyFornecedor);
        }}
        saving={fornSaving}
      />

      <div className="panel" style={{ marginBottom: 32 }}>
        {fornecedores.length === 0 && <p className="muted">Nenhum fornecedor cadastrado ainda.</p>}
        {fornecedores.map((f) => (
          <div key={f.id} className="list-row">
            <div>
              <div style={{ fontWeight: 600 }}>{f.nome}</div>
              <div className="muted">
                {f.especialidade || '—'} {f.contato ? `· ${f.contato}` : ''}
              </div>
            </div>
            <div className="btn-row">
              <button
                className="ghost"
                onClick={() => {
                  setFornEditingId(f.id);
                  setFornForm({
                    nome: f.nome,
                    especialidade: f.especialidade || '',
                    contato: f.contato || '',
                    observacoes: f.observacoes || ''
                  });
                }}
              >
                Editar
              </button>
              <button className="ghost danger" onClick={() => handleDeleteForn(f)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      <RegistryForm
        title="Nova pessoa da equipe"
        placeholder="Ex: Programador CLP, Projetista mecânico…"
        fields={{ especialidadeLabel: 'Especialidade / função' }}
        form={pessoaForm}
        setForm={setPessoaForm}
        onSubmit={handlePessoaSubmit}
        editingId={pessoaEditingId}
        onCancel={() => {
          setPessoaEditingId(null);
          setPessoaForm(emptyPessoa);
        }}
        saving={pessoaSaving}
      />

      <div className="panel">
        {pessoas.length === 0 && <p className="muted">Nenhuma pessoa cadastrada ainda.</p>}
        {pessoas.map((p) => (
          <div key={p.id} className="list-row">
            <div>
              <div style={{ fontWeight: 600 }}>{p.nome}</div>
              <div className="muted">
                {p.especialidade || '—'} {p.contato ? `· ${p.contato}` : ''}
              </div>
            </div>
            <div className="btn-row">
              <button
                className="ghost"
                onClick={() => {
                  setPessoaEditingId(p.id);
                  setPessoaForm({
                    nome: p.nome,
                    especialidade: p.especialidade || '',
                    contato: p.contato || '',
                    observacoes: p.observacoes || ''
                  });
                }}
              >
                Editar
              </button>
              <button className="ghost danger" onClick={() => handleDeletePessoa(p)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
