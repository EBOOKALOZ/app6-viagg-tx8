import { supabase } from './src/integrations/supabase/client';

async function checkMultipleStores() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    console.log("No user authenticated.");
    return;
  }
  
  const { data, error } = await supabase.from('merchant_stores').select('*').eq('user_id', authData.user.id);
  
  if (error) {
    console.error("Error fetching stores:", error);
  } else {
    console.log("Stores for user:", data?.length);
    if (data && data.length > 0) {
      console.log(data);
    }
  }
}

checkMultipleStores();
