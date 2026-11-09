import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_MODEL = "gemini-3.8-flash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function stripWrappingQuotes(text: string) {
  const trimmed = text.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Revisa uma anotação curta (ex: descrição de atividade em Horas), corrigindo
 * só ortografia, concordância e pontuação e melhorando o tom pra ficar claro
 * e profissional — sem inventar informação nem mudar o sentido do que foi
 * escrito. Usado automaticamente ao salvar, pelo botão "Registrar jornada".
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    if (!text || !String(text).trim()) {
      return jsonResponse({ ok: true, text: text || "" });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return jsonResponse({ ok: false, error: "GEMINI_API_KEY não configurada" }, 500);
    }

    const prompt = `Você revisa anotações rápidas de técnicos de campo de automação/robótica industrial, escritas no celular durante o serviço.

Corrija SOMENTE:
- ortografia e acentuação
- concordância verbal e nominal
- pontuação

Melhore o tom pra ficar claro e profissional, mas:
- NÃO invente informação que não está no texto
- NÃO mude o sentido nem adicione detalhes
- NÃO traduza nem troque termos técnicos (nomes de equipamentos, siglas como CLP, IHM, FAT, SAT, etc.)
- Se o texto já estiver correto, devolva exatamente igual
- Responda só com o texto revisado, em português do Brasil, sem aspas, sem comentários, sem explicação

Texto original:
"""
${text}
"""`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return jsonResponse({ ok: false, error: `Gemini: ${geminiRes.status} ${errText}` }, 502);
    }

    const geminiJson = await geminiRes.json();
    const raw = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      return jsonResponse({ ok: false, error: "Resposta vazia do Gemini" }, 502);
    }

    return jsonResponse({ ok: true, text: stripWrappingQuotes(raw) });
  } catch (err) {
    return jsonResponse({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
});
