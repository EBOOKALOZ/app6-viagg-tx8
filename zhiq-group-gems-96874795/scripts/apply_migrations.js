const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('pg');

// Configurações do Supabase
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://broifhfqmnzqoongtokm.supabase.co';
const DB_HOST = 'broifhfqmnzqoongtokm.supabase.co';
const DB_PORT = 6543;
const DB_NAME = 'postgres';
const DB_USER = 'postgres';

// Caminho para a pasta de migrations
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

// Interface para o prompt
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('🔧 Supabase Migrations Applier\n');
  console.log(`URL: ${SUPABASE_URL}`);
  console.log(`Host: ${DB_HOST}:${DB_PORT}\n`);

  // 1. Pedir a senha do banco
  const password = await askQuestion('Digite a senha do banco PostgreSQL (Settings → Database → Password): ');
  
  if (!password) {
    console.error('❌ Senha é obrigatória.');
    rl.close();
    process.exit(1);
  }

  // 2. Listar arquivos .sql
  let files;
  try {
    files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b)); // Ordem alfabética (cronológica)
  } catch (err) {
    console.error(`❌ Erro ao ler diretório ${MIGRATIONS_DIR}:`, err.message);
    rl.close();
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('❌ Nenhum arquivo .sql encontrado em', MIGRATIONS_DIR);
    rl.close();
    process.exit(1);
  }

  console.log(`📁 Encontradas ${files.length} migrations:`);
  files.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
  console.log('');

  // 3. Conectar ao banco
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: password,
    ssl: { rejectUnauthorized: false } // Supabase requer SSL
  });

  try {
    console.log('🔌 Conectando ao banco...');
    await client.connect();
    console.log('✅ Conectado com sucesso!\n');
  } catch (err) {
    console.error('❌ Erro ao conectar ao banco:', err.message);
    console.error('\nVerifique:');
    console.error('  - A senha está correta (Settings → Database → Password)');
    console.error('  - O banco está acessível na porta 6543');
    console.error('  - Firewall/network permite a conexão\n');
    rl.close();
    process.exit(1);
  }

  // 4. Executar cada migration
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    console.log(`📄 Executando: ${file}`);

    let sql;
    try {
      sql = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.error(`   ❌ Erro ao ler arquivo: ${err.message}`);
      failCount++;
      continue;
    }

    // Dividir em statements individuais
    // Cuidado: não dividir dentro de blocos $$...$$ ou '...' ou "..." 
    // Vamos usar uma abordagem simples: dividir por ; que não esteja dentro de $$
    const statements = [];
    let current = '';
    let inDollarQuote = false;
    let dollarQuoteTag = '';
    
    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const nextChar = sql[i + 1] || '';
      const twoAhead = sql[i + 2] || '';
      const threeAhead = sql[i + 3] || '';

      // Detectar início de dollar quote: $tag$ ou $$ 
      if (!inDollarQuote && char === '$' && (nextChar === '$' || /[a-zA-Z_]/.test(nextChar))) {
        // Ver se é $tag$
        if (nextChar === '$') {
          inDollarQuote = true;
          dollarQuoteTag = '$$';
          current += char;
          continue;
        } else {
          // $tag$ - ler tag
          let tag = '$' + nextChar;
          i++;
          while (i < sql.length - 2) {
            i++;
            const c = sql[i];
            const n = sql[i + 1];
            const nn = sql[i + 2];
            tag += c;
            if (c === '$' && n === '$') {
              i++; tag += '$'; break;
            }
          }
          inDollarQuote = true;
          dollarQuoteTag = tag;
          current += tag;
          continue;
        }
      }

      // Detectar fim de dollar quote
      if (inDollarQuote && char === '$' && nextChar === '$') {
        inDollarQuote = false;
        dollarQuoteTag = '';
        current += '$$';
        i++; // skip next $
        continue;
      }
      
      // Se está dentro de dollar quote, só adiciona
      if (inDollarQuote) {
        current += char;
        continue;
      }

      // Se encontrou ; fora de dollar quote, separa
      if (char === ';') {
        statements.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Adiciona último se houver
    if (current.trim()) {
      statements.push(current.trim());
    }

    // Executar cada statement
    let fileSuccess = true;
    for (const stmt of statements) {
      if (!stmt) continue;
      try {
        await client.query(stmt);
      } catch (err) {
        console.error(`   ❌ Erro no statement: ${stmt.substring(0, 80)}...`);
        console.error(`      Mensagem: ${err.message}`);
        fileSuccess = false;
        break;
      }
    }

    if (fileSuccess) {
      console.log(`   ✅ Aplicada com sucesso`);
      successCount++;
    } else {
      console.log(`   ❌ Falha na migration`);
      failCount++;
    }
  }

  // 5. Resumo
  console.log('\n' + '='.repeat(50));
  console.log('📊 Resumo:');
  console.log(`   ✅ Sucesso: ${successCount}`);
  console.log(`   ❌ Falhas:  ${failCount}`);
  console.log('='.repeat(50));

  // Fechar conexão
  await client.end();
  rl.close();

  // Código de saída
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Erro inesperado:', err);
  rl.close();
  process.exit(1);
});
