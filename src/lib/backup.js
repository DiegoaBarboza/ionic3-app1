function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Baixa um backup .json do projeto — é a rede de segurança contra qualquer
 * falha de sincronização com o Supabase. `extra` (stages/stageTeam/
 * encomendas/pecas) só é usado em projetos de Construção de Máquinas; quem
 * chama já busca esses dados antes, porque não vêm do ProjectContext.
 */
export function downloadProjectBackup(project, entries, hours, extra = {}) {
  const { stages = [], stageTeam = [], encomendas = [], pecas = [] } = extra;

  const stageKeyById = Object.fromEntries(stages.map((s) => [s.id, s.stage_key]));
  const encomendaIndexById = Object.fromEntries(encomendas.map((e, i) => [e.id, i]));

  const payload = {
    version: 2,
    info: {
      name: project.name,
      hourlyRate: project.hourly_rate,
      totalHoursSold: project.total_hours_sold,
      clientName: project.client_name,
      location: project.location,
      clientContact: project.client_contact,
      createdAt: project.created_at,
      tipo_projeto: project.tipo_projeto,
      tipo_controle_horas: project.tipo_controle_horas,
      valor_fixo_projeto: project.valor_fixo_projeto,
      data_pedido: project.data_pedido,
      escopo_solicitado: project.escopo_solicitado,
      data_inicio_agendada: project.data_inicio_agendada,
      data_termino_prevista: project.data_termino_prevista,
      data_finalizacao: project.data_finalizacao,
      relatorio_pendencias: project.relatorio_pendencias,
      relatorio_sugestoes: project.relatorio_sugestoes,
      relatorio_dificuldades: project.relatorio_dificuldades,
      teve_atraso: project.teve_atraso,
      motivo_atraso: project.motivo_atraso
    },
    entries: entries.map(({ type, category, amount, date, description, city, state, receipt_url }) => ({
      type,
      category,
      amount,
      date,
      description,
      city,
      state,
      receiptUrl: receipt_url
    })),
    hours: hours.map(({ date, start_time, end_time, lunch, hours: h, description, km_ida, km_volta, valor_km, pedagio, stage_id }) => ({
      date,
      startTime: start_time,
      endTime: end_time,
      lunch,
      hours: h,
      description,
      kmIda: km_ida,
      kmVolta: km_volta,
      valorKm: valor_km,
      pedagio,
      stageKey: stage_id ? stageKeyById[stage_id] || null : null
    })),
    stages: stages.map((s) => ({
      stageKey: s.stage_key,
      plannedStart: s.planned_start,
      plannedEnd: s.planned_end,
      actualStart: s.actual_start,
      actualEnd: s.actual_end,
      status: s.status,
      notes: s.notes,
      horasOrcadas: s.horas_orcadas,
      duracaoDias: s.duracao_dias
    })),
    stageTeam: stageTeam.map((t) => ({
      stageKey: stageKeyById[t.stage_id] || null,
      pessoaId: t.pessoa_id,
      pessoaNome: t.pessoas?.nome || null,
      papel: t.papel
    })),
    encomendas: encomendas.map((e) => ({
      descricao: e.descricao,
      fornecedorId: e.fornecedor_id,
      fornecedorNome: e.fornecedores?.nome || null,
      tipo: e.tipo,
      dataPedido: e.data_pedido,
      prazoCombinado: e.prazo_combinado,
      dataEntrega: e.data_entrega,
      observacoes: e.observacoes
    })),
    pecas: pecas.map((p) => ({
      item: p.item,
      quantidade: p.quantidade,
      unidade: p.unidade,
      status: p.status,
      observacoes: p.observacoes,
      encomendaIndex:
        p.encomenda_id != null && encomendaIndexById[p.encomenda_id] !== undefined
          ? encomendaIndexById[p.encomenda_id]
          : null
    }))
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.href = url;
  a.download = `backup-${slugify(project.name)}-${today}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.info || !data.info.name) {
          throw new Error('Arquivo de backup inválido: falta "info.name".');
        }
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
