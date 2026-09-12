import { supabaseAdmin } from './supabase-admin.js';

async function createWallets() {
  console.log('💰 Provisionando carteiras financeiras...');
  console.warn('⚠️ AVISO: A etapa de carteiras foi desabilitada, pois a tabela financial_wallets não existe no schema atual e a carteira não é estritamente necessária para o teste de carga básico.');
  return;
}

createWallets().catch(console.error);
