/**
 * cors — allowlist central de origens para as Edge Functions (ORION-480, A-7).
 *
 * Antes: todo index.ts tinha "Access-Control-Allow-Origin": "*" hardcoded
 * (33 arquivos), refletindo indiscriminadamente para qualquer site — incluindo
 * functions financeiras (payments-charge, payments-webhook, orion-ai-gateway).
 * Um "*" em resposta que também carrega Authorization/credenciais é uma porta
 * aberta para qualquer origem ler a resposta via fetch cross-site.
 *
 * Agora: getCorsHeaders(origin) só ecoa o Origin da requisição se ele constar
 * na allowlist abaixo. Fora da allowlist, o header Access-Control-Allow-Origin
 * é omitido (não usamos "*" como fallback — refletir sem checar seria a mesma
 * falha maquiada). O navegador então bloqueia a leitura da resposta por JS em
 * origem não autorizada. Isso não afeta chamadas server-to-server (webhooks
 * Mercado Pago, Supabase Auth Hooks etc.): esses clientes não são browsers,
 * não aplicam a política de CORS e não enviam (nem precisam de) Origin.
 *
 * Fonte da allowlist:
 *  - Produção: https://www.viagg-tx8.com.br (public/ai-feed.json campo "url"
 *    e public/sitemap.xml — todas as URLs públicas do projeto usam esse host).
 *  - Preview/staging Vercel: *.vercel.app (projeto está linkado a um projeto
 *    Vercel — .vercel/project.json — e usa deploy previews por PR/branch).
 *  - Dev local: http://localhost:8080 — porta fixada em vite.config.ts
 *    (server.port = 8080, não é o default 5173) e confirmada em
 *    .env.staging (VITE_SITE_URL=http://localhost:8080).
 *
 * Para adicionar uma origem nova (novo domínio, novo ambiente), edite apenas
 * ALLOWED_ORIGINS/ALLOWED_ORIGIN_SUFFIXES abaixo — é a única fonte de verdade.
 */

const ALLOWED_ORIGINS = new Set([
  "https://www.viagg-tx8.com.br",
  "https://viagg-tx8.com.br",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

// Previews da Vercel usam subdomínios gerados por deploy (*.vercel.app).
// Checado por sufixo porque o subdomínio muda a cada build/PR.
const ALLOWED_ORIGIN_SUFFIXES = [".vercel.app"];

function isOriginAllowed(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "https:") return false;
    return ALLOWED_ORIGIN_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

/**
 * Monta os headers de CORS para a resposta, ecoando o Origin recebido
 * SOMENTE se ele estiver na allowlist. `extra` deixa cada function preservar
 * os Allow-Headers/Allow-Methods específicos que já tinha.
 *
 * Sem Origin (chamada server-to-server/webhook) ou Origin fora da allowlist:
 * Access-Control-Allow-Origin é omitido — a resposta segue normalmente para
 * quem não é browser; um browser em origem não autorizada tem a leitura
 * bloqueada pela própria política de CORS.
 */
export function getCorsHeaders(
  origin: string | null,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}
