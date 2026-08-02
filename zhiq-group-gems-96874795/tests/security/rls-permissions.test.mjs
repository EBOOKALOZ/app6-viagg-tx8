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
  // Débito de 2% por interessado (AI-75.3, 2026-07-21): PII + carteiras
  "advertiser_contact_intentions", "orion_marketplace_contact_charges",
  "orion_contact_reveal_log", "wallets", "wallet_transactions",
  // VIAGENS (2026-07-23): carteiras/ledger/compras/contatos/audit anon-NEGADOS
  "travel_credit_balances", "travel_credit_ledger", "travel_credit_purchases",
  "travel_listing_contacts", "travel_negotiation_messages", "travel_audit_log",
];
const FIN_FUNCTIONS = [
  "admin_wallet_credit", "append_ledger_entry", "pay_settle_delivery", "settle_delivery",
  "credit_merchant_credits", "track_admin_profit_event", "admin_get_auth_emails",
  "admin_apply_financial_adjustment", "release_service_payment_split",
  // Débito de 2% por interessado (AI-75.3): cobrança/PII anon-BLOQUEADAS +
  // Wallet Core legado desativado (deprecated)
  "wallet_unlock_contact", "wallet_reveal_contact", "wallet_unlock_charge_cents",
  "wallet_credit", "wallet_reserve", "wallet_confirm", "wallet_migrate_legacy_balances",
  "unlock_reconcile",
  // VIAGENS (2026-07-23): RPCs de crédito legadas APOSENTADAS (REVOKE de anon) —
  // o vetor de drenagem de créditos por anônimo deve estar fechado. As RPCs
  // admin exigem is_admin() e não podem ser executadas por anon.
  "charge_travel_interest_click", "charge_travel_listing_click",
  "unlock_travel_intention", "feature_travel_listing",
  "admin_moderate_travel_listing", "admin_moderate_travel_media",
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
      // select=* (não select=id): tabelas com PK própria (ex.: owner_user_id)
      // devolveriam 400 "column id does not exist" ANTES do check de ACL,
      // mascarando o resultado real de permissão.
      expectStatus(await rest(`${t}?select=*&limit=1`), [401, 403], t));

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

  console.log("### 4b. VIAGENS — vitrine pública OK, rascunho anon-NEGADO");
  // A vitrine lê apenas 'published' (policy hardening 2026-07-23).
  await check("anon SELECT travel_listings (published) permitido", async () =>
    expectStatus(await rest("travel_listings?select=id&visibility_status=eq.published&limit=1"), [200], "travel_pub"));
  // Rascunhos NÃO podem vazar para anon (policy filtra por status).
  await check("anon NÃO lê rascunhos de travel_listings", async () => {
    const r = await rest("travel_listings?select=id,visibility_status&visibility_status=eq.draft&limit=1");
    if (r.status !== 200) return; // 401/403 também é aceitável
    const body = await r.json();
    if (Array.isArray(body) && body.length > 0) throw new Error("rascunho vazou para anon!");
  });
  // Telemetria sem débito é pública, mas exige fingerprint (não é vetor financeiro).
  await check("anon travel_track_event exige fingerprint (sem débito)", async () => {
    const r = await rpc("travel_track_event", { p_listing_id: "00000000-0000-0000-0000-000000000000", p_event: "listing_click" });
    // 200 com success:false (fingerprint_required/listing_not_found) OU bloqueio — nunca débito.
    if (![200, 400, 401, 403, 404].includes(r.status)) throw new Error(`status ${r.status}`);
  });

  console.log("### 4c. Comando Convênio — RLS de administração restrita ao Gestor");
  // Tabelas administrativas (sem policy pública de leitura): anon deve ser negado.
  const CONVENIO_ADMIN_TABLES = [
    "convenio_entities", "convenio_agreements", "convenio_agreement_history",
    "convenio_financial_records", "convenio_audit_log", "convenio_messages",
    "convenio_ai_notes", "convenio_settings",
  ];
  for (const t of CONVENIO_ADMIN_TABLES)
    await check(`anon SELECT ${t} negado`, async () =>
      expectStatus(await rest(`${t}?select=*&limit=1`), [401, 403], t));

  // Tabelas com policy pública de transparência (MedPrev): anon deve conseguir ler,
  // mas só o subconjunto liberado pela policy (status confirmada/ativa/publicada).
  await check("anon SELECT convenio_campaigns (ativa/encerrada) permitido", async () =>
    expectStatus(await rest("convenio_campaigns?select=id,status&limit=1"), [200], "convenio_campaigns"));
  await check("anon NÃO lê convenio_campaigns em rascunho/planejada", async () => {
    const r = await rest("convenio_campaigns?select=id,status&status=eq.planejada&limit=1");
    if (r.status !== 200) return;
    const body = await r.json();
    if (Array.isArray(body) && body.length > 0) throw new Error("campanha planejada vazou para anon!");
  });
  await check("anon SELECT convenio_donations (confirmada) permitido", async () =>
    expectStatus(await rest("convenio_donations?select=id,status&limit=1"), [200], "convenio_donations"));
  await check("anon NÃO lê convenio_donations registrada/estornada", async () => {
    const r = await rest("convenio_donations?select=id,status&status=eq.registrada&limit=1");
    if (r.status !== 200) return;
    const body = await r.json();
    if (Array.isArray(body) && body.length > 0) throw new Error("doação não-confirmada vazou para anon!");
  });
  await check("anon SELECT convenio_accountability (publicada) permitido", async () =>
    expectStatus(await rest("convenio_accountability?select=id,status&limit=1"), [200], "convenio_accountability"));
  await check("anon NÃO lê convenio_accountability em rascunho", async () => {
    const r = await rest("convenio_accountability?select=id,status&status=eq.rascunho&limit=1");
    if (r.status !== 200) return;
    const body = await r.json();
    if (Array.isArray(body) && body.length > 0) throw new Error("rascunho de prestação de contas vazou para anon!");
  });

  // View de dashboard é security_invoker — sem RLS de gestor, anon não deve ler.
  await check("anon SELECT convenio_dashboard_stats negado", async () =>
    expectStatus(await rest("convenio_dashboard_stats?select=*&limit=1"), [401, 403], "convenio_dashboard_stats"));

  // RPCs de gestão de acesso são SECURITY DEFINER com gate is_gestor_convenio()
  // interno — anon deve ser barrado mesmo conseguindo *chamar* a função.
  await check("anon RPC convenio_grant_role bloqueada", async () => {
    const r = await rpc("convenio_grant_role", { p_email: "anon-test@example.com" });
    if (![401, 403, 404].includes(r.status)) {
      const body = await r.json().catch(() => null);
      if (r.status === 200 && body && !body.user_id) return; // sem efeito não é falha
      throw new Error(`status ${r.status} (executável!)`);
    }
  });
  await check("anon RPC convenio_list_gestores bloqueada", async () => {
    const r = await rpc("convenio_list_gestores", {});
    if (![401, 403, 404].includes(r.status)) {
      const body = await r.json().catch(() => null);
      if (r.status === 200 && Array.isArray(body) && body.length === 0) return;
      throw new Error(`status ${r.status} (executável!)`);
    }
  });

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
