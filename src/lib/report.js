import { formatDate } from './calc.js';
import { LOGO_SVG_MARKUP } from './logo.js';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Monta o HTML do relatório de horas (nome do projeto, cliente, local,
 * contato, período, tabela de jornadas e campos de assinatura), usado
 * tanto para impressão direta do navegador quanto para download como
 * arquivo .html autônomo (que pode ser aberto/salvo como PDF em qualquer
 * dispositivo).
 */
export function buildHoursReportHtml({ project, hours, periodStart, periodEnd }) {
  const rows = hours
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (h) => `
      <tr>
        <td>${formatDate(h.date)}</td>
        <td>${escapeHtml(h.start_time)}</td>
        <td>${escapeHtml(h.end_time)}</td>
        <td>${h.lunch ? 'Sim' : 'Não'}</td>
        <td>${h.hours}h</td>
        <td>${escapeHtml(h.description)}</td>
      </tr>`
    )
    .join('');

  const totalHoras = hours.reduce((acc, h) => acc + (Number(h.hours) || 0), 0);
  const periodo =
    periodStart && periodEnd ? `${formatDate(periodStart)} a ${formatDate(periodEnd)}` : 'Todo o período';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório de Horas — ${escapeHtml(project.name)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
  .report-header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  h1 { font-size: 20px; margin: 0; }
  .muted { color: #555; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f0f0f0; }
  .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 24px; margin-top: 12px; font-size: 13px; }
  .total { margin-top: 12px; font-weight: bold; }
  .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; margin-top: 60px; }
  .signature-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; font-size: 12px; text-align: center; }
</style>
</head>
<body>
  <div class="report-header">
    ${LOGO_SVG_MARKUP}
    <h1>Relatório de Horas — ${escapeHtml(project.name)}</h1>
  </div>
  <div class="muted">Período: ${periodo}</div>
  <div class="info-grid">
    <div><strong>Cliente:</strong> ${escapeHtml(project.client_name) || '—'}</div>
    <div><strong>Local:</strong> ${escapeHtml(project.location) || '—'}</div>
    <div><strong>Contato do cliente:</strong> ${escapeHtml(project.client_contact) || '—'}</div>
    <div><strong>Valor da hora:</strong> R$ ${Number(project.hourly_rate || 0).toFixed(2)}</div>
  </div>

  <table>
    <thead>
      <tr><th>Data</th><th>Início</th><th>Fim</th><th>Almoço</th><th>Horas</th><th>Descrição</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">Sem jornadas neste período.</td></tr>'}</tbody>
  </table>
  <div class="total">Total de horas: ${totalHoras}h</div>

  <div class="signatures">
    <div class="signature-line">Responsável técnico</div>
    <div class="signature-line">Cliente</div>
  </div>
</body>
</html>`;
}
