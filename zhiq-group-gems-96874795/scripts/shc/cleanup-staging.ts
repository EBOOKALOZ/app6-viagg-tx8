import { supabaseAdmin } from './supabase-admin.js';

async function cleanupStaging() {
  console.log('🧹 Limpando dados exclusivos do SHC...');
  // Apenas deleta dados com tag 'shc-test' ou emails específicos
  const { error } = await supabaseAdmin.from('profiles')
    .delete()
    .like('email', '%@shc.viagg.com');
    
  if (error) console.error('Erro no cleanup:', error.message);
  else console.log('✅ Cleanup de testes concluído.');
}

cleanupStaging().catch(console.error);
