import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.staging', override: true });

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error('VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausente');
}

const supabase = createClient(url, anon);

const listingId = '30e7b405-7c88-4169-aba3-a40dc7744b1c';

async function main() {
  const start = Date.now();

  const { data, error } = await supabase
    .from('auction_listings')
    .select('id,status,current_bid,total_bids')
    .eq('id', listingId)
    .single();

  console.log(JSON.stringify({
    elapsed_ms: Date.now() - start,
    data,
    error: error
      ? {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          status: error.status
        }
      : null
  }, null, 2));
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
