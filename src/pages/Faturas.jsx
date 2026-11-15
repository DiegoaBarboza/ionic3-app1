import { useEffect, useMemo, useState } from 'react';
import { useProject } from '../context/ProjectContext.jsx';
import {
  FATURA_STATUS_INFO,
  createFatura,
  deleteFatura,
  desmarcarFaturaPaga,
  faturaStatus,
  listFaturas,
  marcarFaturaPaga,
  updateFatura
} from '../data/faturas.js';
import { formatDate, formatMoney, todayLocal } from '../lib/calc.js';
import MoneyInput from '../components/MoneyInput.jsx';
import StatCard from '../components/StatCard.jsx';

const emptyForm = () => ({
  descricao: '',
  numero_nf: '',
  valor: '',
  data_emissao: todayLocal(),
  vencimento: '',
  observacoes: ''
});

function StatusChip({ status }) {
  const info = FATURA_STATUS_INFO[status];
  return (
    <span
      className="badge"
      style={{ background: `${info.color}1f`, borderColor: `${info.color}55`, color: info.color, fontWeight: 600 }}
    >
      {info.label}
    </span>
  );
}

/**
 * Contas a receber do projeto: faturas/medições com NF e vencimento.
 * Marcar como paga gera o lançamento de receita "Pagamento" automaticamente.
 */
