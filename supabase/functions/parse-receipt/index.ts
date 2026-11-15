// Supabase Edge Function: parse-receipt
//
// Recebe a foto de uma nota fiscal (base64) e usa o Gemini (com visão) para
// extrair categoria, valor, data, cidade e estado, devolvendo JSON
// estruturado para preencher o formulário de Lançamentos.
//
// Usa a mesma GEMINI_API_KEY das outras funções (correct-text,
// analyze-service-report) — não precisa de nenhuma chave nova.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_MODEL = "gemini-3.8-flash";
const CATEGORIES = ["combustivel", "alimentacao", "pedagio", "hospedagem", "impostos", "diversos"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function todayBrasil() {
  // data de hoje no fuso de Brasília (a função roda em UTC)
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { image, mimeType } = await req.json();
    if (!image) {
      return json({ error: 'Campo "image" (base64) é obrigatório.' }, 400);
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return json({ error: "GEMINI_API_KEY não configurada nas secrets do Supabase." }, 500);
    }

    const today = todayBrasil();

    const prompt = `Você está analisando a foto de uma nota fiscal, cupom ou recibo brasileiro.
Extraia os dados da despesa.

Regras:
- "category": a categoria que melhor descreve a despesa entre: ${CATEGORIES.join(", ")}. Se não tiver certeza, use "diversos".
- "amount": valor TOTAL pago, em número (ponto decimal, sem "R$", sem separador de milhar).
- "date": data da compra no formato YYYY-MM-DD. Se não conseguir ler, use "${today}".
- "city" e "state": cidade e UF (sigla de 2 letras) do estabelecimento, se estiverem legíveis.
- "description": resumo curto (até 6 palavras) do que foi comprado ou do estabelecimento.
- Se algum campo não for legível, deixe string vazia ("") ou 0 para amount. NUNCA invente dados.`;

    const schema = {
      type: "OBJECT",
      properties: {
        category: { type: "STRING", enum: CATEGORIES },
        amount: { type: "NUMBER" },
        date: { type: "STRING" },
        city: { type: "STRING" },
        state: { type: "STRING" },
        description: { type: "STRING" }
      },
      required: ["category", "amount", "date", "city", "state", "description"]
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType || "image/jpeg", data: image } }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature: 0
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return json({ error: `Falha ao chamar o Gemini: ${geminiRes.status} ${errText}` }, 502);
    }

    const geminiJson = await geminiRes.json();
    const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return json({ error: "Resposta vazia da IA." }, 502);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "Não foi possível interpretar a resposta da IA." }, 502);
    }

    const result = {
      category: CATEGORIES.includes(parsed.category) ? parsed.category : "diversos",
      amount: Number(parsed.amount) || 0,
      date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : today,
      city: parsed.city || "",
      state: (parsed.state || "").toUpperCase().slice(0, 2),
      description: parsed.description || ""
    };

    return json(result, 200);
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
