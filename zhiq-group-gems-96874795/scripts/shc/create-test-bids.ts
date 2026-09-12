import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase-admin.js';

async function createTestBids() {
  console.log('📈 Inserindo lances iniciais (Warmup)...');
  // Pega o leilão
  const { data: auctions } = await supabaseAdmin.from('auction_listings').select('id, current_bid, minimum_increment').like('title', '%[SHC]%').limit(1);
  if (!auctions || auctions.length === 0) return console.log('Nenhum leilão SHC encontrado.');
  
  const auction = auctions[0];
  
  // Instancia client público para sessão
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ AVISO: VITE_SUPABASE_ANON_KEY ausente. Warmup de lances abortado.');
    return;
  }
  
  const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);
  
  const testPassword = process.env.TEST_USER_PASSWORD;
  
  if (!testPassword) {
    console.warn('⚠️ AVISO: Senha de teste (TEST_USER_PASSWORD) não fornecida. Warmup de lances abortado.');
    return;
  }
  
  // Autentica o comprador (usando comprador2 para validar novo ciclo)
  const { data: authData, error: authError } = await supabaseAuthClient.auth.signInWithPassword({
    email: 'comprador2@shc.viagg.com',
    password: testPassword
  });

  if (authError || !authData.session) {
    console.warn('⚠️ AVISO: Falha ao autenticar comprador de teste. O warmup de lances depende de autenticação real e foi desabilitado.', authError?.message);
    return;
  }

  const nextBidCents = (Number(auction.current_bid) + Number(auction.minimum_increment)) * 100;
  
  // Utiliza a RPC autenticada via sessão pública
  console.log(`Enviando primeiro lance...`);
  const res1 = await supabaseAuthClient.rpc('place_auction_bid', {
    p_listing_id: auction.id,
    p_amount_cents: nextBidCents
  });

  if (res1.error || (res1.data && res1.data.success === false)) {
    console.error('Erro no lance 1:', res1.error?.message || res1.data?.error || 'Erro desconhecido');
  } else {
    console.log(`✅ Lance 1 inserido (Valor Cents: ${nextBidCents}) - Rate limit table deve ter criado row`);
  }

  // Envia segundo lance IMEDIATAMENTE (mesma janela)
  console.log(`Enviando segundo lance para testar atualização de hits...`);
  const res2 = await supabaseAuthClient.rpc('place_auction_bid', {
    p_listing_id: auction.id,
    p_amount_cents: nextBidCents + auction.minimum_increment * 100
  });

  if (res2.error || (res2.data && res2.data.success === false)) {
    console.error('Erro no lance 2:', res2.error?.message || res2.data?.error || 'Erro desconhecido');
  } else {
    console.log(`✅ Lance 2 inserido (Valor Cents: ${nextBidCents + auction.minimum_increment * 100}) - Rate limit hits atualizado para 2`);
  }
}

createTestBids().catch(console.error);
