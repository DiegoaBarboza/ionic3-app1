import { useMemo, useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import { createEntry, deleteEntry, updateEntry } from '../data/entries.js';
import { CATEGORIES, REVENUE_CATEGORIES, categoryInfo, formatDate, formatMoney, revenueCategoryInfo, todayLocal } from '../lib/calc.js';
import ReceiptCapture from '../components/ReceiptCapture.jsx';
import MoneyInput from '../components/MoneyInput.jsx';
import { openReceipt, removeReceipts } from '../lib/receipts.js';
import { exportarLancamentos } from '../lib/exportExcel.js';
import { criarOuEnfileirar, descartar, estaOffline } from '../lib/offline.js';
import { avisar, confirmar } from '../lib/dialogo.js';

const emptyForm = () => ({
  type: 'gasto',
  category: 'diversos',
  amount: '',
  date: todayLocal(),
  description: '',
  city: '',
  state: '',
  receipt_url: ''
});

export default function Entries() {
  const { project, entries, reloadProject } = useProject();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState('todos');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [expInicio, setExpInicio] = useState('');
  const [expFim, setExpFim] = useState('');
  const [exportando, setExportando] = useState(false);
  const [expMsg, setExpMsg] = useState('');

  async function handleExport() {
    setExportando(true);
    setExpMsg('');
    try {
      const n = await exportarLancamentos(project, entries, { inicio: expInicio || null, fim: expFim || null });
      if (n === 0) setExpMsg('Nenhum lançamento no período escolhido — a planilha saiu vazia.');
    } catch (err) {
      setExpMsg('Não foi possível gerar a planilha: ' + err.message);
    } finally {
      setExportando(false);
    }
  }

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
      description: data.description || f.description,
      receipt_url: data.receiptPath || f.receipt_url
    }));
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setForm({
      type: entry.type,
      category: entry.category || (entry.type === 'receita' ? 'pagamento' : 'diversos'),
      amount: entry.amount,
      date: entry.date,
      description: entry.description || '',
      city: entry.city || '',
      state: entry.state || '',
      receipt_url: entry.receipt_url || ''
    });
  }

  function cancelEdit() {
    // foto enviada mas o lançamento não foi salvo: não deixa ela esquecida
    const salva = editingId ? entries.find((x) => x.id === editingId)?.receipt_url : null;
    if (form.receipt_url && form.receipt_url !== salva) removeReceipts([form.receipt_url]);
    resetForm();
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
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
        category: form.category || null,
        amount: Number(form.amount),
        date: form.date,
        description: form.description || null,
        city: form.type === 'gasto' ? form.city || null : null,
        state: form.type === 'gasto' ? form.state || null : null,
        receipt_url: form.type === 'gasto' ? form.receipt_url || null : null
      };
      if (editingId) {
        const anterior = entries.find((x) => x.id === editingId)?.receipt_url;
        await updateEntry(editingId, payload);
        // trocou a foto (ou virou receita): apaga a foto antiga
        if (anterior && anterior !== payload.receipt_url) removeReceipts([anterior]);
      } else {
        const criado = await criarOuEnfileirar('entries', project.id, payload, () => createEntry(project.id, payload));
        setAviso(
          criado._pendente
            ? '📴 Sem internet: o lançamento ficou guardado neste aparelho e será enviado sozinho quando o sinal voltar.'
            : ''
        );
      }
      resetForm();
      await reloadProject();
    } catch (err) {
      setError(
        estaOffline() && editingId ? 'Sem internet: editar um lançamento já enviado só funciona com sinal.' : err.message
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!(await confirmar({ titulo: 'Excluir este lançamento?', mensagem: 'A foto da nota, se tiver, também é apagada.', confirmar: 'Excluir', cancelar: 'Manter', perigo: true }))) return;
    const foto = entries.find((x) => x.id === id)?.receipt_url;
    try {
      await deleteEntry(id);
      if (foto) removeReceipts([foto]);
      await reloadProject();
    } catch (err) {
      setError(estaOffline() ? 'Sem internet: excluir um lançamento já enviado só funciona com sinal.' : err.message);
    }
  }

  return (
    <div>
      <form className="panel" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={form.type === 'gasto' ? 'primary' : ''}
            onClick={() => setForm({ ...form, type: 'gasto', category: 'diversos' })}
          >
            Gasto
          </button>
          <button
            type="button"
            className={form.type === 'receita' ? 'primary' : ''}
            onClick={() => setForm({ ...form, type: 'receita', category: 'pagamento' })}
          >
            Receita
          </button>
        </div>

        {form.type === 'gasto' && <ReceiptCapture onExtracted={handleExtracted} />}

        <div className="form-row">
          <div className="field">
            <label>{form.type === 'gasto' ? 'Categoria' : 'Tipo de receita'}</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {(form.type === 'gasto' ? CATEGORIES : REVENUE_CATEGORIES).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
            {form.type === 'receita' && (
              <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                Só "Pagamento" abate do valor a receber do projeto.
              </p>
            )}
          </div>
          <div className="field">
            <label>Valor (R$)</label>
            <MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} required />
          </div>
          <div className="field">
            <label>Data</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          {form.type === 'gasto' && (
            <>
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
            </>
          )}
        </div>

        <div className="field">
          <label>Descrição</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        {error && <p className="error-text">{error}</p>}
        {aviso && <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>{aviso}</p>}

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

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div className="field">
            <label>Exportar — data inicial</label>
            <input type="date" value={expInicio} onChange={(e) => setExpInicio(e.target.value)} />
          </div>
          <div className="field">
            <label>Exportar — data final</label>
            <input type="date" value={expFim} onChange={(e) => setExpFim(e.target.value)} />
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <label>&nbsp;</label>
            <button type="button" onClick={handleExport} disabled={exportando}>
              {exportando ? 'Gerando planilha…' : '📊 Exportar Excel'}
            </button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Planilha com receitas e gastos do período (em branco = tudo), com totais — pronta pro contador.
        </p>
        {expMsg && <p className="error-text">{expMsg}</p>}
      </div>

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
          const cat = entry.type === 'gasto' ? categoryInfo(entry.category) : revenueCategoryInfo(entry.category);
          return (
            <div
              className="list-row"
              key={entry.id}
              style={entry._pendente ? { background: 'rgba(10, 126, 164, 0.06)' } : undefined}
            >
              <div style={{ minWidth: 0 }}>
                <div>
                  {cat && (
                    <span className="badge" style={{ marginRight: 8 }}>
                      {cat.icon} {cat.label}
                    </span>
                  )}
                  <span className="muted">{formatDate(entry.date)}</span>
                  {entry._pendente && (
                    <span style={{ fontSize: 12, marginLeft: 8, fontWeight: 600, color: entry._erro ? 'var(--negative)' : 'var(--accent)' }}>
                      {entry._erro ? '⚠️ não enviado' : '⏳ aguardando envio'}
                    </span>
                  )}
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
                {entry.receipt_url && (
                  <button
                    className="ghost"
                    onClick={() =>
                      openReceipt(entry.receipt_url).catch((err) => avisar({ titulo: 'Não foi possível abrir a nota', mensagem: err.message }))
                    }
                    title="Ver foto da nota fiscal"
                  >
                    📎 Nota
                  </button>
                )}
                {entry._pendente ? (
                  <button
                    className="ghost danger"
                    title={entry._erro || 'Ainda não foi enviado'}
                    onClick={async () => {
                      const ok = await confirmar({
                        titulo: 'Descartar este lançamento?',
                        mensagem: 'Ele ainda não foi enviado e some deste aparelho.',
                        confirmar: 'Descartar',
                        cancelar: 'Manter',
                        perigo: true
                      });
                      if (ok) descartar(entry.id);
                    }}
                  >
                    Descartar
                  </button>
                ) : (
                  <>
                    <button className="ghost" onClick={() => startEdit(entry)}>
                      Editar
                    </button>
                    <button className="ghost danger" onClick={() => handleDelete(entry.id)}>
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
