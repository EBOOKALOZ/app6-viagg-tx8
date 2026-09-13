import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function main() {
  const { data, error } = await supabase.rpc('wallet_unlock_charge_cents', {
    p_module: 'product',
    p_listing_id: 'some_id',
    p_value_hint_cents: 900
  });
  console.log('Result:', data, error);
}

main().catch(console.error);
