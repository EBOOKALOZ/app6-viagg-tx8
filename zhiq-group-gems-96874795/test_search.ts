import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const term = '%a%';

  console.log("Testing Mercado...");
  const { data: d1, error: e1 } = await supabase.from('advertiser_listings')
    .select('id, title, description, price')
    .limit(1);
  console.log("Mercado:", e1 ? e1.message : d1);

  console.log("Testing Imoveis...");
  const { data: d2, error: e2 } = await supabase.from('public_real_estate_listings')
    .select('id, title, description, price_brl')
    .limit(1);
  console.log("Imoveis:", e2 ? e2.message : d2);

  console.log("Testing Veiculos...");
  const { data: d3, error: e3 } = await supabase.from('vehicle_listings')
    .select('id, title, description, price')
    .limit(1);
  console.log("Veiculos:", e3 ? e3.message : d3);

  console.log("Testing Servicos...");
  const { data: d4, error: e4 } = await supabase.from('services')
    .select('id, title, description, price')
    .limit(1);
  console.log("Servicos:", e4 ? e4.message : d4);

  console.log("Testing Viagens...");
  const { data: d5, error: e5 } = await supabase.from('travel_packages')
    .select('id, title, description, price')
    .limit(1);
  console.log("Viagens:", e5 ? e5.message : d5);
}

run();
