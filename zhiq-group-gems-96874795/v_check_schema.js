import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
);

import fs from 'fs';

async function checkSchema() {
    const tables = ['purchase_intentions', 'arremate_offers', 'auction_listings', 'profiles'];
    const results = {};
    
    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (data && data.length > 0) {
            results[table] = Object.keys(data[0]);
        } else {
            const { data: dataMore } = await supabase.from(table).select('*').limit(10);
            if (dataMore && dataMore.length > 0) {
                results[table] = Object.keys(dataMore[0]);
            } else {
                results[table] = 'empty or error';
            }
        }
    }
    fs.writeFileSync('schema_dump.json', JSON.stringify(results, null, 2));
    console.log('Schema dumped to schema_dump.json');
}

checkSchema().catch(console.error);
