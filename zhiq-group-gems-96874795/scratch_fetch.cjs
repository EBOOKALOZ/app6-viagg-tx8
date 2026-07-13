const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://broifhfqmnzqoongtokm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    const { data: pData } = await supabase.from('products').select('id, title, merchant_store_id, seller_user_id').order('created_at', { ascending: false }).limit(5);
    console.log("RECENT PRODUCTS:", pData);
}

main().catch(console.error);
