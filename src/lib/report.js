import { calcReembolso, formatDate, formatMoney } from './calc.js';
import { LOGO_DATA_URI } from './logo.js';

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
  const temDeslocamento = hours.some((h) => calcReembolso(h) > 0);

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
        ${temDeslocamento ? `<td>${formatMoney(calcReembolso(h))}</td>` : ''}
      </tr>`
    )
    .join('');

  const totalHoras = hours.reduce((acc, h) => acc + (Number(h.hours) || 0), 0);
  const totalKm = hours.reduce((acc, h) => acc + (Number(h.km_ida) || 0) + (Number(h.km_volta) || 0), 0);
  const totalPedagio = hours.reduce((acc, h) => acc + (Number(h.pedagio) || 0), 0);
  const totalReembolso = hours.reduce((acc, h) => acc + calcReembolso(h), 0);
  const periodo =
    periodStart && periodEnd ? `${formatDate(periodStart)} a ${formatDate(periodEnd)}` : 'Todo o período';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório de Horas — ${escapeHtml(project.name)}</title>
<style>${REPORT_BASE_STYLE}</style>
</head>
<body>
  <div class="report-topbar"></div>
  <div class="report-page">
    <div class="report-header">
      <img src="${LOGO_DATA_URI}" alt="Zênite Robótica" />
      <div>
        <div class="eyebrow">Relatório de Horas</div>
        <h1>${escapeHtml(project.name)}</h1>
      </div>
    </div>
    <div class="muted" style="margin-bottom: 14px;">Período: ${periodo}</div>

    <div class="info-card">
      <div><span class="info-label">Cliente</span>${escapeHtml(project.client_name) || '—'}</div>
      <div><span class="info-label">Local</span>${escapeHtml(project.location) || '—'}</div>
      <div><span class="info-label">Contato do cliente</span>${escapeHtml(project.client_contact) || '—'}</div>
      <div><span class="info-label">Valor da hora</span>R$ ${Number(project.hourly_rate || 0).toFixed(2)}</div>
    </div>

    <table>
      <thead>
        <tr><th>Data</th><th>Início</th><th>Fim</th><th>Almoço</th><th>Horas</th><th>Descrição</th>${temDeslocamento ? '<th>Reembolso</th>' : ''}</tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="${temDeslocamento ? 7 : 6}">Sem jornadas neste período.</td></tr>`}</tbody>
    </table>

    <div class="stat-pill">Total de horas: <strong>${totalHoras}h</strong></div>
    ${
      temDeslocamento
        ? `<div class="stat-pill">Total KM rodado: <strong>${totalKm}km</strong></div>
    <div class="stat-pill">Total pedágios: <strong>${formatMoney(totalPedagio)}</strong></div>
    <div class="stat-pill">Total a reembolsar (deslocamento): <strong>${formatMoney(totalReembolso)}</strong></div>`
        : ''
    }

    <div class="signatures">
      <div class="signature-line">Responsável técnico</div>
      <div class="signature-line">Cliente</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Monta o HTML do relatório de atividades final de um serviço: resumo das
 * jornadas realizadas, pendências, sugestões, dificuldades encontradas e,
 * se houve atraso, o motivo. Usa os mesmos campos preenchidos no projeto
 * (manualmente ou pelo agente de IA, quando configurado).
 */
