#!/usr/bin/env node
/**
 * Teste real de concorrência do motor de lances (place_auction_bid).
 *
 * Dispara N lances SIMULTÂNEOS (Promise.all, sem await sequencial) contra a
 * mesma RPC/listing via REST, para provar que o `SELECT ... FOR UPDATE` do
 * listing serializa corretamente: no máximo 1 lance de um dado valor deve
 * ser aceito quando múltiplos concorrem pelo mesmo próximo valor mínimo da
 * grade; nenhum outro deve resultar em estado inconsistente (2 vencedores).
 *
 * Não simula nada localmente — cada chamada é uma requisição HTTP real ao
 * PostgREST/RPC do Supabase.
 *
 * Uso:
 *   TEST_EMAIL=... TEST_PASSWORD=... AUCTION_LISTING_ID=<uuid de um leilão ativo>
 *     node tests/performance/auction-concurrency.mjs
 *
 * Sai com código 2 (sem rodar nada) se as credenciais não estiverem no
 * ambiente — nunca imprime PASSED sem ter executado uma chamada real.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(__dirname, "..", "..", "src", "integrations", "supabase", "client.ts");

let CLIENT_SRC = "";
try { CLIENT_SRC = readFileSync(CLIENT, "utf8"); } catch { /* usa env */ }
const URL = process.env.SUPABASE_URL || (CLIENT_SRC.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
const ANON = process.env.SUPABASE_ANON_KEY || (CLIENT_SRC.match(/(eyJ[A-Za-z0-9_.-]{60,})/) || [])[1];
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const LISTING_ID = process.env.AUCTION_LISTING_ID;
const CONCURRENCY = Number(process.env.CONCURRENCY || 10);

if (!URL || !ANON) {
  console.error("FALHA: não achei URL/anon key (env SUPABASE_URL/SUPABASE_ANON_KEY ou client.ts).");
  process.exit(2);
}
if (!TEST_EMAIL || !TEST_PASSWORD || !LISTING_ID) {
  console.error(
    "PENDENTE DE EVIDÊNCIA: este teste requer TEST_EMAIL, TEST_PASSWORD e AUCTION_LISTING_ID " +
    "(um leilão com status='active') no ambiente. Nenhuma chamada foi feita — não fabricar PASSED sem execução real."
  );
  process.exit(2);
}

async function login() {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login falhou: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

async function getListing(jwt) {
  const res = await fetch(`${URL}/rest/v1/auction_listings?id=eq.${LISTING_ID}&select=id,current_bid,starting_bid,minimum_increment,status`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`fetch listing falhou: ${res.status} ${await res.text()}`);
  const [listing] = await res.json();
  if (!listing) throw new Error(`listing ${LISTING_ID} não encontrado`);
  return listing;
}

async function placeBid(jwt, amountCents) {
  const res = await fetch(`${URL}/rest/v1/rpc/place_auction_bid`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_listing_id: LISTING_ID, p_amount_cents: amountCents }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function run() {
  console.log(`Autenticando ${TEST_EMAIL}...`);
  const jwt = await login();

  const listing = await getListing(jwt);
  if (listing.status !== "active") {
    console.error(`FALHA: listing ${LISTING_ID} não está ativo (status=${listing.status})`);
    process.exit(1);
  }

  const currentCents = Math.round(Number(listing.current_bid || listing.starting_bid) * 100);
  const incCents = Math.round(Number(listing.minimum_increment) * 100) || 100;
  const targetAmount = currentCents + incCents;

  console.log(`Disparando ${CONCURRENCY} lances SIMULTÂNEOS de ${targetAmount} centavos (mesmo valor, mesma corrida) contra listing ${LISTING_ID}...`);

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => placeBid(jwt, targetAmount))
  );

  const accepted = results.filter((r) => r.body?.success === true);
  const rejected = results.filter((r) => r.body?.success === false);

  console.log(`Aceitos: ${accepted.length} | Rejeitados: ${rejected.length}`);
  rejected.forEach((r, i) => console.log(`  rejeitado[${i}]: ${r.body?.code || r.body?.error}`));

  // Com o mesmo amount_cents disputado por N chamadas concorrentes, o
  // FOR UPDATE do listing deve serializar: só a primeira a processar pode
  // ver esse valor como >= next_min; as demais, após a primeira committar,
  // devem ver current_bid já maior e cair em 'below_min' ou 'off_grid'.
  if (accepted.length === 1 && rejected.length === CONCURRENCY - 1) {
    console.log("Concurrency test PASSED. Exatamente 1 lance aceito na corrida; os demais rejeitados por regra de negócio pós-serialização.");
    process.exit(0);
  } else if (accepted.length === 0) {
    console.error("Concurrency test FAILED: nenhum lance foi aceito — verifique se o listing tem lances anteriores ou se o valor alvo já está desatualizado.");
    process.exit(1);
  } else {
    console.error(`Concurrency test FAILED: esperado 1 aceito, obtido ${accepted.length} — possível corrida não serializada (2 vencedores).`);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("Erro ao executar teste de concorrência:", e.message);
  process.exit(1);
});
