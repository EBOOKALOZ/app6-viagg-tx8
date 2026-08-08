/**
 * radar-ia — camada de IA do RADAR IA (análise de grupos WhatsApp).
 *
 * O motor determinístico (radar_score_groups, SQL) já pontuou/classificou.
 * Esta função usa o modelo Anthropic para: explicar o score em linguagem
 * natural, refinar a recomendação e incorporar APRENDIZADO das decisões
 * manuais do admin (radar_admin_decisions) como contexto.
 *
 * Chamadas (POST, admin only):
 *   { group_id }  → analisa 1 grupo
 *   { batch: 10 } → analisa os N sem análise de IA mais recentes
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * NÍVEL 1 de verificação: consulta a PRÉVIA PÚBLICA do convite
 * (chat.whatsapp.com) — revela se o link está ATIVO ou REVOGADO, o nome
 * REAL do grupo (og:title) e a foto (og:image). A prévia NÃO expõe a
 * contagem de membros (isso só com bot dentro do grupo — Nível 2).
 */
// og:title vem com entidades HTML (&#xe3; = ã, emojis &#x1f5e3;) — decodifica
const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function verifyInviteLink(link: string): Promise<{
  status: "ativo" | "revogado" | "erro";
  realName: string | null;
  photoUrl: string | null;
}> {
  try {
    if (!/chat\.whatsapp\.com\//i.test(link)) {
      return { status: "revogado", realName: null, photoUrl: null };
    }
    const resp = await fetch(link, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      redirect: "follow",
    });
    const html = await resp.text();
    const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i)?.[1]
      ?? null;
    const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i)?.[1]
      ?? null;

    // Convite válido → og:title traz o NOME do grupo; revogado/inexistente →
    // título genérico ("WhatsApp Group Invite") ou ausente.
    const decoded = title ? decodeEntities(title).trim() : null;
    const generic = !decoded || /^whatsapp group invite$/i.test(decoded);
    return {
      status: generic ? "revogado" : "ativo",
      realName: generic ? null : decoded!.slice(0, 200),
      photoUrl: image && /^https?:\/\//i.test(image) ? decodeEntities(image).slice(0, 500) : null,
    };
  } catch {
    return { status: "erro", realName: null, photoUrl: null };
  }
}

Deno.serve(async (req) => {
  const CORS = getCorsHeaders(req.headers.get("Origin"), {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  // Gate: só admin roda análise de IA
  const { data: isAdmin } = await userClient.rpc("mp_is_admin");
  if (!isAdmin) return json({ ok: false, error: "Apenas administradores" }, 403);

  const xaiKey = Deno.env.get("XAI_API_KEY");
  if (!xaiKey) return json({ ok: false, error: "XAI_API_KEY ausente" }, 500);

  const input = await req.json().catch(() => ({}));
  const batch = Number(input.batch ?? 0);

  // Seleciona alvos: 1 grupo ou lote sem análise de IA
  let targetsQuery = svc
    .from("radar_group_scores")
    .select("group_id, score, classification, commercial_potential, recommendation, factors")
    .order("analyzed_at", { ascending: false });
  // Lote: primeiro os nunca analisados; depois os mais antigos (permite
  // reverificar links periodicamente clicando "Analisar com IA" de novo).
  targetsQuery = input.group_id
    ? targetsQuery.eq("group_id", input.group_id)
    : targetsQuery
      .order("ai_analyzed_at", { ascending: true, nullsFirst: true })
      .limit(Math.min(batch || 5, 20));

  const { data: targets, error: tErr } = await targetsQuery;
  if (tErr) return json({ ok: false, error: tErr.message }, 500);
  if (!targets?.length) return json({ ok: true, analyzed: 0 });

  // Contexto de APRENDIZADO: últimas decisões manuais do admin
  const { data: decisions } = await svc
    .from("radar_admin_decisions")
    .select("decision, notes, score_at_decision")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: groups } = await svc
    .from("whatsapp_groups")
    .select("id, group_name, group_link, city_name, state_code, neighborhood, members_count, is_active, validation_status, created_at, last_posted_at")
    .in("id", targets.map((t: Record<string, unknown>) => t.group_id));

  let analyzed = 0;
  const results: unknown[] = [];

  for (const t of targets as Record<string, unknown>[]) {
    const g = (groups ?? []).find((x: Record<string, unknown>) => x.id === t.group_id);
    if (!g) continue;

    // ── VERIFICAÇÃO REAL DO LINK (prévia pública) ──────────────────
    // Grava o resultado no grupo; o UPDATE dispara o trigger do motor,
    // que repontua e aplica/retira vetos sozinho (link revogado, nome
    // divergente). Só depois a IA explica.
    let verification: Awaited<ReturnType<typeof verifyInviteLink>> | null = null;
    if (g.group_link) {
      verification = await verifyInviteLink(g.group_link);
      await svc.from("whatsapp_groups").update({
        link_status: verification.status,
        link_verified_at: new Date().toISOString(),
        real_name: verification.realName,
        photo_url: verification.photoUrl,
        // ADOÇÃO DO NOME REAL: o que o profissional digitou é só rótulo —
        // verificado o nome verdadeiro, a plataforma passa a exibi-lo.
        ...(verification.status === "ativo" && verification.realName
          ? { group_name: verification.realName }
          : {}),
      }).eq("id", g.id);
    }

    const prompt = `Você é o RADAR IA da plataforma VIAGG-TX8: auditor especialista em grupos de WhatsApp cadastrados por profissionais (motoboys, moto-táxis, motoristas) para divulgação comercial local.

GRUPO EM ANÁLISE:
${JSON.stringify(g, null, 2)}

SCORE DO MOTOR DETERMINÍSTICO (0-100) E FATORES:
score=${t.score} classificação=${t.classification} potencial_comercial=${t.commercial_potential}
fatores=${JSON.stringify(t.factors)}
recomendação_atual=${t.recommendation}

VERIFICAÇÃO REAL DO LINK (prévia pública do convite, feita agora):
${verification
  ? `status=${verification.status} nome_real=${verification.realName ?? "(indisponível)"}
ATENÇÃO: a contagem de membros informada (${g.members_count}) é AUTODECLARADA — a prévia não expõe membros. Se o link está revogado ou o nome real diverge do cadastrado, isso pesa contra a confiança.`
  : "(sem link para verificar)"}

APRENDIZADO — decisões manuais recentes do administrador (use como calibração do que ele considera aprovável):
${JSON.stringify(decisions ?? [])}

Responda APENAS um JSON válido:
{"explicacao": "2-3 frases em pt-BR explicando os principais fatores do score, direto e específico",
 "recomendacao_final": "aprovar_automatico|enviar_revisao|grupo_duplicado|link_invalido|grupo_suspeito|grupo_abandonado|baixa_qualidade|alto_potencial"}`;

    try {
      const resp = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${xaiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-3-mini",
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await resp.json();
      const text: string = data?.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));

      await svc
        .from("radar_group_scores")
        .update({
          ai_explanation: String(parsed.explicacao ?? "").slice(0, 800),
          recommendation: parsed.recomendacao_final ?? t.recommendation,
          engine: "rules-v1+ai",
          ai_analyzed_at: new Date().toISOString(),
        })
        .eq("group_id", t.group_id);

      analyzed++;
      results.push({ group_id: t.group_id, ...parsed });
    } catch (e) {
      results.push({ group_id: t.group_id, error: String(e).slice(0, 200) });
    }
  }

  return json({ ok: true, analyzed, results });
});