export function buildActivityReportHtml({ project, hours }) {
  const rows = hours
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (h) => `
      <tr>
        <td>${formatDate(h.date)}</td>
        <td>${h.hours}h</td>
        <td>${escapeHtml(h.description)}</td>
      </tr>`
    )
    .join('');

  const totalHoras = hours.reduce((acc, h) => acc + (Number(h.hours) || 0), 0);
  const periodo =
    project.data_inicio_agendada && project.data_termino_prevista
      ? `${formatDate(project.data_inicio_agendada)} a ${formatDate(project.data_termino_prevista)}`
      : 'Não informado';

  const section = (title, content) => `
    <div class="report-section">
      <div class="section-title">${title}</div>
      <div class="section-body">${content ? escapeHtml(content).replace(/\n/g, '<br>') : '<span class="muted">Nada registrado.</span>'}</div>
    </div>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório de Atividades — ${escapeHtml(project.name)}</title>
<style>${REPORT_BASE_STYLE}</style>
</head>
<body>
  <div class="report-topbar"></div>
  <div class="report-page">
    <div class="report-header">
      <img src="${LOGO_DATA_URI}" alt="Zênite Robótica" />
      <div>
        <div class="eyebrow">Relatório de Atividades — Finalização de Serviço</div>
        <h1>${escapeHtml(project.name)}</h1>
      </div>
    </div>

    <div class="info-card">
      <div><span class="info-label">Cliente</span>${escapeHtml(project.client_name) || '—'}</div>
      <div><span class="info-label">Local</span>${escapeHtml(project.location) || '—'}</div>
      <div><span class="info-label">Período agendado</span>${periodo}</div>
      <div><span class="info-label">Data de finalização</span>${project.data_finalizacao ? formatDate(project.data_finalizacao) : '—'}</div>
    </div>

    ${project.escopo_solicitado ? section('Escopo solicitado', project.escopo_solicitado) : ''}

    <div class="section-title" style="margin-top: 18px;">Atividades realizadas</div>
    <table>
      <thead><tr><th>Data</th><th>Horas</th><th>Descrição</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3">Sem jornadas registradas.</td></tr>'}</tbody>
    </table>
    <div class="stat-pill">Total de horas: <strong>${totalHoras}h</strong></div>

    ${section('Pendências', project.relatorio_pendencias)}
    ${section('Sugestões', project.relatorio_sugestoes)}
    ${section('Dificuldades encontradas', project.relatorio_dificuldades)}
    ${section('Atraso', project.teve_atraso ? `Sim. Motivo: ${project.motivo_atraso || 'não informado'}` : 'Não houve atraso.')}

    <div class="signatures">
      <div class="signature-line">Responsável técnico</div>
      <div class="signature-line">Cliente</div>
    </div>
  </div>
</body>
</html>`;
}

const REPORT_BASE_STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Arial, Helvetica, sans-serif; color: #1a1f27; margin: 0; background: #f4f6f8; }
  .report-topbar { height: 8px; background: linear-gradient(90deg, #2fb8dc, #2fd4a9); }
  .report-page { max-width: 860px; margin: 0 auto; padding: 32px 28px 48px; }
  .report-header { display: flex; align-items: center; gap: 14px; margin-bottom: 4px; }
  .report-header img { height: 44px; width: auto; border-radius: 10px; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #1f8aa6; }
  h1 { font-size: 22px; margin: 2px 0 0; color: #10141a; }
  .muted { color: #6b7280; font-size: 13px; }
  .info-card {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px 28px;
    background: #ffffff; border: 1px solid #e3e7ec; border-radius: 14px;
    padding: 16px 18px; margin: 14px 0 20px;
    box-shadow: 0 1px 2px rgba(16, 20, 26, 0.04), 0 10px 24px -14px rgba(16, 20, 26, 0.18);
    font-size: 13px;
  }
  .info-label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #8b96a5; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; background: #fff; border-radius: 12px; overflow: hidden; }
  th, td { padding: 9px 10px; text-align: left; border-bottom: 1px solid #edf0f3; }
  th { background: #10141a; color: #e8ecf1; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
  tbody tr:nth-child(even) { background: #f7f9fb; }
  .stat-pill {
    display: inline-block; margin-top: 14px; padding: 8px 16px; border-radius: 999px;
    background: #e8f8fb; color: #1f8aa6; font-size: 13px; border: 1px solid #c7eef5;
  }
  .report-section { margin-top: 16px; }
  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #1f8aa6; margin-bottom: 6px; }
  .section-body {
    background: #fff; border: 1px solid #e3e7ec; border-left: 3px solid #2fb8dc;
    border-radius: 10px; padding: 12px 14px; font-size: 13px; line-height: 1.5;
  }
  .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; margin-top: 56px; }
  .signature-line { border-top: 1px solid #c7ccd4; margin-top: 40px; padding-top: 6px; font-size: 12px; text-align: center; color: #6b7280; }
  @media print {
    body { background: #fff; }
    .info-card, .section-body, table { box-shadow: none; }
  }
`;
