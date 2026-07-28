import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  const effectiveId = '12921e5d-4632-49b7-82fe-de937f383553';
  
  const { data: advAcc } = await supabase.from('advertiser_accounts').select('*').eq('profile_id', effectiveId).maybeSingle();
  const { data: mp } = await supabase.from('advertiser_module_profiles').select('*').eq('user_id', effectiveId);
  const { data: profiles } = await supabase.from('profiles').select('*').eq('id', effectiveId).maybeSingle();
  
  console.log("Advertiser Account:", advAcc);
  console.log("Module Profiles:", mp);
  console.log("Profile:", profiles);
}

checkData();
