import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'ey...';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: ledger, error: ledgerError } = await supabase.from('vehicle_credit_ledger').select('*').limit(10);
  console.log('Ledger sample:', JSON.stringify(ledger, null, 2));
  
  const { data: listings, error: listingsError } = await supabase.from('vehicle_listings').select('id, title, view_count').limit(5);
  console.log('Listings sample:', JSON.stringify(listings, null, 2));
}

main().catch(console.error);
