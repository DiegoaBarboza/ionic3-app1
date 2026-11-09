import { supabase } from '../lib/supabaseClient.js';
import { ensureStagesSeeded, updateStage } from './stages.js';
import { assignPessoaToStage } from './pessoas.js';
import { createEncomenda } from './encomendas.js';
import { createPeca } from './pecas.js';

export async function listProjects() {
  const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getProject(id) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createProject(fields) {
  const { data, error } = await supabase.from('projects').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, fields) {
  const { data, error } = await supabase.from('projects').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

function projectFieldsFromBackup(backup) {
  const info = backup.info || {};
  return {
    name: info.name,
    tipo_projeto: info.tipo_projeto || 'servico',
    hourly_rate: info.hourlyRate || 0,
    total_hours_sold: info.totalHoursSold || 0,
    tipo_controle_horas: info.tipo_controle_horas || 'estimativa',
    valor_fixo_projeto: info.valor_fixo_projeto ?? null,
    client_name: info.clientName || '',
    location: info.location || '',
    client_contact: info.clientContact || '',
    data_pedido: info.data_pedido || null,
    escopo_solicitado: info.escopo_solicitado || null,
    data_inicio_agendada: info.data_inicio_agendada || null,
    data_termino_prevista: info.data_termino_prevista || null,
    data_finalizacao: info.data_finalizacao || null,
    relatorio_pendencias: info.relatorio_pendencias || null,
    relatorio_sugestoes: info.relatorio_sugestoes || null,
    relatorio_dificuldades: info.relatorio_dificuldades || null,
    teve_atraso: info.teve_atraso ?? false,
    motivo_atraso: info.motivo_atraso || null
  };
}

/**
 * Recria dentro de um projeto (já criado/zerado) tudo que veio no backup:
 * lançamentos, horas e, se for Construção de Máquinas, etapas, equipe,
 * encomendas e lista de peças. Usado tanto por restoreProjectFromBackup
 * (projeto novo) quanto por overwriteProjectFromBackup (projeto existente,
 * já esvaziado antes de chamar isto).
 */
async function insertBackupData(projectId, tipoProjeto, backup) {
  const entries = backup.entries || [];
  const hours = backup.hours || [];
  const stagesBackup = backup.stages || [];
  const stageTeamBackup = backup.stageTeam || [];
  const encomendasBackup = backup.encomendas || [];
  const pecasBackup = backup.pecas || [];

  if (entries.length) {
    const rows = entries.map(({ type, category, amount, date, description, city, state, receiptUrl }) => ({
      project_id: projectId,
      type,
      category: category || null,
      amount,
      date,
      description: description || null,
      city: city || null,
      state: state || null,
      receipt_url: receiptUrl || null
    }));
    const { error } = await supabase.from('entries').insert(rows);
    if (error) throw error;
  }

  let stageKeyToId = {};
  if (tipoProjeto === 'maquina') {
    const seeded = await ensureStagesSeeded(projectId);
    stageKeyToId = Object.fromEntries(seeded.map((s) => [s.stage_key, s.id]));

    for (const s of stagesBackup) {
      const id = stageKeyToId[s.stageKey];
      if (!id) continue;
      await updateStage(id, {
        planned_start: s.plannedStart || null,
        planned_end: s.plannedEnd || null,
        actual_start: s.actualStart || null,
        actual_end: s.actualEnd || null,
        status: s.status || 'nao_iniciada',
        notes: s.notes || null,
        horas_orcadas: s.horasOrcadas || 0,
        duracao_dias: s.duracaoDias ?? null
      });
    }

    for (const t of stageTeamBackup) {
      const stageId = stageKeyToId[t.stageKey];
      if (!stageId || !t.pessoaId) continue;
      try {
        await assignPessoaToStage(projectId, stageId, t.pessoaId, t.papel || null);
      } catch {
        // a pessoa do backup pode não existir mais no cadastro — ignora essa atribuição
      }
    }

    const encomendaIdByIndex = {};
    for (let i = 0; i < encomendasBackup.length; i++) {
      const e = encomendasBackup[i];
      const created = await createEncomenda(projectId, {
        descricao: e.descricao,
        fornecedor_id: e.fornecedorId || null,
        tipo: e.tipo || 'peca_comprada',
        data_pedido: e.dataPedido || null,
        prazo_combinado: e.prazoCombinado || null,
        data_entrega: e.dataEntrega || null,
        observacoes: e.observacoes || null
      });
      encomendaIdByIndex[i] = created.id;
    }

    for (const p of pecasBackup) {
      await createPeca(projectId, {
        item: p.item,
        quantidade: p.quantidade ?? 1,
        unidade: p.unidade || 'un',
        status: p.status || 'a_comprar',
        encomenda_id: p.encomendaIndex != null ? encomendaIdByIndex[p.encomendaIndex] || null : null,
        observacoes: p.observacoes || null
      });
    }
  }

  if (hours.length) {
    const rows = hours.map(
      ({ date, startTime, endTime, lunch, hours: h, description, kmIda, kmVolta, valorKm, pedagio, stageKey }) => ({
        project_id: projectId,
        date,
        start_time: startTime,
        end_time: endTime,
        lunch: lunch ?? true,
        hours: h,
        description: description || null,
        km_ida: kmIda || 0,
        km_volta: kmVolta || 0,
        valor_km: valorKm || 0,
        pedagio: pedagio || 0,
        stage_id: stageKey ? stageKeyToId[stageKey] || null : null
      })
    );
    const { error } = await supabase.from('hours').insert(rows);
    if (error) throw error;
  }
}

/**
 * Recria um projeto inteiro a partir de um arquivo de backup: dados
 * cadastrais, lançamentos, horas e, se for máquina, etapas/equipe/
 * encomendas/peças.
 */
export async function restoreProjectFromBackup(backup) {
  const fields = projectFieldsFromBackup(backup);
  const project = await createProject({
    ...fields,
    created_at: backup.info.createdAt || new Date().toISOString().slice(0, 10)
  });
  await insertBackupData(project.id, project.tipo_projeto, backup);
  return project;
}

/**
 * Restaura um backup .json SOBRE um projeto já existente: atualiza os
 * dados cadastrais e substitui tudo (lançamentos, horas e, se for máquina,
 * etapas/equipe/encomendas/peças) pelo conteúdo do arquivo.
 */
export async function overwriteProjectFromBackup(projectId, backup) {
  const fields = projectFieldsFromBackup(backup);
  const project = await updateProject(projectId, fields);

  const tables = ['pecas', 'encomendas', 'project_stage_team', 'project_stages', 'entries', 'hours'];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('project_id', projectId);
    if (error) throw error;
  }

  await insertBackupData(projectId, project.tipo_projeto, backup);
  return project;
}
