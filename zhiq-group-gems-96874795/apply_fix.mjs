import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function run() {
    console.log("Reading fix_add_item_rpc.sql...");
    const sql = fs.readFileSync('./supabase/fix_add_item_rpc.sql', 'utf8');
    
    console.log("Executing via exec_sql...");
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
        console.error('Error applying migration:', error);
    } else {
        console.log('Migration applied successfully:', data);
    }
}

run();
