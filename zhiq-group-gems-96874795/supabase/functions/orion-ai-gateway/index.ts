/**
 * orion-ai-gateway — ORION-AI-00 — camada única de IA da VIAGG-TX8.
 *
 * TODO módulo de IA passa por aqui. Fluxo:
 *   ctx (config + modelo do módulo + contadores) → rate limit →
 *   cache → provedor (retry + timeout + fallback entre provedores)
 *   → log IMUTÁVEL em orion_ai_log → resposta.
 *
 * Provedores: OpenAI + Anthropic (Gemini/Grok/DeepSeek entram só
 * cadastrando modelo no painel + secret — sem tocar nos consumidores).
 * Chaves: SOMENTE via secrets (OPENAI_API_KEY / ANTHROPIC_API_KEY).
 * Fail-safe: nunca perde a solicitação — falha total ⇒
 * {ok:false, fallback:"manual_review"} + log com erro e retries.
 *
 * Body: { module, task?, prompt, system?, model?, max_tokens?, cache? }
 * Body { action: "health" } → status das chaves e config (sem custo).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

type Modelo = {
  provider: string; model_code: string;
  custo_input_mtok: number; custo_output_mtok: number; max_tokens_default: number;
};

const KEY_ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  xai: "XAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Camada multimodal única: texto (default) + imagem (base64 ou URL).
// Arquitetura pronta para áudio/vídeo/PDF (novo campo em ImgInput → novo bloco por provider).
type ImgInput = { b64?: string; mime?: string; url?: string } | null;

async function chamarProvedor(
  m: Modelo, prompt: string, system: string | null,
  maxTokens: number, timeoutMs: number, image: ImgInput = null,
): Promise<{ texto: string; tokensIn: number; tokensOut: number }> {
  const key = Deno.env.get(KEY_ENV[m.provider] || "");
  if (!key) throw new Error(`chave ${KEY_ENV[m.provider]} não configurada`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    if (m.provider === "openai") {
      // conteúdo do usuário: string (texto) OU blocos (texto + imagem)
      const userContent: any = image
        ? [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image.url || `data:${image.mime || "image/jpeg"};base64,${image.b64}` } },
          ]
        : prompt;
      const messages: any[] = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: userContent });
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: m.model_code, messages,
          // família GPT-5: max_completion_tokens inclui tokens de raciocínio →
          // reasoning_effort minimal + piso de 64 garante que sobra texto na resposta
          max_completion_tokens: Math.max(maxTokens, 64),
          ...(m.model_code.startsWith("gpt-5") ? { reasoning_effort: "minimal" } : {}),
        }),
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const d = await r.json();
      return {
        texto: d?.choices?.[0]?.message?.content ?? "",
        tokensIn: d?.usage?.prompt_tokens ?? 0,
        tokensOut: d?.usage?.completion_tokens ?? 0,
      };
    }
    if (m.provider === "anthropic") {
      const userContent: any = image
        ? [
            image.url
              ? { type: "image", source: { type: "url", url: image.url } }
              : { type: "image", source: { type: "base64", media_type: image.mime || "image/jpeg", data: image.b64 } },
            { type: "text", text: prompt },
          ]
        : prompt;
      const body: any = {
        model: m.model_code, max_tokens: maxTokens,
        messages: [{ role: "user", content: userContent }],
      };
      if (system) body.system = system;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: ctrl.signal,
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const d = await r.json();
      return {
        texto: d?.content?.[0]?.text ?? "",
        tokensIn: d?.usage?.input_tokens ?? 0,
        tokensOut: d?.usage?.output_tokens ?? 0,
      };
    }
    throw new Error(`provider ${m.provider} ainda sem adaptador`);
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const input = await req.json().catch(() => ({}));

  // ── health: status das chaves/config, sem chamar provedor ──
  if (input.action === "health") {
    const { data: ctxH } = await svc.rpc("orion_ai_gateway_ctx", { p_module: "health" });
    return json({
      ok: true,
      chaves: Object.fromEntries(Object.entries(KEY_ENV).map(([p, env]) => [p, !!Deno.env.get(env)])),
      modelo_padrao: ctxH?.config?.modelo_padrao ?? null,
      rate: ctxH?.rate ?? null,
    });
  }

  const module = String(input.module || "desconhecido").slice(0, 40);
  const task = String(input.task || "text").slice(0, 30);
  const prompt = String(input.prompt || "");
  let system = input.system ? String(input.system) : null;
  if (!prompt) return json({ ok: false, error: "prompt vazio" }, 400);

  // Multimodal: imagem por base64 (upload) ou URL. Edge nunca conhece provider/modelo.
  const image: ImgInput = input.image_base64
    ? { b64: String(input.image_base64), mime: String(input.image_mime || "image/jpeg") }
    : (input.image_url || input.input?.image_url)
    ? { url: String(input.image_url || input.input?.image_url) }
    : null;
  // Rastreabilidade (FASE 7): request_id por chamada; trace_id propaga entre módulos
  const requestId = crypto.randomUUID();
  const traceId = String(input.trace_id || requestId);

  // Prompt Registry oficial (ORION CORE): prompt_key resolve o system
  // versionado no banco — módulos não embutem mais prompt.
  if (input.prompt_key) {
    const { data: pText } = await svc.rpc("orion_ai_prompt_get", {
      p_chave: String(input.prompt_key),
    });
    if (!pText) {
      return json({
        ok: false, error: `prompt_key '${input.prompt_key}' sem versão ativa no registry`,
        fallback: "manual_review",
      }, 400);
    }
    system = String(pText);
  }

  // identifica usuário (para rate por usuário; service_role → null)
  let userId: string | null = null;
  try {
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    userId = (await userClient.auth.getUser()).data?.user?.id ?? null;
  } catch { /* service_role ou anon */ }

  const t0 = Date.now();
  const log = async (campos: Record<string, unknown>) => {
    await svc.from("orion_ai_log").insert({
      module, task, user_id: userId, duracao_ms: Date.now() - t0,
      request_id: requestId, trace_id: traceId, ...campos,
    });
  };

  // ── contexto: config + modelo + contadores ──
  const { data: ctx, error: ctxErr } = await svc.rpc("orion_ai_gateway_ctx", {
    p_module: module, p_model_override: input.model ?? null,
  });
  if (ctxErr || !ctx?.model) {
    await log({ status: "erro", erro: `ctx: ${ctxErr?.message ?? "sem modelo ativo"}` });
    return json({ ok: false, error: "gateway sem modelo ativo", fallback: "manual_review" }, 500);
  }
  const cfg = ctx.config || {};
  const rate = ctx.rate || {};
  const num = (k: string, dflt: number) => Number(cfg[k] ?? dflt);

  // ── rate limit ──
  if (rate.minuto >= num("rate_por_minuto", 60) ||
      rate.dia >= num("limite_diario", 2000) ||
      rate.mes >= num("limite_mensal", 40000) ||
      rate.modulo_hora >= num("rate_modulo_hora", 500)) {
    await log({ status: "rate_limited", erro: JSON.stringify(rate).slice(0, 200) });
    return json({ ok: false, error: "rate limit atingido", fallback: "manual_review" }, 429);
  }
  if (userId) {
    const { count } = await svc.from("orion_ai_log").select("id", { count: "exact", head: true })
      .eq("user_id", userId).gte("criado_em", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
    if ((count ?? 0) >= num("rate_usuario_dia", 200)) {
      await log({ status: "rate_limited", erro: "limite diário do usuário" });
      return json({ ok: false, error: "limite diário do usuário atingido", fallback: "manual_review" }, 429);
    }
  }

  const modeloPrincipal = ctx.model as Modelo;
  const maxTokens = Number(input.max_tokens ?? cfg.max_tokens ?? modeloPrincipal.max_tokens_default ?? 800);
  const timeoutMs = num("timeout_ms", 30000);
  const retryMax = num("retry_max", 2);
  const cacheOn = (cfg.cache_enabled ?? true) && input.cache !== false;

  // ── cache ──
  const hash = await sha256(`${module}|${modeloPrincipal.model_code}|${task}|${system ?? ""}|${prompt}|${image?.b64 ?? image?.url ?? ""}`);
  if (cacheOn) {
    const { data: hit } = await svc.from("orion_ai_cache").select("resposta,hits")
      .eq("request_hash", hash).gt("expira_em", new Date().toISOString()).maybeSingle();
    if (hit) {
      await svc.from("orion_ai_cache").update({ hits: (hit.hits ?? 0) + 1 }).eq("request_hash", hash);
      await log({ status: "cache", cache_hit: true, request_hash: hash, custo_estimado: 0,
        provider: modeloPrincipal.provider, model: modeloPrincipal.model_code });
      return json({ ok: true, cache: true, request_id: requestId, trace_id: traceId, ...hit.resposta });
    }
  }

  // ── provedor principal + fallbacks entre provedores ──
  const candidatos: Modelo[] = [modeloPrincipal, ...((ctx.fallbacks || []) as Modelo[])
    .filter((f) => f.provider !== modeloPrincipal.provider)];
  let ultimoErro = "";
  let tentativas = 0;

  for (const m of candidatos) {
    if (!Deno.env.get(KEY_ENV[m.provider] || "")) { ultimoErro = `chave ${KEY_ENV[m.provider]} ausente`; continue; }
    for (let tent = 0; tent <= retryMax; tent++) {
      tentativas++;
      try {
        const r = await chamarProvedor(m, prompt, system, maxTokens, timeoutMs, image);
        const custo = (r.tokensIn / 1e6) * Number(m.custo_input_mtok) +
                      (r.tokensOut / 1e6) * Number(m.custo_output_mtok);
        const resposta = {
          texto: r.texto, provider: m.provider, model: m.model_code,
          tokens_in: r.tokensIn, tokens_out: r.tokensOut,
          custo_estimado: Number(custo.toFixed(6)),
        };
        if (cacheOn) {
          await svc.from("orion_ai_cache").upsert({
            request_hash: hash, module, model: m.model_code, resposta,
            expira_em: new Date(Date.now() + num("cache_ttl_min", 1440) * 60000).toISOString(),
          });
        }
        await log({
          status: m.model_code === modeloPrincipal.model_code ? "ok" : "fallback",
          provider: m.provider, model: m.model_code,
          tokens_in: r.tokensIn, tokens_out: r.tokensOut,
          custo_estimado: resposta.custo_estimado,
          retries: tentativas - 1, request_hash: hash,
        });
        return json({ ok: true, cache: false, request_id: requestId, trace_id: traceId, ...resposta });
      } catch (e) {
        ultimoErro = String(e).slice(0, 250);
        if (tent < retryMax) await new Promise((res) => setTimeout(res, 400 * Math.pow(2, tent)));
      }
    }
  }

  // ── falha total: fail-safe, nada se perde ──
  await log({
    status: "erro", provider: modeloPrincipal.provider, model: modeloPrincipal.model_code,
    erro: ultimoErro, retries: tentativas, request_hash: hash,
  });
  return json({ ok: false, error: ultimoErro, fallback: "manual_review", request_id: requestId, trace_id: traceId }, 502);
});
