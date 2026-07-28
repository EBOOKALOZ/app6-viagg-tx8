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
    merchant_id: merchant.id,
    start_price: 100000, // R$ 1000.00
    current_price: 100000,
    min_increment: 5000, // R$ 50.00
    status: 'active',
    ends_at: tomorrow.toISOString()
  });

  if (error) console.error('Erro ao criar leilão:', error.message);
  else console.log('Leilão ativo criado com sucesso.');
}

createTestAuctions().catch(console.error);
