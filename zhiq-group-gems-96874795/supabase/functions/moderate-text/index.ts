/**
 * moderate-text — IA de moderação semântica de textos da VIAGG-TX8.
 *
 * SEGURANÇA POR DESENHO: analisa título, descrição, categoria, preço e contatos
 * antes da inserção na base de dados.
 *
 * Retorna:
 *  - "approved" (aprovada com confiança >= 85)
 *  - "manual_review" (revisão manual - quarentena / ambíguo / falha)
 *  - "blocked" (reprovada/bloqueada - golpes, spam, palavras ofensivas, discriminação)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

type TextVerdict = {
  decisao: "aprovada" | "revisao" | "bloqueada";
  confianca: number;
  categoria_violacao: string;
  motivo: string;
};

const POLICY_TEXT = `Você é a IA RIDV de moderação de texto e anúncios da plataforma VIAGG-TX8 (Brasil).
Sua missão é analisar o texto enviado pelo usuário (Título, Descrição, Preço, Categoria) antes de ser publicado.

REGRAS DE BLOQUEIO IMEDIATO (decisao="bloqueada", confianca>=90):
1. Golpes, fraudes, esquemas de pirâmide, promessas irreais de ganho financeiro fácil ou lavagem de dinheiro.
2. Palavrões pesados, linguagem ofensiva agressiva, discurso de ódio, racismo, homofobia, discriminação.
3. Conteúdo adulto, pornografia, prostituição ou serviços sexuais explícitos.
4. Produtos ou serviços proibidos por lei (drogas, armas, explosivos, medicamentos controlados sem receita, diplomas falsos, contas clonadas).
5. Tentativas explícitas de golpe ou phishing solicitando senhas, dados bancários ou depósitos antecipados suspeitos via PIX fora do fluxo seguro do aplicativo.
6. Spam massivo ou repetição agressiva de caracteres e links externos maliciosos.

REGRAS DE REVISÃO MANUAL (decisao="revisao"):
1. Textos muito curtos, confusos ou ambíguos que impedem verificar a veracidade.
2. Inserção excessiva de números de telefone/WhatsApp ou e-mails no título ou descrição quando a categoria exigir que o contato ocorra via sistema de chat/intenção de contato da VIAGG-TX8.
3. Preços absurdamente incompatíveis (ex: carro por R$ 1,00 ou imóvel por R$ 10,00) que sugerem erro de digitação ou isca para golpe.
4. Confiança da IA na aprovação menor que 85.

APROVAR (decisao="aprovada", confianca>=85):
Anúncio normal, claro e legítimo de Produto, Veículo, Imóvel, Viagem, Frete ou Serviço sem infrações.

Responda APENAS JSON válido no seguinte formato:
{"decisao":"aprovada|revisao|bloqueada","confianca":0-100,
 "categoria_violacao":"ok|golpe_fraude|ofensivo_odio|adulto|proibido|contato_indevido|preco_incompativel|ambiguo|outro",
 "motivo":"1 frase curta e clara justificando a decisão em pt-BR"}`;

async function analyzeTextAnthropic(textPayload: string): Promise<TextVerdict> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY ausente");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 350,
      messages: [{
        role: "user",
        content: `${POLICY_TEXT}\n\n=== ANÚNCIO PARA ANÁLISE ===\n${textPayload}`,
      }],
    }),
  });

  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return {
    decisao: ["aprovada", "revisao", "bloqueada"].includes(parsed.decisao) ? parsed.decisao : "revisao",
    confianca: Math.max(0, Math.min(100, Number(parsed.confianca) || 0)),
    categoria_violacao: String(parsed.categoria_violacao ?? "outro"),
    motivo: String(parsed.motivo ?? "").slice(0, 300),
  };
}

const PROVIDERS: Record<string, (payload: string) => Promise<TextVerdict>> = {
  anthropic: analyzeTextAnthropic,
};

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

  if (!title && !description) {
    return json({ ok: false, error: "Título e descrição estão vazios" }, 400);
  }

  const textPayload = `Categoria do Módulo: ${category}\nTítulo: ${title}\nDescrição: ${description}\nPreço informado: ${price}`;

  const providerName = Deno.env.get("MODERATION_PROVIDER") || "anthropic";
  const analyze = PROVIDERS[providerName] ?? PROVIDERS.anthropic;

  let verdict: TextVerdict;
  try {
    verdict = await analyze(textPayload);
  } catch (e) {
    verdict = {
      decisao: "revisao",
      confianca: 0,
      categoria_violacao: "indisponivel",
      motivo: `IA de texto indisponível (${String(e).slice(0, 120)}) — encaminhado para revisão manual`,
    };
  }

  const finalStatus =
    verdict.decisao === "aprovada" && verdict.confianca >= 85 ? "approved"
    : verdict.decisao === "bloqueada" && verdict.confianca >= 85 ? "blocked"
    : "manual_review";

  // Registro na tabela unificada de aprendizado (Etapa 9)
  const { data: logRec } = await svc.from("ridv_decisions_log").insert({
    listing_id: listingId,
    media_id: null,
    category: category,
    content_type: "text",
    status: finalStatus,
    confidence: verdict.confianca,
    reason: verdict.motivo,
    verdict: verdict.decisao,
    ai_provider: providerName,
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
