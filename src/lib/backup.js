function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Baixa um backup .json do projeto (info + entries + hours), no mesmo
 * formato usado para restaurar um projeto — é a rede de segurança contra
 * qualquer falha de sincronização com o Supabase.
 */
export function downloadProjectBackup(project, entries, hours) {
  const payload = {
    info: {
      name: project.name,
      hourlyRate: project.hourly_rate,
      totalHoursSold: project.total_hours_sold,
      clientName: project.client_name,
      location: project.location,
      clientContact: project.client_contact,
      createdAt: project.created_at
    },
    entries: entries.map(({ id, type, category, amount, date, description }) => ({
      id,
      type,
      category,
      amount,
      date,
      description
    })),
    hours: hours.map(({ id, date, start_time, end_time, lunch, hours: h, description }) => ({
      id,
      date,
      startTime: start_time,
      endTime: end_time,
      lunch,
      hours: h,
      description
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
