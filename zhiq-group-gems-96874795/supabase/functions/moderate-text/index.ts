/**
 * moderate-text — IA de moderação semântica de textos da VIAGG-TX8.
 *
 * SEGURANÇA POR DESENHO: analisa título, descrição, categoria, preço e contatos
 * antes da inserção na base de dados. Chamada SÍNCRONA (feedback imediato no upload).
 *
 * ORION CORE: NÃO chama provedor de IA diretamente — usa EXCLUSIVAMENTE o
 * ORION AI Gateway (module="ridv", prompt_key="ridv.moderacao.texto"), que
 * resolve provedor/modelo, aplica cache/retry e audita custo/tokens. Espelha
 * o caminho já validado do ridv-worker.
 *
 * Retorna: "approved" (>=85 aprovada) · "manual_review" (ambíguo/falha) · "blocked" (>=85 bloqueada)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type TextVerdict = {
  decisao: "aprovada" | "revisao" | "bloqueada";
  confianca: number;
  categoria_violacao: string;
  motivo: string;
};

/** Analisa via ORION AI Gateway (prompt do Registry). Sem chamada direta a provedor. */
async function analisarViaGateway(payload: string): Promise<{ verdict: TextVerdict; modelo: string }> {
  const resp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/orion-ai-gateway`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      module: "ridv",
      task: "moderation",
      prompt_key: "ridv.moderacao.texto",   // Prompt Registry oficial (ORION CORE)
      prompt: `=== ANÚNCIO PARA ANÁLISE ===\n${payload}`,
      max_tokens: 350,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!data?.ok) throw new Error(String(data?.error || `gateway ${resp.status}`));

  const text: string = data.texto ?? "";
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return {
    verdict: {
      decisao: ["aprovada", "revisao", "bloqueada"].includes(parsed.decisao) ? parsed.decisao : "revisao",
      confianca: Math.max(0, Math.min(100, Number(parsed.confianca) || 0)),
      categoria_violacao: String(parsed.categoria_violacao ?? "outro"),
      motivo: String(parsed.motivo ?? "").slice(0, 300),
    },
    modelo: `${data.provider ?? "gateway"}/${data.model ?? "?"}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return json({ ok: false, error: "Não autenticado" }, 401);

  const input = await req.json().catch(() => ({}));
  const title = String(input.title ?? "").trim();
  const description = String(input.description ?? "").trim();
  const category = String(input.category ?? "produto").trim();
  const price = input.price !== undefined && input.price !== null ? String(input.price) : "Não informado";
  const listingId = input.listing_id ?? null;

  if (!title && !description) return json({ ok: false, error: "Título e descrição estão vazios" }, 400);

  const textPayload = `Categoria do Módulo: ${category}\nTítulo: ${title}\nDescrição: ${description}\nPreço informado: ${price}`;

  let verdict: TextVerdict;
  let modelo = "orion-ai-gateway";
  try {
    const r = await analisarViaGateway(textPayload);
    verdict = r.verdict; modelo = r.modelo;
  } catch (e) {
    // Fail-safe: Gateway/IA indisponível → revisão manual (nunca aprova sozinho)
    verdict = {
      decisao: "revisao", confianca: 0, categoria_violacao: "indisponivel",
      motivo: `IA de texto indisponível (${String(e).slice(0, 120)}) — encaminhado para revisão manual`,
    };
  }

  const finalStatus =
    verdict.decisao === "aprovada" && verdict.confianca >= 85 ? "approved"
    : verdict.decisao === "bloqueada" && verdict.confianca >= 85 ? "blocked"
    : "manual_review";

  const { data: logRec } = await svc.from("ridv_decisions_log").insert({
    listing_id: listingId,
    media_id: null,
    category,
    content_type: "text",
    status: finalStatus,
    confidence: verdict.confianca,
    reason: verdict.motivo,
    verdict: verdict.decisao,
    ai_provider: modelo,
    user_id: uid,
    metadata: { title, description: description.slice(0, 500), price, categoria_violacao: verdict.categoria_violacao },
  }).select("id").single();

  return json({
    ok: true,
    log_id: logRec?.id,
    status: finalStatus,
    confidence: verdict.confianca,
    category_violation: verdict.categoria_violacao,
    reason: verdict.motivo,
    verdict: verdict.decisao,
  });
});
