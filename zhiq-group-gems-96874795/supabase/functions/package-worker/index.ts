/**
 * package-worker — motor da ORION Package AI (ORION-AI-03).
 *
 * Consome anúncios aprovados (claim idempotente via orion_package_fila —
 * evento duplicado NUNCA duplica pacote), monta o conteúdo de divulgação
 * multi-canal via ORION AI Gateway (nunca chama provedor direto),
 * roda a IA de qualidade (LGPD: zero telefone/PIX/e-mail; link oficial
 * obrigatório), anexa recomendação comercial explicável e grava via
 * orion_package_aplicar (erro 3x ⇒ Dead Letter Queue + evento).
 *
 * NÃO publica: publicação é decisão humana no painel, sempre via
 * motor_publish_request (porta única).
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

const SITE = "https://www.viagg-tx8.com.br";
const ROTA: Record<string, string> = {
  service_listings: "/servicos/", real_estate_listings: "/imoveis/",
  vehicle_listings: "/veiculos/", freight_listings: "/fretes/",
  travel_listings: "/viagens/", product_listings: "/produto/",
  auction_listings: "/mercado/leiloes/", advertiser_listings: "/produto/",
};

const SYSTEM_PROMPT = `Você é a ORION Package AI da plataforma VIAGG-TX8 (Brasil).
Transforme o anúncio em conteúdo de divulgação SEM alterar o significado, sem clickbait e sem inventar dados.
PROIBIDO em qualquer texto: telefone, WhatsApp, PIX, e-mail, endereço completo, links externos.
O único link permitido é o marcador {LINK} (a plataforma substitui pelo link oficial).
Responda APENAS JSON válido:
{"titulo":"título otimizado curto",
 "whatsapp":"mensagem p/ grupos WhatsApp, 3-6 linhas, emojis moderados, termina com CTA + {LINK}",
 "feed":"texto p/ feed interno, 2-4 linhas, termina com {LINK}",
 "marketplace":"descrição curta p/ vitrine, 1-2 linhas",
 "push":"notificação push, máx 90 caracteres",
 "hashtags":["3 a 6 hashtags relevantes sem espaços"],
 "emojis":["2 a 4 emojis da categoria"],
 "cta":"chamada para ação curta apontando para a VIAGG-TX8"}`;

// IA de qualidade — LGPD e higiene (defesa em profundidade além do prompt)
function qualidade(conteudo: any, link: string): { ok: boolean; problemas: string[] } {
  const problemas: string[] = [];
  const texto = JSON.stringify(conteudo).toLowerCase();
  if (/\(?\d{2}\)?[\s.\-]*9?\d{4}[\s.\-]?\d{4}/.test(texto) || /\d{5}[\s.\-]\d{4}/.test(texto) || /\d{9,}/.test(texto)) {
    problemas.push("telefone detectado");
  }
  if (texto.includes("pix")) problemas.push("PIX detectado");
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(texto)) problemas.push("e-mail detectado");
  if (/(https?:\/\/(?!www\.viagg-tx8\.com\.br))/.test(texto)) problemas.push("link externo detectado");
  for (const canal of ["whatsapp", "feed"]) {
    if (conteudo[canal] && !String(conteudo[canal]).includes(link)) {
      problemas.push(`canal ${canal} sem o link oficial`);
    }
  }
  if (!conteudo.titulo || String(conteudo.titulo).length < 8) problemas.push("título curto demais");
  if (String(conteudo.push || "").length > 120) problemas.push("push acima do limite");
  return { ok: problemas.length === 0, problemas };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(url, svcKey);

  // fila nova + retomada de pacotes com erro (retry)
  const { data: novos, error: e1 } = await svc.rpc("orion_package_fila", { p_limite: 5 });
  if (e1) return json({ ok: false, error: e1.message }, 500);
  const { data: retries } = await svc.rpc("orion_package_fila_retry", { p_limite: 3 });
  const itens = [...((novos || []) as any[]), ...((retries || []) as any[])];

  const resultados: any[] = [];
  for (const item of itens) {
    const t0 = Date.now();
    const link = `${SITE}${ROTA[item.tabela] ?? "/"}${item.listing_id}`;
    try {
      // conteúdo multi-canal via ORION AI Gateway (porta única de IA)
      const gw = await fetch(`${url}/functions/v1/orion-ai-gateway`, {
        method: "POST",
        headers: { Authorization: `Bearer ${svcKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "package", task: "generate",
          system: SYSTEM_PROMPT,
          prompt: `Anúncio aprovado:\nTítulo: ${item.titulo ?? ""}\nDescrição: ${item.descricao ?? ""}\n` +
                  `Cidade: ${item.cidade ?? "—"}\nPreço: ${item.preco ?? "—"}\nMódulo: ${item.tabela}`,
          max_tokens: 700,
        }),
      }).then((r) => r.json());
      if (!gw?.ok) throw new Error(String(gw?.error || "gateway indisponível"));

      const bruto = String(gw.texto || "");
      const conteudo = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1));
      for (const k of ["whatsapp", "feed", "marketplace", "push"]) {
        if (conteudo[k]) conteudo[k] = String(conteudo[k]).replaceAll("{LINK}", link);
      }
      conteudo.link_oficial = link;

      const q = qualidade(conteudo, link);
      if (!q.ok) throw new Error(`IA de qualidade reprovou: ${q.problemas.join("; ")}`);

      const { data: recomendacao } = await svc.rpc("orion_package_recomendar", {
        p_cidade: item.cidade ?? null, p_categoria: item.tabela,
      });

      const { error: apErr } = await svc.rpc("orion_package_aplicar", {
        p_pacote: item.pacote_id, p_status: "montado",
        p_conteudo: conteudo, p_recomendacao: recomendacao,
        p_qualidade: { ok: true, problemas: [], tempo_ms: Date.now() - t0, ia: `${gw.provider}/${gw.model}` },
        p_horario: { recomendado: recomendacao?.horario_recomendado ?? null },
      });
      if (apErr) throw new Error(apErr.message);

      resultados.push({ pacote: item.pacote_id, status: "montado", ms: Date.now() - t0 });
    } catch (e) {
      await svc.rpc("orion_package_aplicar", {
        p_pacote: item.pacote_id, p_status: "erro", p_erro: String(e).slice(0, 300),
      });
      resultados.push({ pacote: item.pacote_id, status: "erro", erro: String(e).slice(0, 160) });
    }
  }

  return json({ ok: true, processados: resultados.length, resultados });
});
