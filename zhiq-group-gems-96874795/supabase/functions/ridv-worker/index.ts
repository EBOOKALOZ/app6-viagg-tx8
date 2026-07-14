/**
 * ridv-worker — motor da RIDV AI V2.0 (ORION-AI-02).
 *
 * Processa no SERVIDOR os anúncios presos em 'pending_ai_analysis':
 *   fila (ridv_worker_fila) → análise de texto com IA → veredito
 *   aplicado via ridv_worker_aplicar (aprovado entra no ar, bloqueado
 *   some, ambíguo vai à revisão manual) + auditoria + eventos ORION.
 *
 * É disparado por: trigger AFTER INSERT das tabelas de anúncio
 * (pg_net), cron de 5 min (backstop) e botão do painel /admin/ridv.
 * Fail-safe: IA indisponível (ex.: sem créditos) → manual_review.
 * Concorrência: ridv_worker_aplicar só transiciona quem ainda está
 * pendente — invocações simultâneas não duplicam decisão.
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

const MODEL = "claude-haiku-4-5-20251001";

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

async function analisar(payload: string): Promise<TextVerdict> {
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
      model: MODEL,
      max_tokens: 350,
      messages: [{
        role: "user",
        content: `${POLICY_TEXT}\n\n=== ANÚNCIO PARA ANÁLISE ===\n${payload}`,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: fila, error: filaErr } = await svc.rpc("ridv_worker_fila", { p_limite: 10 });
  if (filaErr) return json({ ok: false, error: filaErr.message }, 500);

  const itens = (fila || []) as any[];
  const resultados: any[] = [];
  let iaIndisponivel = false;   // 1ª falha de IA (ex.: sem créditos) evita chamadas inúteis no lote

  for (const item of itens) {
    const t0 = Date.now();
    let verdict: TextVerdict;

    if (iaIndisponivel) {
      verdict = {
        decisao: "revisao", confianca: 0, categoria_violacao: "indisponivel",
        motivo: "IA de moderação indisponível — encaminhado para revisão manual",
      };
    } else {
      try {
        verdict = await analisar(
          `Categoria do Módulo: ${item.tabela}\nTítulo: ${item.titulo ?? ""}\n` +
          `Descrição: ${item.descricao ?? ""}\nCidade: ${item.cidade ?? "Não informada"}\n` +
          `Preço informado: ${item.preco ?? "Não informado"}`,
        );
      } catch (e) {
        iaIndisponivel = true;
        verdict = {
          decisao: "revisao", confianca: 0, categoria_violacao: "indisponivel",
          motivo: `IA de moderação indisponível (${String(e).slice(0, 120)}) — revisão manual`,
        };
      }
    }

    const status =
      verdict.decisao === "aprovada" && verdict.confianca >= 85 ? "approved"
      : verdict.decisao === "bloqueada" && verdict.confianca >= 85 ? "blocked"
      : "manual_review";

    const { data: aplicado, error: aplicarErr } = await svc.rpc("ridv_worker_aplicar", {
      p_tabela: item.tabela,
      p_id: item.id,
      p_status: status,
      p_verdict: verdict.decisao,
      p_confianca: verdict.confianca,
      p_motivo: verdict.motivo,
      p_categoria_violacao: verdict.categoria_violacao,
      p_tempo_ms: Date.now() - t0,
      p_modelo: `anthropic/${MODEL}`,
    });

    resultados.push({
      tabela: item.tabela, id: item.id, status,
      confianca: verdict.confianca,
      aplicado: aplicarErr ? `ERRO: ${aplicarErr.message}` : aplicado,
    });
  }

  return json({ ok: true, processados: resultados.length, ia_disponivel: !iaIndisponivel, resultados });
});
