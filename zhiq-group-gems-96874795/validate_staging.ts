import fs from 'fs';
import path from 'path';

async function validateEnv() {
  const envPath = path.resolve('.env.staging');
  console.log(`Verificando arquivo: ${envPath}`);
  
  if (!fs.existsSync(envPath)) {
    console.error('ERRO: Arquivo .env.staging não encontrado!');
    process.exit(1);
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const env: Record<string, string> = {};
  content.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2 && !line.startsWith('#')) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      if (key) {
        env[key] = val;
      }
    }
  });

  const mandatoryVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_MERCADOPAGO_PUBLIC_KEY',
    'VITE_SITE_URL'
  ];

  console.log('\n--- VERIFICAÇÃO DE VARIÁVEIS ---');
  let hasMissing = false;
  
  for (const v of mandatoryVars) {
    if (!env[v]) {
      console.log(`[AUSENTE] ${v}`);
      hasMissing = true;
    } else {
      console.log(`[ENCONTRADA] ${v} = ${env[v].substring(0, 15)}...`);
    }
  }

  if (hasMissing) {
    console.error('\nFalha na validação de variáveis.');
  }

  console.log('\n--- VALIDAÇÃO DE CONEXÃO SUPABASE ---');
  const url = env['VITE_SUPABASE_URL'];
  const key = env['VITE_SUPABASE_ANON_KEY'];
  
  if (url && key) {
    try {
      const apiUrl = `${url}/rest/v1/auction_listings?select=id&limit=1`;
      console.log(`Testando conexão (REST): ${apiUrl}`);
      const res = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`
        }
      });
      
      if (res.ok) {
        console.log(`[OK] Conexão com Supabase estabelecida. Status HTTP: ${res.status}`);
      } else {
        console.error(`[INVÁLIDO] Falha na conexão. HTTP ${res.status}: ${res.statusText}`);
        const body = await res.text();
        console.error(body);
      }
    } catch (e: any) {
      console.error(`[ERRO] Falha ao conectar: ${e.message}`);
    }
  }

  console.log('\nFim da pré-validação.');
}

validateEnv();
