const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://broifhfqmnzqoongtokm.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8');

async function main() {
    const advAccountId = "500041da-9e1c-4dd9-99a1-5e101a7f07b9";
    const { data: acc } = await supabase.from('advertiser_accounts').select('user_id').eq('id', advAccountId).maybeSingle();
    console.log("ACCOUNT:", acc);

    if (acc) {
        const { data: store } = await supabase.from('merchant_stores').select('id, nome_loja, logo_url').eq('user_id', acc.user_id).maybeSingle();
        console.log("STORE:", store);

        const { data: profile } = await supabase.from('profiles').select('id, full_name, avatar_url, nome_loja').eq('id', acc.user_id).maybeSingle();
        console.log("PROFILE:", profile);
    }
}
main().catch(console.error);
