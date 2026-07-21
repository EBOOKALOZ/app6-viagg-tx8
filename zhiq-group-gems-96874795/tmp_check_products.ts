import { supabase } from './src/integrations/supabase/client';

async function checkTables() {
  console.log("Checking Supabase tables at:", new Date().toISOString());

  const tables = [
    "merchant_marketing_products",
    "advertiser_listings",
    "vehicle_listings",
    "public_real_estate_listings"
  ];

  for (const table of tables) {
    const start = Date.now();
    try {
      console.log(`\nQuerying ${table}...`);
      const { data, error } = await (supabase.from(table) as any).select("*").limit(5);
      const elapsed = Date.now() - start;
      if (error) {
        console.error(`❌ [${table}] Error (${elapsed}ms):`, error.message || error);
      } else {
        console.log(`✅ [${table}] Success (${elapsed}ms): ${data?.length || 0} items found.`);
        if (data && data.length > 0) {
          console.log(`   First item title/name: ${data[0].title || data[0].name || data[0].id}`);
        }
      }
    } catch (err: any) {
      const elapsed = Date.now() - start;
      console.error(`💥 [${table}] Exception (${elapsed}ms):`, err.message || err);
    }
  }
}

checkTables().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
