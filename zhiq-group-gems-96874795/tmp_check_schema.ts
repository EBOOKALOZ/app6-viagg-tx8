
import { createClient } from '@supabase/supabase-client';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkSchema() {
  const { data, error } = await supabase
    .from('real_estate_listings')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error("Error:", error);
    return;
  }
  console.log("Columns:", Object.keys(data[0] || {}));
}

checkSchema();
