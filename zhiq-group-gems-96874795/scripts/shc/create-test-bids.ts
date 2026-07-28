import { supabaseAdmin } from './supabase-admin.js';

async function createTestBids() {
  console.log('📈 Inserindo lances iniciais (Warmup)...');
  // Pega o leilão
  const { data: auctions } = await supabaseAdmin.from('auction_listings').select('id, current_price, min_increment').like('title', '%[SHC]%').limit(1);
  if (!auctions || auctions.length === 0) return console.log('Nenhum leilão SHC encontrado.');
  
  const auction = auctions[0];
  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const buyer = users.users.find(u => u.email === 'comprador1@shc.viagg.com');

  if (!buyer) return console.log('Comprador não encontrado.');

  const nextBid = auction.current_price + auction.min_increment;
  
  // Utiliza a RPC para garantir as Triggers de integridade (Não insere via CRUD direto)
  const { error } = await supabaseAdmin.rpc('place_auction_bid', {
    p_auction_id: auction.id,
    p_bid_amount: nextBid,
    p_bidder_id: buyer.id // Requer bypass de auth no Service Role ou mock do context no backend
  });

  if (error) console.error('Erro ao inserir lance via RPC:', error.message);
  else console.log(`Lance inicial inserido via RPC (Valor: ${nextBid})`);
}

createTestBids().catch(console.error);
