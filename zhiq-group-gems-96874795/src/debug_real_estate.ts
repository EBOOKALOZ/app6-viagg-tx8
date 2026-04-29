import { supabase } from './integrations/supabase/client';

async function debugPackages() {
  console.log("--- DEBUG START ---");
  const { data, error } = await supabase
    .from('real_estate_credit_packages' as any)
    .select('*');

  if (error) {
    console.error("DB Error:", error);
    return;
  }

  console.log("Raw Packages found:", data?.length);
  data?.forEach((p: any) => {
    console.log(`Package: ${p.id} (${p.name})`);
    console.log(`- features_json type: ${typeof p.features_json}`);
    console.log(`- features_json value:`, p.features_json);
    console.log(`- is_active: ${p.is_active}`);
    console.log("---");
  });
  console.log("--- DEBUG END ---");
}

debugPackages();
