import { supabaseAdmin } from './supabase-admin.js';

type TestUser = {
  email: string;
  password: string;
  role: 'merchant' | 'buyer';
};

async function createTestUsers() {
  console.log('👥 Criando usuários de teste...');

  const users: TestUser[] = [
    {
      email: 'lojista1@shc.viagg.com',
      password: 'Password123!',
      role: 'merchant'
    },
    {
      email: 'comprador1@shc.viagg.com',
      password: 'Password123!',
      role: 'buyer'
    },
    {
      email: 'comprador2@shc.viagg.com',
      password: 'Password123!',
      role: 'buyer'
    }
  ];

  const { data: existingUsers, error: listError } =
    await supabaseAdmin.auth.admin.listUsers();

  if (listError) {
    console.error(
      '❌ Erro ao listar usuários existentes:',
      JSON.stringify(
        listError,
        Object.getOwnPropertyNames(listError),
        2
      )
    );

    throw new Error('Não foi possível verificar os usuários existentes.');
  }

  const existingEmails = new Set(
    (existingUsers?.users ?? [])
      .map((user) => user.email?.toLowerCase())
      .filter(Boolean)
  );

  for (const user of users) {
    const normalizedEmail = user.email.toLowerCase();

    if (existingEmails.has(normalizedEmail)) {
      console.log(`ℹ️ Usuário já existe: ${user.email}`);
      continue;
    }

    const { data, error } =
      await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          role: user.role,
          is_shc_test: true
        }
      });

    if (error) {
      console.error(
        `❌ Erro ao criar ${user.email}:`,
        JSON.stringify(
          error,
          Object.getOwnPropertyNames(error),
          2
        )
      );

      throw new Error(
        `Falha ao criar usuário de teste: ${user.email}`
      );
    }

    if (!data?.user) {
      throw new Error(
        `O Supabase não retornou o usuário criado: ${user.email}`
      );
    }

    console.log(
      `✅ Criado: ${data.user.email} (${user.role})`
    );
  }

  console.log('✅ Usuários de teste verificados com sucesso.');
}

createTestUsers()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error(
      '❌ Seed de usuários interrompido:',
      error instanceof Error
        ? error.stack
        : JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    );

    process.exitCode = 1;
  });