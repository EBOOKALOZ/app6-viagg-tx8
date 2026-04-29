/**
 * campaign-share — Edge Function
 *
 * Gera um HTML estático com Open Graph tags para que o WhatsApp
 * (e outros crawlers) consigam criar preview bonito do link.
 *
 * Fluxo:
 *   1. WhatsApp/Telegram rastreia a URL → lê as OG tags → exibe preview
 *   2. Usuário humano clica → JS redireciona para o app React imediatamente
 *
 * URL: https://broifhfqmnzqoongtokm.supabase.co/functions/v1/campaign-share?id=CAMPAIGN_ID
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

// ─── CORS (necessário para qualquer Edge Function) ────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── App base URL (configurar como Supabase Secret: APP_BASE_URL) ─────────────
// Fallback: Lovable preview URL padrão do projeto
const APP_BASE_URL =
  Deno.env.get("APP_BASE_URL") ??
  "https://zhiq-group-gems-96874795.lovable.app";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHtml(opts: {
  title: string;
  description: string;
  image: string;
  url: string;
  redirectUrl: string;
  storeName: string | null;
  city: string | null;
}): string {
  const { title, description, image, url, redirectUrl, storeName, city } = opts;

  const locationLine = [storeName, city].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html lang="pt-BR" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>

  <!-- Open Graph (WhatsApp / Telegram / Facebook) -->
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${esc(url)}" />
  <meta property="og:title"       content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  ${image ? `<meta property="og:image"       content="${esc(image)}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />` : ""}
  <meta property="og:site_name"   content="Viagg" />
  <meta property="og:locale"      content="pt_BR" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  ${image ? `<meta name="twitter:image"       content="${esc(image)}" />` : ""}

  <!-- Redirect imediato para o app (crawlers não executam JS) -->
  <script>window.location.replace("${redirectUrl}");</script>
  <noscript>
    <meta http-equiv="refresh" content="0; url=${redirectUrl}" />
  </noscript>

  <style>
    body { margin: 0; font-family: system-ui, sans-serif;
           background: #fff8f6; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; }
    .card { max-width: 420px; padding: 2rem; text-align: center; }
    .logo { font-size: 2rem; font-weight: 900; color: #f97316; margin-bottom: .5rem; }
    h1 { font-size: 1.25rem; font-weight: 800; color: #1a1a1a; margin: 0 0 .5rem; }
    p  { font-size: .875rem; color: #6b7280; margin: 0 0 1.5rem; }
    a  { display: inline-block; padding: .75rem 2rem;
         background: linear-gradient(135deg,#f97316,#ef4444);
         color: #fff; font-weight: 700; border-radius: 12px;
         text-decoration: none; font-size: .875rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Viagg</div>
    <h1>${esc(title)}</h1>
    ${locationLine ? `<p>${esc(locationLine)}</p>` : ""}
    <a href="${redirectUrl}">Ver promoção →</a>
  </div>
</body>
</html>`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("id");

  if (!campaignId) {
    return new Response("Missing ?id=", { status: 400, headers: CORS });
  }

  // ── Supabase client (usa variáveis injetadas automaticamente pela plataforma)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );

  // ── 1. Buscar campanha ──────────────────────────────────────────────────────
  const { data: campaign, error } = await supabase
    .from("campaign_queue")
    .select("id, title, message_text, media_url, campaign_type, target_city, target_region, merchant_store_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !campaign) {
    // Redireciona para o mercado se campanha não encontrada
    return Response.redirect(`${APP_BASE_URL}/mercado`, 302);
  }

  // ── 2. Buscar loja (se houver) ──────────────────────────────────────────────
  let storeName: string | null = null;
  let storeId: string | null = null;

  if (campaign.merchant_store_id) {
    const { data: store } = await supabase
      .from("merchant_stores")
      .select("id, store_name")
      .eq("id", campaign.merchant_store_id)
      .maybeSingle();

    storeName = store?.store_name ?? null;
    storeId = store?.id ?? null;
  }

  // ── 3. Montar metadados OG ──────────────────────────────────────────────────
  const ogTitle = campaign.title ?? (storeName ? `Promoção — ${storeName}` : "Promoção Viagg");
  const ogDesc = (() => {
    const parts: string[] = [];
    if (storeName) parts.push(`Loja: ${storeName}`);
    if (campaign.target_city) parts.push(`📍 ${campaign.target_city}`);
    if (campaign.message_text) parts.push(campaign.message_text.slice(0, 120));
    return parts.join("\n") || "Veja essa oferta incrível na plataforma Viagg!";
  })();
  const ogImage = campaign.media_url ?? "";

  // URL canônica desta edge function (para og:url)
  const canonicalUrl = `https://broifhfqmnzqoongtokm.supabase.co/functions/v1/campaign-share?id=${campaignId}`;

  // URL de destino no app React
  const redirectUrl = storeId
    ? `${APP_BASE_URL}/loja/${storeId}`
    : `${APP_BASE_URL}/divulgar/${campaignId}`;

  // ── 4. Retornar HTML ────────────────────────────────────────────────────────
  const html = buildHtml({
    title: ogTitle,
    description: ogDesc,
    image: ogImage,
    url: canonicalUrl,
    redirectUrl,
    storeName,
    city: campaign.target_city ?? null,
  });

  return new Response(html, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "text/html; charset=utf-8",
      // Cache curto: WhatsApp rastreia uma vez e guarda no cache
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
    },
  });
});
