import { supabaseAdmin } from './supabase-admin.js';

async function resetStaging() {
  console.log('⚠️ RESET TOTAL do Staging (DANGER ZONE) ⚠️');
  // Usaremos RPCs de hard delete se existirem, ou limpar table por table.
  const tables = ['auction_bids', 'auction_listings', 'financial_wallets', 'profiles'];
  for (const table of tables) {
    console.log(`Limpando tabela ${table}...`);
    const { error } = await supabaseAdmin.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) console.error(`Erro ao limpar ${table}:`, error.message);
  }
  console.log('✅ Banco Staging resetado.');
}

resetStaging().catch(console.error);
