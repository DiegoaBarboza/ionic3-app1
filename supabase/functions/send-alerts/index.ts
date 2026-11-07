import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

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

const DIAS_SEM_HORAS = 5;

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Roda 1x/dia (cron) e verifica 4 situações: etapa de Construção atrasada,
 * projeto de serviço atrasado, encomenda atrasada e projeto ativo sem
 * lançamento de horas há vários dias. Se houver algo, manda 1 push-resumo
 * pra cada dispositivo inscrito (tabela push_subscriptions). Se não houver
 * nada pendente, não manda nada — pra não virar ruído.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:diegono@gmail.com";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return jsonResponse({ ok: false, error: "VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas" }, 500);
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const today = toISODate(new Date());
    const limiteSemHoras = toISODate(new Date(Date.now() - DIAS_SEM_HORAS * 24 * 60 * 60 * 1000));

    const linhas: string[] = [];

    // 1. Etapas de Construção de Máquinas atrasadas.
    const { data: etapasAtrasadas, error: erroEtapas } = await supabase
      .from("project_stages")
      .select("stage_label, planned_end, projects(name)")
      .neq("status", "concluida")
      .not("planned_end", "is", null)
      .lt("planned_end", today);
    if (erroEtapas) throw erroEtapas;
    for (const e of etapasAtrasadas ?? []) {
      linhas.push(`🔧 ${(e as any).projects?.name || "Projeto"}: etapa "${e.stage_label}" atrasada (previsto ${e.planned_end})`);
    }

    // 2. Projetos de serviço atrasados.
    const { data: servicosAtrasados, error: erroServicos } = await supabase
      .from("projects")
      .select("name, data_termino_prevista")
      .eq("tipo_projeto", "servico")
      .is("data_finalizacao", null)
      .not("data_termino_prevista", "is", null)
      .lt("data_termino_prevista", today);
    if (erroServicos) throw erroServicos;
    for (const p of servicosAtrasados ?? []) {
      linhas.push(`🛠️ ${p.name}: serviço atrasado (previsto ${p.data_termino_prevista})`);
    }

    // 3. Encomendas/compras atrasadas.
    const { data: encomendasAtrasadas, error: erroEncomendas } = await supabase
      .from("encomendas")
      .select("descricao, prazo_combinado, projects(name)")
      .is("data_entrega", null)
      .not("prazo_combinado", "is", null)
      .lt("prazo_combinado", today);
    if (erroEncomendas) throw erroEncomendas;
    for (const enc of encomendasAtrasadas ?? []) {
      linhas.push(
        `📦 ${(enc as any).projects?.name || "Projeto"}: encomenda "${enc.descricao}" atrasada (prazo ${enc.prazo_combinado})`
      );
    }

    // 4. Projetos ativos sem lançamento de horas há DIAS_SEM_HORAS dias.
    const { data: projetos, error: erroProjetos } = await supabase
      .from("projects")
      .select("id, name, tipo_projeto, data_finalizacao, created_at");
    if (erroProjetos) throw erroProjetos;

    const { data: etapasTodas, error: erroEtapasTodas } = await supabase
      .from("project_stages")
      .select("project_id, status");
    if (erroEtapasTodas) throw erroEtapasTodas;

    const { data: horasTodas, error: erroHoras } = await supabase.from("hours").select("project_id, date");
    if (erroHoras) throw erroHoras;

    const ultimaHoraPorProjeto = new Map<string, string>();
    for (const h of horasTodas ?? []) {
      const atual = ultimaHoraPorProjeto.get(h.project_id);
      if (!atual || h.date > atual) ultimaHoraPorProjeto.set(h.project_id, h.date);
    }

    const temEtapaEmAberto = new Set(
      (etapasTodas ?? []).filter((e) => e.status !== "concluida").map((e) => e.project_id)
    );

    for (const p of projetos ?? []) {
      const ativo = p.tipo_projeto === "servico" ? !p.data_finalizacao : temEtapaEmAberto.has(p.id);
      if (!ativo) continue;
      if (p.created_at >= limiteSemHoras) continue; // projeto novo, ainda sem tempo de ter horas

      const ultimaHora = ultimaHoraPorProjeto.get(p.id);
      if (!ultimaHora || ultimaHora < limiteSemHoras) {
        linhas.push(
          ultimaHora
            ? `⏱️ ${p.name}: sem horas lançadas desde ${ultimaHora}`
            : `⏱️ ${p.name}: nenhuma hora lançada ainda`
        );
      }
    }

    if (linhas.length === 0) {
      return jsonResponse({ ok: true, enviado: false, motivo: "Nada pendente hoje" });
    }

    const payload = JSON.stringify({
      title: `Zentro Projects — ${linhas.length} pendência(s)`,
      body: linhas.slice(0, 5).join("\n") + (linhas.length > 5 ? `\n…e mais ${linhas.length - 5}` : ""),
      url: "/"
    });

    const { data: subscriptions, error: erroSubs } = await supabase.from("push_subscriptions").select("*");
    if (erroSubs) throw erroSubs;

    let enviados = 0;
    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        enviados++;
      } catch (err) {
        const status = (err as any)?.statusCode;
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    return jsonResponse({ ok: true, enviado: true, pendencias: linhas.length, dispositivos: enviados });
  } catch (err) {
    return jsonResponse({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
});
