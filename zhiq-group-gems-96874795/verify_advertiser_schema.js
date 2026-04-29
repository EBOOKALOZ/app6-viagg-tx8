import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function checkSchema() {
    console.log("--- Advertiser Accounts ---");
    const { data: q1, error: e1 } = await supabase.from('advertiser_accounts').select('*').limit(1);
    if (q1 && q1.length > 0) {
        console.log("Columns:", Object.keys(q1[0]));
    } else {
        console.log("No data or error:", e1);
    }

    console.log("\n--- Profiles ---");
    const { data: q2, error: e2 } = await supabase.from('profiles').select('*').limit(1);
    if (q2 && q2.length > 0) {
        console.log("Columns:", Object.keys(q2[0]));
    } else {
        console.log("No data or error:", e2);
    }

     console.log("\n--- Real Estate Listings Count ---");
    const { data: q3, error: e3 } = await supabase.from('real_estate_listings').select('visibility_status').limit(100);
     if (q3) {
        const counts = q3.reduce((acc, curr) => {
            acc[curr.visibility_status] = (acc[curr.visibility_status] || 0) + 1;
            return acc;
        }, {});
        console.log("Listing Status Counts (Sample):", counts);
    }
}

checkSchema().catch(console.error);
