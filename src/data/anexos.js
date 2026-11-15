import { supabase } from '../lib/supabaseClient.js';

const BUCKET = 'anexos';
export const LIMITE_BYTES = 50 * 1024 * 1024;

export const CATEGORIAS_ANEXO = [
  { value: 'desenho', label: 'Desenho mecânico', icon: '📐' },
  { value: 'eletrico', label: 'Diagrama elétrico', icon: '⚡' },
  { value: 'foto', label: 'Foto de campo', icon: '📷' },
  { value: 'proposta', label: 'Proposta / contrato', icon: '📄' },
  { value: 'ata', label: 'Ata FAT/SAT', icon: '✅' },
  { value: 'manual', label: 'Manual / datasheet', icon: '📘' },
  { value: 'outro', label: 'Outro', icon: '📎' }
];

export function categoriaAnexo(value) {
  return CATEGORIAS_ANEXO.find((c) => c.value === value) || CATEGORIAS_ANEXO[CATEGORIAS_ANEXO.length - 1];
}

export async function listAnexos(projectId) {
  const { data, error } = await supabase
    .from('anexos')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Sobe o arquivo pro bucket privado e registra na tabela. Se o registro falhar, apaga o arquivo. */
export async function uploadAnexo(projectId, file, { categoria = 'outro', descricao = null } = {}) {
  if (file.size > LIMITE_BYTES) throw new Error(`"${file.name}" passa de 50 MB.`);
  const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'bin';
  const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from('anexos')
    .insert({
      project_id: projectId,
      nome: file.name,
      path,
      categoria,
      descricao,
      tamanho: file.size,
      mime: file.type || null
    })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function updateAnexo(id, fields) {
  const { data, error } = await supabase.from('anexos').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteAnexo(anexo) {
  const { error } = await supabase.from('anexos').delete().eq('id', anexo.id);
  if (error) throw error;
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([anexo.path]);
  // eslint-disable-next-line no-console
  if (rmErr) console.error('Arquivo do anexo não foi apagado do Storage:', rmErr);
}

/** Abre numa aba nova com link temporário (bucket privado). `baixar` força download com o nome original. */
export async function abrirAnexo(anexo, { baixar = false } = {}) {
  // abre a aba antes do await: no celular, abrir depois de esperar a rede é bloqueado como pop-up
  const win = baixar ? null : window.open('', '_blank');
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(anexo.path, 300, baixar ? { download: anexo.nome } : undefined);
  if (error) {
    win?.close();
    throw error;
  }
  if (win) win.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

/** Caminhos dos arquivos do projeto — buscados antes de excluir o projeto (as linhas somem em cascata). */
export async function pathsAnexosDoProjeto(projectId) {
  const { data } = await supabase.from('anexos').select('path').eq('project_id', projectId);
  return (data || []).map((a) => a.path);
}

export async function removerArquivos(paths) {
  if (!paths?.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  // eslint-disable-next-line no-console
  if (error) console.error('Não foi possível apagar anexos do Storage:', error);
}

export function formatTamanho(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