export default function Faturas() {
  const { project, reloadProject } = useProject();
  const [faturas, setFaturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [payingId, setPayingId] = useState(null);
  const [payDate, setPayDate] = useState(todayLocal());
  const [error, setError] = useState('');

  async function reload() {
    setFaturas(await listFaturas(project.id));
  }

  useEffect(() => {
    let active = true;
    listFaturas(project.id)
      .then((f) => active && setFaturas(f))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [project.id]);

  const resumo = useMemo(() => {
    const r = { aberto: 0, atrasado: 0, pago: 0, qtdAtrasadas: 0 };
    for (const f of faturas) {
      const st = faturaStatus(f);
      const v = Number(f.valor) || 0;
      if (st === 'paga') r.pago += v;
      else {
        r.aberto += v;
        if (st === 'atrasada') {
          r.atrasado += v;
          r.qtdAtrasadas++;
        }
      }
    }
    return r;
  }, [faturas]);

  function startEdit(f) {
    setEditingId(f.id);
    setForm({
      descricao: f.descricao,
      numero_nf: f.numero_nf || '',
      valor: f.valor,
      data_emissao: f.data_emissao || '',
      vencimento: f.vencimento,
      observacoes: f.observacoes || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.descricao.trim()) return setError('Informe a descrição da fatura.');
    if (!(Number(form.valor) > 0)) return setError('Informe um valor maior que zero.');
    if (!form.vencimento) return setError('Informe o vencimento.');
    setSaving(true);
    setError('');
    try {
      const payload = {
        descricao: form.descricao.trim(),
        numero_nf: form.numero_nf.trim() || null,
        valor: Number(form.valor),
        data_emissao: form.data_emissao || null,
        vencimento: form.vencimento,
        observacoes: form.observacoes.trim() || null
      };
      if (editingId) {
        const atual = faturas.find((f) => f.id === editingId);
        await updateFatura(atual, payload);
        if (atual.entry_id) await reloadProject();
      } else {
        await createFatura(project.id, payload);
      }
      resetForm();
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmarPagamento(f) {
    setBusyId(f.id);
    setError('');
    try {
      await marcarFaturaPaga(f, payDate || todayLocal());
      setPayingId(null);
      await Promise.all([reload(), reloadProject()]);
    } catch (err) {
      setError('Não foi possível marcar como paga: ' + err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDesmarcar(f) {
    if (
      !confirm(
        'Voltar esta fatura para "em aberto"?\n\nO lançamento de Pagamento criado para ela também será excluído, e o valor volta para o "a receber".'
      )
    )
      return;
    setBusyId(f.id);
    setError('');
    try {
      await desmarcarFaturaPaga(f);
      await Promise.all([reload(), reloadProject()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(f) {
    let apagarPagamento = false;
    if (f.entry_id) {
      if (!confirm('Excluir esta fatura?')) return;
      apagarPagamento = confirm(
        'Essa fatura já está paga e gerou um lançamento de Pagamento.\n\nOK = excluir o pagamento também\nCancelar = manter o pagamento em Lançamentos'
      );
    } else if (!confirm('Excluir esta fatura?')) return;
    setBusyId(f.id);
    setError('');
    try {
      await deleteFatura(f, { apagarPagamento });
      if (editingId === f.id) resetForm();
      await reload();
      if (apagarPagamento) await reloadProject();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <StatCard label="Em aberto" value={formatMoney(resumo.aberto)} />
        <StatCard
          label={resumo.qtdAtrasadas ? `Atrasado (${resumo.qtdAtrasadas})` : 'Atrasado'}
          value={formatMoney(resumo.atrasado)}
          tone={resumo.atrasado > 0 ? 'negative' : undefined}
        />
        <StatCard label="Recebido em faturas" value={formatMoney(resumo.pago)} tone="positive" />
      </div>

      <form className="panel" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 12 }}>
          {editingId ? 'Editar fatura' : 'Nova fatura / medição'}
        </div>
        <div className="form-row">
          <div className="field" style={{ flex: 2 }}>
            <label>Descrição</label>
            <input
              value={form.descricao}
              placeholder="Ex.: 1ª medição — 50% do projeto"
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Nº da NF</label>
            <input value={form.numero_nf} onChange={(e) => setForm({ ...form, numero_nf: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Valor (R$)</label>
            <MoneyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} required />
          </div>
          <div className="field">
            <label>Emissão</label>
            <input type="date" value={form.data_emissao} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} />
          </div>
          <div className="field">
            <label>Vencimento</label>
            <input
              type="date"
              value={form.vencimento}
              onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="field">
          <label>Observações</label>
          <input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="btn-row">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Adicionar fatura'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm}>
              Cancelar edição
            </button>
          )}
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Ao marcar uma fatura como paga, o sistema cria sozinho o lançamento de receita "Pagamento", que abate o valor a
          receber do projeto. Faturas atrasadas entram no resumo diário por push.
        </p>
      </form>

      <div className="panel">
        {loading && <p className="muted">Carregando faturas…</p>}
        {!loading && faturas.length === 0 && <p className="muted">Nenhuma fatura cadastrada neste projeto.</p>}
        {faturas.map((f) => {
          const st = faturaStatus(f);
          return (
            <div key={f.id} className="list-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <StatusChip status={st} />
                  <strong>{f.descricao}</strong>
                  {f.numero_nf && <span className="muted">NF {f.numero_nf}</span>}
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  Vence {formatDate(f.vencimento)}
                  {f.data_pagamento && ` · paga em ${formatDate(f.data_pagamento)}`}
                  {f.data_pagamento && !f.entry_id && ' · lançamento de pagamento foi excluído'}
                  {f.observacoes && ` · ${f.observacoes}`}
                </div>
                {payingId === f.id && (
                  <div className="btn-row" style={{ marginTop: 8, alignItems: 'center' }}>
                    <label className="muted" style={{ fontSize: 13 }}>
                      Pago em
                    </label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      style={{ width: 'auto' }}
                    />
                    <button className="primary" disabled={busyId === f.id} onClick={() => confirmarPagamento(f)}>
                      {busyId === f.id ? 'Salvando…' : 'Confirmar pagamento'}
                    </button>
                    <button onClick={() => setPayingId(null)}>Cancelar</button>
                  </div>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 4,
                  flexWrap: 'wrap',
                  minWidth: 0,
                  flex: '0 1 auto'
                }}
              >
                <span className={'money' + (st === 'paga' ? ' positive' : '')}>{formatMoney(f.valor)}</span>
                {st !== 'paga' ? (
                  <button
                    className="ghost"
                    disabled={busyId === f.id}
                    onClick={() => {
                      setPayDate(todayLocal());
                      setPayingId(f.id);
                    }}
                  >
                    ✓ Marcar paga
                  </button>
                ) : (
                  <button className="ghost" disabled={busyId === f.id} onClick={() => handleDesmarcar(f)}>
                    Desfazer pagamento
                  </button>
                )}
                <button className="ghost" onClick={() => startEdit(f)}>
                  Editar
                </button>
                <button className="ghost danger" disabled={busyId === f.id} onClick={() => handleDelete(f)}>
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
