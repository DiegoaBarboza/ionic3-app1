import { useMemo, useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import { createEntry, deleteEntry, updateEntry } from '../data/entries.js';
import { CATEGORIES, categoryInfo, formatDate, formatMoney } from '../lib/calc.js';
import ReceiptCapture from '../components/ReceiptCapture.jsx';

const emptyForm = {
  type: 'gasto',
  category: 'diversos',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  description: '',
  city: '',
  state: ''
};

export default function Entries() {
  const { project, entries, reloadProject } = useProject();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState('todos');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    if (filter === 'todos') return entries;
    return entries.filter((e) => (filter === 'receitas' ? e.type === 'receita' : e.type === 'gasto'));
  }, [entries, filter]);

  function handleExtracted(data) {
    setForm((f) => ({
      ...f,
      category: data.category || f.category,
      amount: data.amount || f.amount,
      date: data.date || f.date,
      city: data.city || f.city,
      state: data.state || f.state,
      description: data.description || f.description
    }));
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setForm({
      type: entry.type,
      category: entry.category || 'diversos',
      amount: entry.amount,
      date: entry.date,
      description: entry.description || '',
      city: entry.city || '',
      state: entry.state || ''
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        type: form.type,
        category: form.type === 'gasto' ? form.category : null,
        amount: Number(form.amount),
        date: form.date,
        description: form.description || null,
        city: form.city || null,
        state: form.state || null
      };
      if (editingId) {
        await updateEntry(editingId, payload);
      } else {
        await createEntry(project.id, payload);
      }
      cancelEdit();
      await reloadProject();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este lançamento?')) return;
    await deleteEntry(id);
    await reloadProject();
  }

  return (
    <div>
      <form className="panel" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={form.type === 'gasto' ? 'primary' : ''}
            onClick={() => setForm({ ...form, type: 'gasto' })}
          >
            Gasto
          </button>
          <button
            type="button"
            className={form.type === 'receita' ? 'primary' : ''}
            onClick={() => setForm({ ...form, type: 'receita' })}
          >
            Receita
          </button>
        </div>

        {form.type === 'gasto' && <ReceiptCapture onExtracted={handleExtracted} />}

        <div className="form-row">
          {form.type === 'gasto' && (
            <div className="field">
              <label>Categoria</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.icon} {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Data</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div className="field">
            <label>Cidade</label>
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="field">
            <label>Estado</label>
            <input
              value={form.state}
              maxLength={2}
              style={{ textTransform: 'uppercase' }}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
            />
          </div>
        </div>

        <div className="field">
          <label>Descrição</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="btn-row">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Adicionar lançamento'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit}>
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      <div className="btn-row" style={{ marginBottom: 12 }}>
        {['todos', 'receitas', 'gastos'].map((f) => (
          <button key={f} className={filter === f ? 'primary' : ''} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="panel">
        {filtered.length === 0 && <p className="muted">Nenhum lançamento aqui.</p>}
        {filtered.map((entry) => {
          const cat = entry.type === 'gasto' ? categoryInfo(entry.category) : null;
          return (
            <div className="list-row" key={entry.id}>
              <div style={{ minWidth: 0 }}>
                <div>
                  {cat && (
                    <span className="badge" style={{ marginRight: 8 }}>
                      {cat.icon} {cat.label}
                    </span>
                  )}
                  <span className="muted">{formatDate(entry.date)}</span>
                  {(entry.city || entry.state) && (
                    <span className="muted"> · {[entry.city, entry.state].filter(Boolean).join('/')}</span>
                  )}
                </div>
                {entry.description && <div style={{ fontSize: 13 }}>{entry.description}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span className={'money ' + (entry.type === 'receita' ? 'positive' : 'negative')}>
                  {entry.type === 'receita' ? '+' : '-'} {formatMoney(entry.amount)}
                </span>
                <button className="ghost" onClick={() => startEdit(entry)}>
                  Editar
                </button>
                <button className="ghost danger" onClick={() => handleDelete(entry.id)}>
                  Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
