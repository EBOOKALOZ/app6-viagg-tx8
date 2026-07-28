import { supabaseAdmin } from './supabase-admin.js';
import { execSync } from 'child_process';

async function seedStaging() {
  console.log('🌱 Iniciando Seed Completo do SHC (Staging)...');
  
  // Orquestra a ordem de dependências
  execSync('npx tsx scripts/shc/cleanup-staging.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/shc/create-test-users.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/shc/create-wallets.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/shc/create-test-auctions.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/shc/create-test-bids.ts', { stdio: 'inherit' });

  console.log('✅ Seed de Homologação Finalizado com Sucesso.');
}

seedStaging().catch(console.error);
