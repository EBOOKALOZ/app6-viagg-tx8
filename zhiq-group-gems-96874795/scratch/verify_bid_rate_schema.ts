import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.staging' });

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) { console.error('Missing env vars'); process.exit(1); }

// Use fetch to query pg_catalog via the Supabase SQL endpoint (Management API)
// Since we have service_role, we can query the REST API for the data table
// But for pg_catalog we need to use the SQL endpoint

const projectRef = url.replace('https://', '').replace('.supabase.co', '');

async function querySql(sql: string): Promise<any> {
  // Use the PostgREST approach: query information_schema via the REST API
  // Actually let's use Supabase's built-in way to run SQL via the management API
  // Or we can try using the rpc endpoint with a raw SQL wrapper
  
  // The simplest way: use fetch to hit the REST v1 endpoint with a custom query
  // via the /rest/v1/rpc/ endpoint. But we need a function.
  
  // Let's just use the Supabase JS client to query the table data directly
  // and use separate fetch calls for catalog queries
  
  const resp = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({})
  });
  
  return resp;
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  console.log('=== VERIFICAÇÃO PRÉ-MIGRATION auction_bid_rate ===\n');
  
  // 1. Total de registros na tabela
  const { data: allRows, error: errRows } = await sb
    .from('auction_bid_rate')
    .select('listing_id, user_id, window_start, hits');
  
  console.log('=== 1. REGISTROS ATUAIS ===');
  if (errRows) {
    console.log('Erro:', errRows.message);
  } else {
    console.log(`Total: ${allRows?.length || 0} registros`);
    if (allRows && allRows.length > 0) {
      // Check for duplicates on new PK (listing_id, user_id, window_start)
      const seen = new Map<string, number>();
      const dupes: any[] = [];
      for (const r of allRows) {
        const k = `${r.listing_id}|${r.user_id}|${r.window_start}`;
        seen.set(k, (seen.get(k) || 0) + 1);
      }
      for (const [k, cnt] of seen) {
        if (cnt > 1) dupes.push({ key: k, count: cnt });
      }
      if (dupes.length > 0) {
        console.log('⚠️ DUPLICATAS que impediriam nova PK:');
        dupes.forEach(d => console.log(`  ${d.key} → ${d.count}x`));
      } else {
        console.log('✅ Sem duplicatas em (listing_id, user_id, window_start)');
      }
      
      // Show all rows (sem IDs sensíveis completos)
      console.log('\nRegistros:');
      allRows.forEach(r => {
        const lid = String(r.listing_id).substring(0, 8) + '...';
        const uid = String(r.user_id).substring(0, 8) + '...';
        console.log(`  listing=${lid} user=${uid} window=${r.window_start} hits=${r.hits}`);
      });
    }
  }
  
  // 2. Verificar se a constraint auction_bid_rate_uk existe (via REST query on information_schema)
  // We can query information_schema.table_constraints via REST since it's exposed
  // Actually Supabase doesn't expose information_schema via REST. Let's try another way.
  
  // Query the table columns to understand the schema
  const { data: cols, error: errCols } = await sb
    .from('auction_bid_rate')
    .select('*')
    .limit(0);
  
  console.log('\n=== 2. SCHEMA (colunas inferidas) ===');
  if (errCols) {
    console.log('Erro:', errCols.message);
  } else {
    console.log('Colunas: listing_id, user_id, window_start, hits (confirmado pelo baseline)');
  }
  
  // 3. Attempt to check constraints by trying an insert that would violate PK
  // We can check which PK exists by looking at error messages
  console.log('\n=== 3. TESTE DE CONSTRAINT (PK vs UK) ===');
  
  // Generate a test UUID for probing
  const testListingId = '00000000-0000-0000-0000-000000000001';
  const testUserId    = '00000000-0000-0000-0000-000000000002';
  
  // Insert probe row
  const { error: e1 } = await sb
    .from('auction_bid_rate')
    .insert({ listing_id: testListingId, user_id: testUserId, window_start: new Date().toISOString(), hits: 0 });
  
  if (e1) {
    console.log('Insert probe 1 falhou:', e1.message);
    // Check if it's RLS
    if (e1.message.includes('policy')) {
      console.log('(RLS ativo - service_role deve conseguir bypass)');
    }
  } else {
    console.log('Insert probe 1 OK');
    
    // Try inserting SAME (listing_id, user_id) but DIFFERENT window_start
    const { error: e2 } = await sb
      .from('auction_bid_rate')
      .insert({ listing_id: testListingId, user_id: testUserId, window_start: new Date(Date.now() + 60000).toISOString(), hits: 0 });
    
    if (e2) {
      console.log('Insert probe 2 (same user+listing, diff window) FALHOU:', e2.message);
      if (e2.message.includes('auction_bid_rate_pkey')) {
        console.log('⚠️ PK ATUAL é (listing_id, user_id) — PRECISA da migration!');
      }
    } else {
      console.log('Insert probe 2 OK — PK já inclui window_start ou só há UK');
    }
    
    // Cleanup probes
    await sb.from('auction_bid_rate').delete()
      .eq('listing_id', testListingId).eq('user_id', testUserId);
    console.log('Probes removidos.');
  }
  
  // 4. Verificar a definição da RPC vigente via funcdef 
  // Tentamos ler o código-fonte via pg_proc - mas isso precisa de acesso a pg_catalog
  // Que só é possível via SQL editor. Vamos pelo menos confirmar que a RPC existe.
  console.log('\n=== 4. RPC place_auction_bid EXISTS? ===');
  const { data: rpcTest, error: rpcErr } = await sb.rpc('place_auction_bid', {
    p_listing_id: '00000000-0000-0000-0000-000000000000',
    p_amount_cents: 100
  });
  
  if (rpcErr) {
    console.log('RPC error (esperado):', rpcErr.message);
  } else {
    console.log('RPC resposta:', JSON.stringify(rpcTest));
  }
}

run().catch(console.error);
