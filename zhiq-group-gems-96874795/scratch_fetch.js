const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://broifhfqmnzqoongtokm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    // Busca a última loja cadastrada (ou todas)
    const { data, error } = await supabase.from('merchant_stores').select('id, user_id, nome_loja, logo_url').order('created_at', { ascending: false }).limit(5);
    console.log("merchant_stores:", data);

    const { data: pData } = await supabase.from('profiles').select('id, full_name, nome_loja, logo_url').limit(5);
    console.log("profiles:", pData);
}

main().catch(console.error);
