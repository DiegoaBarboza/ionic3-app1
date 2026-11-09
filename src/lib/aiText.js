import { supabase } from './supabaseClient.js';

/**
 * Revisa um texto curto (ortografia, concordância, pontuação e tom) via
 * Edge Function + Gemini, sem mudar o sentido do que foi escrito. Se o
 * serviço falhar, devolve o texto original — nunca trava quem está
 * salvando algo por causa disso.
 */
export async function correctText(text) {
  if (!text || !text.trim()) return text;
  try {
    const { data, error } = await supabase.functions.invoke('correct-text', { body: { text } });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Falha ao revisar texto');
    return data.text || text;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Revisão automática indisponível:', err);
    return text;
  }
}
