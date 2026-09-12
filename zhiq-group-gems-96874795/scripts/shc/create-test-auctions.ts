import { supabaseAdmin } from './supabase-admin.js';

async function createTestAuctions() {
  console.log('🔨 Criando leilões ativos de homologação...');
  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const merchant = users.users.find(u => u.email === 'lojista1@shc.viagg.com');

  if (!merchant) throw new Error('Lojista não encontrado.');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { error } = await supabaseAdmin.from('auction_listings').insert({
    title: '[SHC] TV OLED 55 4K - Homologação',
    description: 'Leilão gerado automaticamente para testes do SHC.',
    owner_user_id: merchant.id,
    starting_bid: 100000, // R$ 1000.00
    current_bid: 100000,
    minimum_increment: 5000, // R$ 50.00
    status: 'active',
    starts_at: new Date().toISOString(),
    ends_at: tomorrow.toISOString()
  });

  if (error) console.error('Erro ao criar leilão:', error.message);
  else console.log('Leilão ativo criado com sucesso.');
}

createTestAuctions().catch(console.error);
