const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://broifhfqmnzqoongtokm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    const { data: stores } = await supabase.from('merchant_stores').select('*');
    console.log("ALL STORES:", JSON.stringify(stores, null, 2));

    const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url, nome_loja, logo_url').limit(10);
    console.log("PROFILES:", JSON.stringify(profiles, null, 2));
}

main().catch(console.error);
