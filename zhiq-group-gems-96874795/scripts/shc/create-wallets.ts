import { supabaseAdmin } from './supabase-admin.js';

async function createWallets() {
  console.log('💰 Provisionando carteiras financeiras...');
  // Pega usuários SHC
  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const shcUsers = users.users.filter(u => u.email?.endsWith('@shc.viagg.com'));

  for (const user of shcUsers) {
    const balance = user.email?.includes('comprador') ? 50000 : 0; // 500.00 (em centavos) para compradores
    const { error } = await supabaseAdmin.from('financial_wallets').upsert({
      user_id: user.id,
      balance_cents: balance,
      currency: 'BRL',
      status: 'active'
    });
    if (error) console.error(`Erro ao criar carteira para ${user.email}:`, error.message);
    else console.log(`Carteira provisionada para ${user.email} (Saldo: ${balance})`);
  }
}

createWallets().catch(console.error);
