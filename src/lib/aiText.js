import { supabase } from './supabaseClient.js';

/** Tempo máximo esperando a IA antes de salvar com o texto original. */
const TIMEOUT_MS = 10000;

/**
 * Revisa um texto curto (ortografia, concordância, pontuação e tom) via
 * Edge Function + Gemini, sem mudar o sentido do que foi escrito. Se o
 * serviço falhar ou demorar mais de 10s, devolve o texto original — nunca
 * trava quem está salvando algo por causa disso.
 */
export async function correctText(text) {
  if (!text || !text.trim()) return text;
  try {
    const { data, error } = await supabase.functions.invoke('correct-text', {
      body: { text },
      timeout: TIMEOUT_MS
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Falha ao revisar texto');
    return data.text || text;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Revisão automática indisponível:', err);
    return text;
  }
}
