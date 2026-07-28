import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://broifhfqmnzqoongtokm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8'
)

async function test() {
  const { data: rows, error: errorRows } = await supabase.from("travel_listings").select("id").limit(10);
  console.log("Listings:", rows?.length, errorRows?.message);

  if (rows && rows.length > 0) {
    const ids = rows.map(r => r.id);
    const { data: media, error: errorMedia } = await supabase.from("travel_media")
      .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
      .in("listing_id", ids);
    console.log("Media:", JSON.stringify(media, null, 2), errorMedia?.message);
  }
}

test();
