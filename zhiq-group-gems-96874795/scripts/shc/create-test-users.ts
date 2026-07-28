import { supabaseAdmin } from './supabase-admin.js';

async function createTestUsers() {
  console.log('👥 Criando usuários de teste...');
  const users = [
    { email: 'lojista1@shc.viagg.com', password: 'Password123!', role: 'merchant' },
    { email: 'comprador1@shc.viagg.com', password: 'Password123!', role: 'buyer' },
    { email: 'comprador2@shc.viagg.com', password: 'Password123!', role: 'buyer' },
  ];

  for (const u of users) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { role: u.role, is_shc_test: true }
    });
    if (error) console.error(`Erro ao criar ${u.email}:`, error.message);
    else console.log(`Criado: ${data.user.email} (${u.role})`);
  }
}

createTestUsers().catch(console.error);
