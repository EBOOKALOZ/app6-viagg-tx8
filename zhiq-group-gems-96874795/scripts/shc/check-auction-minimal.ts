import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.staging', override: true });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function main() {
  const start = Date.now();

  const { data, error } = await supabase
    .from('auction_listings')
    .select('id')
    .limit(1);

  console.log(JSON.stringify({
    elapsed_ms: Date.now() - start,
    success: !error,
    data,
    error: error ? {
      message: error.message,
      code: error.code,
      status: error.status
    } : null
  }, null, 2));
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
