import { supabase } from './supabaseClient.js';

/** Sobe a foto da nota fiscal pro bucket privado "receipts" e devolve o caminho salvo. */
export async function uploadReceipt(file) {
  const ext = file.name?.includes('.') ? file.name.split('.').pop() : (file.type?.split('/')[1] || 'jpg');
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('receipts').upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false
  });
  if (error) throw error;
  return path;
}

/** Gera uma URL temporária (bucket é privado) e abre a foto da nota numa aba nova. */
export async function openReceipt(path) {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60);
  if (error) throw error;
  window.open(data.signedUrl, '_blank');
}

/**
 * Apaga fotos de nota do Storage. Falha silenciosa: se não conseguir apagar
 * a foto, o lançamento/projeto já foi excluído e isso não deve travar nada —
 * só sobra um arquivo esquecido.
 */
export async function removeReceipts(paths) {
  const valid = (paths || []).filter(Boolean);
  if (valid.length === 0) return;
  const { error } = await supabase.storage.from('receipts').remove(valid);
  // eslint-disable-next-line no-console
  if (error) console.error('Não foi possível apagar foto(s) da nota:', error);
}
