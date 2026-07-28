import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
// Use service role key to bypass RLS
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.log("No service role key found. Will try to read from .env directly or skip.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  const owner_user_id = '12921e5d-4632-49b7-82fe-de937f383553';
  
  const { data: pData, error: err2 } = await supabase.from('profiles').select('*').eq('id', owner_user_id);
  console.log("Profiles raw:", pData, "Error:", err2);

  const { data: storeData } = await supabase.from('merchant_stores').select('*').eq('user_id', owner_user_id);
  console.log("Merchant stores:", storeData);
}

checkData();
