import { supabase } from '../lib/supabaseClient.js';

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

/**
 * Recria um projeto inteiro (info + entries + hours) a partir de um
 * arquivo de backup, na mesma estrutura usada pelo botão de exportar.
 */
export async function restoreProjectFromBackup(backup) {
  const project = await createProject({
    name: backup.info.name,
    hourly_rate: backup.info.hourlyRate || 0,
    total_hours_sold: backup.info.totalHoursSold || 0,
    client_name: backup.info.clientName || '',
    location: backup.info.location || '',
    client_contact: backup.info.clientContact || '',
    created_at: backup.info.createdAt || new Date().toISOString().slice(0, 10)
  });

  if (backup.entries?.length) {
    const rows = backup.entries.map(({ type, category, amount, date, description }) => ({
      project_id: project.id,
      type,
      category: category || null,
      amount,
      date,
      description: description || null
    }));
    const { error } = await supabase.from('entries').insert(rows);
    if (error) throw error;
  }

  if (backup.hours?.length) {
    const rows = backup.hours.map(({ date, startTime, endTime, lunch, hours, description }) => ({
      project_id: project.id,
      date,
      start_time: startTime,
      end_time: endTime,
      lunch: lunch ?? true,
      hours,
      description: description || null
    }));
    const { error } = await supabase.from('hours').insert(rows);
    if (error) throw error;
  }

  return project;
}

/**
 * Restaura um backup .json SOBRE um projeto já existente: atualiza os
 * dados cadastrais e substitui todos os lançamentos e horas pelos do
 * arquivo (apaga o que existia antes no projeto).
 */
export async function overwriteProjectFromBackup(projectId, backup) {
  const project = await updateProject(projectId, {
    name: backup.info.name,
    hourly_rate: backup.info.hourlyRate || 0,
    total_hours_sold: backup.info.totalHoursSold || 0,
    client_name: backup.info.clientName || '',
    location: backup.info.location || '',
    client_contact: backup.info.clientContact || ''
  });

  const { error: delEntriesErr } = await supabase.from('entries').delete().eq('project_id', projectId);
  if (delEntriesErr) throw delEntriesErr;
  const { error: delHoursErr } = await supabase.from('hours').delete().eq('project_id', projectId);
  if (delHoursErr) throw delHoursErr;

  if (backup.entries?.length) {
    const rows = backup.entries.map(({ type, category, amount, date, description }) => ({
      project_id: projectId,
      type,
      category: category || null,
      amount,
      date,
      description: description || null
    }));
    const { error } = await supabase.from('entries').insert(rows);
    if (error) throw error;
  }

  if (backup.hours?.length) {
    const rows = backup.hours.map(({ date, startTime, endTime, lunch, hours, description }) => ({
      project_id: projectId,
      date,
      start_time: startTime,
      end_time: endTime,
      lunch: lunch ?? true,
      hours,
      description: description || null
    }));
    const { error } = await supabase.from('hours').insert(rows);
    if (error) throw error;
  }

  return project;
}
