import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://broifhfqmnzqoongtokm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("PROFILES:");
  const { data: pr, error: prErr } = await supabase.from('profiles').select('id, name, store_latitude, store_longitude, store_address, cidade');
  if (prErr) console.error(prErr);
  else console.log(pr);
}

run();
