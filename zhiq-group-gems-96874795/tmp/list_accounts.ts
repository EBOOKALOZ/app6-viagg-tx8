
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function debug() {
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Results:', JSON.stringify(data, null, 2));
}

debug();
