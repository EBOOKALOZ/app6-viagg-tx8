import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.staging' });

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const password = process.env.TEST_USER_PASSWORD;

if (!url || !anon || !password) {
  throw new Error('Variáveis de ambiente ausentes');
}

const supabase = createClient(url, anon);

const login = await supabase.auth.signInWithPassword({
  email: 'comprador2@shc.viagg.com',
  password
});

if (login.error || !login.data.session) {
  throw new Error(`Falha no login: ${login.error?.message}`);
}

const listingId = '30e7b405-7c88-4169-aba3-a40dc7744b1c';

const amounts = [
  12000000,
  12500000,
  13000000,
  13500000,
  14000000
];

for (const amount of amounts) {
  const result = await supabase.rpc('place_auction_bid', {
    p_listing_id: listingId,
    p_amount_cents: amount
  });

  console.log(JSON.stringify({
    amount_cents: amount,
    success: result.data?.success ?? null,
    data: result.data ?? null,
    error: result.error?.message ?? null
  }));
}
