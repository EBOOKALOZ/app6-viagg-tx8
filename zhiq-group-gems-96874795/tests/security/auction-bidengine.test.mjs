#!/usr/bin/env node
/**
 * Teste funcional real do motor de lances (place_auction_bid), via REST,
 * sem simulação local — mesmo padrão de tests/security/rls-permissions.test.mjs.
 *
 * Cobre os 3 cenários exigidos pela homologação P0-4 (2026-07-28):
 *   1. Lance válido (>= mínimo da grade) é aceito.
 *   2. Lance abaixo do mínimo permitido é rejeitado (code=below_min).
 *   3. Self-bid (dono do leilão dando lance no próprio leilão) é rejeitado
 *      (code=self_bid) — a checagem foi adicionada em
 *      20260728040000_auction_bidengine_security_hardening.sql.
 *
 * Uso:
 *   TEST_EMAIL=... TEST_PASSWORD=... node tests/security/auction-bidengine.test.mjs
 *   # cenário 3 (self-bid) só roda se TEST_OWNER_EMAIL/TEST_OWNER_PASSWORD
 *   # também estiverem definidos, apontando para o dono de um leilão ativo.
 *
 * Sai com código 0 se tudo passar; 1 se algo falhar; 2 se faltarem credenciais
 * (nunca imprime PASS sem ter executado a chamada real).
 */
const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const OWNER_EMAIL = process.env.TEST_OWNER_EMAIL;
const OWNER_PASSWORD = process.env.TEST_OWNER_PASSWORD;

if (!URL || !ANON || !TEST_EMAIL || !TEST_PASSWORD) {
  console.error(
    "PENDENTE DE EVIDÊNCIA: requer SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD no ambiente. " +
    "Nenhuma chamada foi feita nesta execução."
  );
  process.exit(2);
}

let pass = 0, fail = 0;
const fails = [];
async function check(label, fn) {
  try { await fn(); pass++; console.log(`  PASS  ${label}`); }
  catch (e) { fail++; fails.push(label); console.log(`  FAIL  ${label} -> ${e.message}`); }
}

async function login(email, password) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login falhou: ${res.status}`);
  return (await res.json()).access_token;
}

async function findActiveListing(jwt, excludeOwner) {
  const res = await fetch(
    `${URL}/rest/v1/auction_listings?status=eq.active&select=id,owner_user_id,current_bid,starting_bid,minimum_increment&limit=10`,
    { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } }
  );
  const rows = await res.json();
  const usable = excludeOwner ? rows.filter((r) => r.owner_user_id !== excludeOwner) : rows;
  if (!usable.length) throw new Error("nenhum leilão ativo disponível para o teste");
  return usable[0];
}

async function placeBid(jwt, listingId, amountCents) {
  const res = await fetch(`${URL}/rest/v1/rpc/place_auction_bid`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_listing_id: listingId, p_amount_cents: amountCents }),
  });
  return res.json();
}

async function main() {
  console.log("Motor de lances — teste funcional real (place_auction_bid)\n");

  const jwt = await login(TEST_EMAIL, TEST_PASSWORD);
  const listing = await findActiveListing(jwt);
  const currentCents = Math.round(Number(listing.current_bid || listing.starting_bid) * 100);
  const incCents = Math.round(Number(listing.minimum_increment) * 100) || 100;

  await check("lance válido (mínimo da grade) é aceito", async () => {
    const r = await placeBid(jwt, listing.id, currentCents + incCents);
    if (r.success !== true) throw new Error(`esperado success=true, obtido ${JSON.stringify(r)}`);
  });

  await check("lance abaixo do mínimo é rejeitado (below_min)", async () => {
    const r = await placeBid(jwt, listing.id, currentCents + 1);
    if (r.success !== false || (r.code !== "below_min" && r.code !== "off_grid")) {
      throw new Error(`esperado rejeição below_min/off_grid, obtido ${JSON.stringify(r)}`);
    }
  });

  if (OWNER_EMAIL && OWNER_PASSWORD) {
    await check("self-bid (dono no próprio leilão) é rejeitado (self_bid)", async () => {
      const ownerJwt = await login(OWNER_EMAIL, OWNER_PASSWORD);
      const ownListing = await findActiveListing(ownerJwt);
      const r = await placeBid(ownerJwt, ownListing.id, Math.round(Number(ownListing.current_bid || ownListing.starting_bid) * 100) + Math.round(Number(ownListing.minimum_increment) * 100));
      if (r.success !== false || r.code !== "self_bid") {
        throw new Error(`esperado rejeição self_bid, obtido ${JSON.stringify(r)}`);
      }
    });
  } else {
    console.log("  SKIP  self-bid (requer TEST_OWNER_EMAIL/TEST_OWNER_PASSWORD — dono de um leilão ativo)");
  }

  console.log(`\n${pass} passaram, ${fail} falharam.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Erro ao executar teste:", e.message);
  process.exit(1);
});
