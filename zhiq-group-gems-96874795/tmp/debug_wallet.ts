
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function debug() {
  const userId = 'e2a05c45-2d94-4601-b672-9d472982e68c';
  console.log(`Debugging user: ${userId}`);

  const { data, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .or(`owner_user_id.eq.${userId},user_id.eq.${userId}`);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Results:', JSON.stringify(data, null, 2));
}

debug();
