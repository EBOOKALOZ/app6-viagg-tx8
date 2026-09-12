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

console.log('LOGIN:', {
  ok: !!login.data.session,
  error: login.error?.message ?? null
});

if (!login.data.session) process.exit(1);

const listingId = '30e7b405-7c88-4169-aba3-a40dc7744b1c';

const rpc = await supabase.rpc('place_auction_bid', {
  p_listing_id: listingId,
  p_amount_cents: 11000000
});

console.log('RPC:', JSON.stringify({
  data: rpc.data,
  error: rpc.error
}, null, 2));
