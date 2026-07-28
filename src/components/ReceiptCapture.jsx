import { useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Upload de arquivo ou foto (câmera no celular) de uma nota fiscal.
 * Envia para a Edge Function "parse-receipt", que usa IA para extrair
 * categoria, valor, data, cidade e estado, e repassa o resultado via
 * onExtracted para o formulário de lançamento preencher os campos.
 */
export default function ReceiptCapture({ onExtracted }) {
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file) {
    if (!file) return;
    setError('');
    setPreview(URL.createObjectURL(file));
    setAnalyzing(true);
    try {
      const base64 = await fileToBase64(file);
      const { data, error: fnError } = await supabase.functions.invoke('parse-receipt', {
        body: { image: base64, mimeType: file.type || 'image/jpeg' }
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      onExtracted(data);
    } catch (err) {
      setError(
        'Não foi possível analisar a nota automaticamente (' +
          err.message +
          '). Preencha os campos manualmente abaixo.'
      );
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="receipt-drop" style={{ marginBottom: 12 }}>
      {preview && <img src={preview} alt="Nota fiscal" className="receipt-preview" style={{ marginBottom: 8 }} />}

      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={analyzing}>
          📷 Tirar foto da nota
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={analyzing}>
          📎 Enviar imagem
        </button>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {analyzing && <p className="muted" style={{ marginTop: 8 }}>Analisando nota fiscal…</p>}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
      {!preview && !error && (
        <p className="muted" style={{ marginTop: 8 }}>
          Opcional: envie a foto da nota fiscal para preencher categoria, valor, data, cidade e estado automaticamente.
        </p>
      )}
    </div>
  );
}
