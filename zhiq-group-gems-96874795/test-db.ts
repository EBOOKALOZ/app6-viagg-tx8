import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jndjkwtceloysbnwxblg.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'dummy';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('orion_marketplace_contact_charges').select('*').limit(1);
  console.log('Result:', data, error);
}

main().catch(console.error);
