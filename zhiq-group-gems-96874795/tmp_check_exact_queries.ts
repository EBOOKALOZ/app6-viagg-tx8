import { supabase } from './src/integrations/supabase/client';

async function checkExactQueries() {
  console.log("=== Checking Exact Queries from Pages ===");

  // 1. MercadoLocalViagg: Vitrine query
  console.log("\n1. [MercadoLocalViagg] Vitrine (merchant_marketing_products):");
  const { data: vitrine, error: vitrineErr } = await (supabase.from("merchant_marketing_products") as any)
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  console.log("   Result:", vitrineErr ? `❌ Error: ${vitrineErr.message}` : `✅ Found: ${vitrine?.length} items`);

  // 2. MercadoLocalViagg: Advertiser listings query
  console.log("\n2. [MercadoLocalViagg] Advertiser listings:");
  const { data: advData, error: advErr } = await (supabase.from("advertiser_listings") as any)
    .select("*, advertiser_listing_media(media_url), advertiser_accounts!inner(user_id)")
    .in("listing_status", ["active", "published"])
    .order("created_at", { ascending: false });
  console.log("   Result:", advErr ? `❌ Error: ${advErr.message}` : `✅ Found: ${advData?.length} items`);
  if (advErr) console.log("   Full error:", advErr);

  // 3. AllVehiclesPage: vehicle_listings query + media
  console.log("\n3. [AllVehiclesPage] vehicle_listings:");
  const { data: vehicles, error: vehErr } = await (supabase.from("vehicle_listings") as any)
    .select("*")
    .order("created_at", { ascending: false });
  console.log("   Result:", vehErr ? `❌ Error: ${vehErr.message}` : `✅ Found: ${vehicles?.length} items`);

  if (vehicles && vehicles.length > 0) {
    const ids = vehicles.map((v: any) => v.id);
    const { data: mediaRows, error: mediaErr } = await (supabase.from("vehicle_media") as any)
      .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
      .in("listing_id", ids)
      .order("sort_order", { ascending: true });
    console.log("   Media Result:", mediaErr ? `❌ Error: ${mediaErr.message}` : `✅ Found: ${mediaRows?.length} media rows`);
  }

  // 4. PublicRealEstateHome: real estate query
  console.log("\n4. [PublicRealEstateHome] public_real_estate_listings:");
  const { data: re, error: reErr } = await (supabase.from("public_real_estate_listings") as any)
    .select("*")
    .order("created_at", { ascending: false });
  console.log("   Result:", reErr ? `❌ Error: ${reErr.message}` : `✅ Found: ${re?.length} items`);
}

checkExactQueries().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
