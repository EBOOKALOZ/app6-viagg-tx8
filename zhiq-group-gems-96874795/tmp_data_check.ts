import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function main() {
  const { data: vListings, error: vErr } = await supabase.from('vehicle_listings').select('id, title, cover_image_url');
  console.log('Vehicle Listings:', vListings);
  console.log('Vehicle Error:', vErr);

  const { data: pListings, error: pErr } = await supabase.from('advertiser_listings').select('id, title, cover_image_url, listing_status');
  console.log('Product Listings:', pListings);
  console.log('Product Error:', pErr);

  const { data: vMedia } = await supabase.from('vehicle_media').select('*');
  console.log('Vehicle Media:', vMedia);
}

main();
