import { createClient } from "@supabase/supabase-js";
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || "",
  process.env.VITE_SUPABASE_ANON_KEY || ""
);

async function check() {
  const { data, error } = await supabase
    .from("vehicle_listings")
    .select("*, vehicle_media(*)")
    .ilike("title", "%UNNO FLEX%");

  console.log(JSON.stringify(data, null, 2));
}

check();
