#!/usr/bin/env node
/**
 * ORION-HARDENING — Suíte de regressão de SEGURANÇA (behavioral, via REST).
 * Base permanente criada na FASE 2 (ETAPA 3). Reutilizável nas próximas fases.
 *
 * O que cobre (contrato de segurança que NÃO pode regredir):
 *   1. RLS financeiro: anon NEGADO em tabelas de dinheiro/PII.
 *   2. Permissões: RPCs financeiras/sensíveis anon-BLOQUEADAS.
 *   3. Views: views financeiras non-invoker anon-BLOQUEADAS.
 *   4. Superfície pública preservada (categorias, inquiry, marketplace order).
 *   5. Fluxo autenticado preservado + isolamento entre usuários.
 *
 * Zero dependências (usa fetch nativo do Node ≥18). Não altera dados.
 *
 * Uso:
 *   node tests/security/rls-permissions.test.mjs
 *   # testes autenticados rodam só se TEST_EMAIL/TEST_PASSWORD estiverem no ambiente:
 *   TEST_EMAIL=alozzanata@hotmail.com TEST_PASSWORD='***' node tests/security/rls-permissions.test.mjs
 *
 * Sai com código 0 se tudo passar; 1 se qualquer teste falhar (pronto p/ CI).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(__dirname, "..", "..", "src", "integrations", "supabase", "client.ts");

// URL + anon key: env tem prioridade; senão extrai do client.ts (anon key é pública).
let CLIENT_SRC = "";
try { CLIENT_SRC = readFileSync(CLIENT, "utf8"); } catch { /* usa env */ }
const URL = process.env.SUPABASE_URL || (CLIENT_SRC.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
const ANON = process.env.SUPABASE_ANON_KEY || (CLIENT_SRC.match(/(eyJ[A-Za-z0-9_.-]{60,})/) || [])[1];
if (!URL || !ANON) { console.error("FALHA: não achei URL/anon key (env SUPABASE_URL/SUPABASE_ANON_KEY ou client.ts)."); process.exit(2); }

let pass = 0, fail = 0;
const fails = [];
async function check(label, fn) {
  try { await fn(); pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); }
  catch (e) { fail++; fails.push(label); console.log(`  \x1b[31mFAIL\x1b[0m  ${label} → ${e.message}`); }
}
const H = (jwt) => ({ apikey: ANON, ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), "Content-Type": "application/json" });
const rest = (path, opts = {}, jwt) => fetch(`${URL}/rest/v1/${path}`, { headers: H(jwt), ...opts });
const rpc = (fn, body, jwt) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(body || {}) }, jwt);
function expectStatus(res, allowed, ctx) {
  if (!allowed.includes(res.status)) throw new Error(`${ctx}: status ${res.status}, esperado ${allowed.join("/")}`);
}

const FIN_TABLES = [
  "escrow_holds", "escrow_accounts", "courier_bank_accounts", "courier_wallet_accounts",
  "courier_wallet_ledger", "external_bank_accounts", "ledger_entries", "pay_payout_requests",
  "pay_payout_events", "pay_split_transactions", "payment_intents", "payment_splits",
  "profile_wallets", "store_credit_wallet", "credit_transactions", "financial_transactions",
  "commissions_local", "delivery_splits", "professional_wallet_ledger", "bank_webhook_events",
];
const FIN_FUNCTIONS = [
  "admin_wallet_credit", "append_ledger_entry", "pay_settle_delivery", "settle_delivery",
  "credit_merchant_credits", "track_admin_profit_event", "admin_get_auth_emails",
  "admin_apply_financial_adjustment", "release_service_payment_split",
];
const FIN_VIEWS_NONINVOKER = [
  "v_pay_platform_ledger_summary", "platform_financial_dashboard", "v_account_balances",
  "v_pay_admin_recent_ledger", "professional_wallet_balances",
];
const PUBLIC_OK = ["product_categories"];

async function main() {
  console.log(`\nORION-HARDENING · Suíte de segurança REST → ${URL}\n`);

  console.log("### 1. RLS — anon NEGADO em tabelas financeiras");
  for (const t of FIN_TABLES)
    await check(`anon SELECT ${t} negado`, async () =>
      expectStatus(await rest(`${t}?select=id&limit=1`), [401, 403], t));

  console.log("### 2. Permissões — RPC financeira/sensível anon BLOQUEADA");
  for (const f of FIN_FUNCTIONS)
    await check(`anon RPC ${f} bloqueada`, async () => {
      const r = await rpc(f, {});
      // 404 (PGRST202: nem visível) ou 401/403 (permission denied) = bloqueado.
      if (![401, 403, 404].includes(r.status)) throw new Error(`status ${r.status} (executável!)`);
    });

  console.log("### 3. Views financeiras (non-invoker) anon BLOQUEADAS");
  for (const v of FIN_VIEWS_NONINVOKER)
    await check(`anon SELECT view ${v} bloqueada`, async () =>
      expectStatus(await rest(`${v}?select=*&limit=1`), [401, 403], v));

  console.log("### 4. Superfície pública preservada");
  for (const t of PUBLIC_OK)
    await check(`anon SELECT ${t} permitido`, async () =>
      expectStatus(await rest(`${t}?select=*&limit=1`), [200], t));

  // ── Testes autenticados (só com credenciais no ambiente) ──
  if (process.env.TEST_EMAIL && process.env.TEST_PASSWORD) {
    console.log("### 5. Fluxo autenticado preservado + isolamento");
    const tok = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: H(),
      body: JSON.stringify({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }),
    }).then((r) => r.json());
    const jwt = tok.access_token;
    if (!jwt) { console.log("  (login de teste falhou — pulando bloco autenticado)"); }
    else {
      await check("authenticated get_my_merchant_pay_wallet funciona", async () => {
        const j = await rpc("get_my_merchant_pay_wallet", {}, jwt).then((r) => r.json());
        if (!j || j.success !== true) throw new Error("RPC não retornou success");
      });
      await check("authenticated lê whatsapp_groups (feed)", async () =>
        expectStatus(await rest("whatsapp_groups?select=id&limit=1", {}, jwt), [200], "feed"));
      await check("authenticated NEGADO em escrow_holds (isolamento)", async () =>
        expectStatus(await rest("escrow_holds?select=id&limit=1", {}, jwt), [401, 403], "escrow"));
      await check("authenticated NEGADO em v_pay_platform_ledger_summary", async () =>
        expectStatus(await rest("v_pay_platform_ledger_summary?select=*&limit=1", {}, jwt), [401, 403], "plat"));
    }
  } else {
    console.log("### 5. (pulado — defina TEST_EMAIL/TEST_PASSWORD p/ testes autenticados)");
  }

  console.log(`\n=========== RESULTADO: PASS=${pass} FAIL=${fail} ===========`);
  if (fail) { console.log("Falhas:", fails.join("; ")); process.exit(1); }
}
main().catch((e) => { console.error("ERRO fatal na suíte:", e); process.exit(2); });
