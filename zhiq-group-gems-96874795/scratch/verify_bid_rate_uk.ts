import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.staging' });

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  // Probe: tentar inserir com (listing_id, user_id) iguais E window_start igual
  // para verificar se a UK (listing_id, user_id, window_start) existe
  const testListingId = '00000000-0000-0000-0000-000000000001';
  const testUserId    = '00000000-0000-0000-0000-000000000002';
  const ts = new Date().toISOString();

  console.log('=== PROBE: UK (listing_id, user_id, window_start) EXISTS? ===');
  
  // Insert first row
  const { error: e1 } = await sb
    .from('auction_bid_rate')
    .insert({ listing_id: testListingId, user_id: testUserId, window_start: ts, hits: 0 });
  
  if (e1) {
    console.log('Insert 1 falhou:', e1.message);
    return;
  }
  
  // Try to insert duplicate with SAME (listing_id, user_id, window_start)
  const { error: e2 } = await sb
    .from('auction_bid_rate')
    .insert({ listing_id: testListingId, user_id: testUserId, window_start: ts, hits: 0 });
  
  if (e2) {
    console.log('Insert 2 (mesmo tripla) FALHOU:', e2.message);
    if (e2.message.includes('auction_bid_rate_uk')) {
      console.log('✅ UK auction_bid_rate_uk EXISTE no staging');
    } else if (e2.message.includes('auction_bid_rate_pkey')) {
      console.log('UK auction_bid_rate_uk NÃO EXISTE (violação é do pkey)');
    }
  } else {
    console.log('Insert 2 OK — UK NÃO EXISTE');
  }
  
  // Cleanup
  await sb.from('auction_bid_rate').delete()
    .eq('listing_id', testListingId).eq('user_id', testUserId);
  console.log('Probes removidos.');
  
  // === VERIFICAÇÃO DA RPC VIGENTE ===
  // A RPC 20260728 usa ON CONFLICT (listing_id, user_id, window_start) 
  // A RPC 20260723 (enterprise v3) usa SELECT ... FOR UPDATE sem ON CONFLICT
  // Precisamos saber qual está vigente.
  // A 20260728 é posterior, então deve sobrescrever a 20260723.
  // Mas a 20260723 enterprise_security_bidengine_oficial é o nome do arquivo.
  // Vamos verificar comparando timestamps dos arquivos na pasta de migrations.
  
  console.log('\n=== ANÁLISE DE VERSÃO DA RPC ===');
  console.log('20260723_auction_enterprise_security_bidengine_oficial.sql → v3 (SELECT/UPDATE sem ON CONFLICT)');
  console.log('20260728040000_auction_bidengine_security_hardening.sql → v4 (ON CONFLICT (listing_id, user_id, window_start))');
  console.log('A migration mais recente (20260728) sobrescreve via CREATE OR REPLACE.');
  
  // Verify which version is in staging by checking the behavior:
  // v3 (enterprise) does SELECT ... FOR UPDATE then INSERT or UPDATE
  // v4 (hardening) uses INSERT ... ON CONFLICT (listing_id, user_id, window_start)
  // 
  // v3 does NOT need the UNIQUE constraint on (listing_id, user_id, window_start) for INSERT
  //    because it uses SELECT+UPDATE pattern, but it DOES need unique on (listing_id, user_id)
  //    since it does WHERE listing_id = ... AND user_id = ...
  //
  // v4 DOES need the UNIQUE constraint on (listing_id, user_id, window_start) for ON CONFLICT
  //    but the PK is (listing_id, user_id) which means ON CONFLICT (listing_id, user_id, window_start)
  //    needs the UK that was added by the same migration.
  
  console.log('\n=== ANÁLISE DE CONFLITO ===');
  console.log('PK atual:  (listing_id, user_id)');
  console.log('UK adicionada (20260728): (listing_id, user_id, window_start)');
  console.log('');
  console.log('Problema: A v4 (hardening) usa ON CONFLICT (listing_id, user_id, window_start).');
  console.log('          Mas O PK (listing_id, user_id) impede INSERT de 2 rows para');
  console.log('          o mesmo user+listing com window_start diferente.');
  console.log('          → Primeira inserção OK, segunda falha com PK violation');
  console.log('            ANTES de chegar ao ON CONFLICT da UK.');
  console.log('');
  console.log('Porém, a v3 (enterprise) usa SELECT...FOR UPDATE e depois INSERT/UPDATE,');
  console.log('sem ON CONFLICT. Se v3 é a vigente no staging, ela faz UPDATE no registro');
  console.log('existente (PK=listing_id,user_id) e funciona para rate limiting.');
  console.log('MAS: Se o rate limit reiniciar janela, ela faz UPDATE SET window_start=now()');
  console.log('     no registro existente, e não insere novo. Isso funciona com PK(listing,user).');
}

run().catch(console.error);
