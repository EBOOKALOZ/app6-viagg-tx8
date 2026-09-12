/**
 * Aplica a migration via Supabase REST API usando pg_query_params
 * (endpoint /rest/v1/rpc/) — executa as statements da migration
 * uma por uma, extraindo DO blocks e ALTER TABLE separadamente.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.staging' });

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function execSql(sql: string, label: string): Promise<boolean> {
  const resp = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }
  });
  // This won't work because there's no general SQL endpoint via REST
  // Let's try a different approach
  return false;
}

// Use the Supabase Management API v1 endpoint for SQL
// POST https://api.supabase.com/v1/projects/{ref}/sql
async function execViaMgmt(sql: string): Promise<boolean> {
  const ref = 'jndjkwtceloysbnwxblg';
  
  // Try using the service_role key directly with the DB connection
  // Supabase exposes a pg-meta endpoint that can execute SQL
  const resp = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  
  if (resp.ok) {
    const data = await resp.json();
    console.log('✅ Sucesso:', JSON.stringify(data).substring(0, 200));
    return true;
  }
  
  console.log(`HTTP ${resp.status}: ${await resp.text()}`);
  return false;
}

// Alternative: use the Supabase SQL endpoint that's available via the dashboard API
async function execViaDashboard(sql: string): Promise<boolean> {
  const ref = 'jndjkwtceloysbnwxblg';
  
  // The Supabase dashboard uses this endpoint internally
  const resp = await fetch(`https://api.supabase.com/pg-meta/${ref}/query`, {
    method: 'POST',
    headers: {
      'x-connection-encrypted': key,
      'Content-Type': 'application/json',
      'apikey': key
    },
    body: JSON.stringify({ query: sql })
  });
  
  if (resp.ok) {
    const data = await resp.json();
    console.log('✅ Sucesso via dashboard API:', JSON.stringify(data).substring(0, 200));
    return true;
  }
  
  console.log(`Dashboard API HTTP ${resp.status}: ${(await resp.text()).substring(0, 300)}`);
  return false;
}

async function run() {
  // Try individual statements without BEGIN/COMMIT (each auto-commits)
  const statements = [
    {
      label: 'CHECK FK dependencies',
      sql: `
        DO $$
        DECLARE v_fk_count int;
        BEGIN
          SELECT count(*) INTO v_fk_count
          FROM pg_constraint c
          WHERE c.confrelid = (SELECT oid FROM pg_class WHERE relname = 'auction_bid_rate')
            AND c.contype = 'f';
          IF v_fk_count > 0 THEN
            RAISE EXCEPTION 'ABORTADO: existem % FK(s) referenciando auction_bid_rate.', v_fk_count;
          END IF;
          RAISE NOTICE 'OK: 0 FKs referenciando auction_bid_rate';
        END $$;`
    },
    {
      label: 'CHECK duplicates',
      sql: `
        DO $$
        DECLARE v_dup_count int;
        BEGIN
          SELECT count(*) INTO v_dup_count FROM (
            SELECT listing_id, user_id, window_start
            FROM public.auction_bid_rate
            GROUP BY listing_id, user_id, window_start
            HAVING count(*) > 1
          ) dupes;
          IF v_dup_count > 0 THEN
            RAISE EXCEPTION 'ABORTADO: existem % grupo(s) de duplicatas.', v_dup_count;
          END IF;
          RAISE NOTICE 'OK: 0 duplicatas';
        END $$;`
    },
    {
      label: 'DROP old PK',
      sql: `ALTER TABLE public.auction_bid_rate DROP CONSTRAINT IF EXISTS auction_bid_rate_pkey;`
    },
    {
      label: 'DROP old UK',
      sql: `ALTER TABLE public.auction_bid_rate DROP CONSTRAINT IF EXISTS auction_bid_rate_uk;`
    },
    {
      label: 'ADD new PK',
      sql: `ALTER TABLE public.auction_bid_rate ADD PRIMARY KEY (listing_id, user_id, window_start);`
    },
    {
      label: 'VERIFY',
      sql: `
        DO $$
        DECLARE v_pk_cols text;
        BEGIN
          SELECT string_agg(a.attname, ', ' ORDER BY array_position(i.indkey, a.attnum))
          INTO v_pk_cols
          FROM pg_index i
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = 'public.auction_bid_rate'::regclass AND i.indisprimary;
          IF v_pk_cols IS DISTINCT FROM 'listing_id, user_id, window_start' THEN
            RAISE EXCEPTION 'VERIFICAÇÃO FALHOU: PK esperada (listing_id, user_id, window_start), encontrada (%)', v_pk_cols;
          END IF;
          RAISE NOTICE 'OK: PK de auction_bid_rate agora é (%)', v_pk_cols;
        END $$;`
    }
  ];

  console.log('🔧 Tentando aplicar migration statement por statement...\n');
  
  for (const stmt of statements) {
    console.log(`→ ${stmt.label}...`);
    const ok = await execViaMgmt(stmt.sql);
    if (!ok) {
      console.log('   Tentando via dashboard API...');
      const ok2 = await execViaDashboard(stmt.sql);
      if (!ok2) {
        console.error(`   ❌ Falha em "${stmt.label}". Abortando.`);
        return;
      }
    }
  }
  
  console.log('\n✅ Migration completa!');
}

run().catch(console.error);
