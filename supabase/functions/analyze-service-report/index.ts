import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

/**
 * Agente autonomo: a cada lancamento de horas de um projeto de servico, le
 * todas as descricoes diarias registradas e usa o Gemini para preencher
 * automaticamente os campos do relatorio de finalizacao (pendencias,
 * sugestoes, dificuldades e atraso). So analisa o que foi escrito pelo
 * tecnico, nao inventa informacao.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { project_id } = await req.json();
    if (!project_id) {
      return jsonResponse({ ok: false, error: "project_id é obrigatório" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
      return jsonResponse({ ok: false, error: "GEMINI_API_KEY não configurada" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, name, tipo_projeto, escopo_solicitado")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      return jsonResponse({ ok: false, error: "Projeto não encontrado" }, 404);
    }

    if (project.tipo_projeto !== "servico") {
      return jsonResponse({ ok: true, skipped: true, reason: "Projeto não é do tipo serviço" });
    }

    const { data: hours, error: hoursError } = await supabase
      .from("hours")
      .select("date, hours, description")
      .eq("project_id", project_id)
      .order("date", { ascending: true });

    if (hoursError) {
      return jsonResponse({ ok: false, error: hoursError.message }, 500);
    }

    const descricoes = (hours ?? [])
      .filter((h) => h.description && h.description.trim())
      .map((h) => `- ${h.date} (${h.hours}h): ${h.description}`)
      .join("\n");

    if (!descricoes) {
      return jsonResponse({ ok: true, skipped: true, reason: "Nenhuma descrição de atividade para analisar" });
    }

    const prompt = `Você é um assistente de engenharia que acompanha um serviço de campo de programação de robôs/CLP (projeto: "${project.name}"). Abaixo estão as descrições diárias de atividades registradas pelo técnico, em ordem cronológica.

Escopo solicitado pelo cliente: ${project.escopo_solicitado || "não informado"}

Descrições diárias:
${descricoes}

Analise TODAS as descrições acima e gere um resumo consolidado para o relatório final de atividades, em português, com base SOMENTE no que está escrito. Não invente informação que não esteja implícita no texto. Se não houver nada relevante para um campo, deixe-o como string vazia.

Responda no formato JSON pedido.`;

    const schema = {
      type: "OBJECT",
      properties: {
        pendencias: { type: "STRING", description: "Pendências identificadas, ainda não resolvidas" },
        sugestoes: { type: "STRING", description: "Sugestões de melhoria mencionadas ou implícitas" },
        dificuldades: { type: "STRING", description: "Dificuldades técnicas encontradas durante o serviço" },
        teve_atraso: { type: "BOOLEAN", description: "true se houver indício de atraso em relação ao previsto" },
        motivo_atraso: { type: "STRING", description: "Motivo do atraso, vazio se teve_atraso for false" }
      },
      required: ["pendencias", "sugestoes", "dificuldades", "teve_atraso", "motivo_atraso"]
    };

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
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature: 0.2
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return jsonResponse({ ok: false, error: `Gemini: ${geminiRes.status} ${errText}` }, 502);
    }

    const geminiJson = await geminiRes.json();
    const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return jsonResponse({ ok: false, error: "Resposta vazia do Gemini" }, 502);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return jsonResponse({ ok: false, error: "Não foi possível interpretar a resposta do Gemini" }, 502);
    }

    const update = {
      relatorio_pendencias: parsed.pendencias || null,
      relatorio_sugestoes: parsed.sugestoes || null,
      relatorio_dificuldades: parsed.dificuldades || null,
      teve_atraso: !!parsed.teve_atraso,
      motivo_atraso: parsed.teve_atraso ? parsed.motivo_atraso || null : null
    };

    const { error: updateError } = await supabase.from("projects").update(update).eq("id", project_id);

    if (updateError) {
      return jsonResponse({ ok: false, error: updateError.message }, 500);
    }

    return jsonResponse({ ok: true, ...update });
  } catch (err) {
    return jsonResponse({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
});
