const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testCheckout() {
    const sessionToken = "test-session-12345";
    const storeId = "a96a1e3b-cc5b-4340-9a3b-18fce14115f2"; // Need a real store ID
    
    // Let's get a random store and product
    const { data: stores } = await supabase.from('merchant_stores').select('id').limit(1);
    if (!stores || stores.length === 0) {
        console.log("No stores found.");
        return;
    }
    const sId = stores[0].id;
    console.log("Using store:", sId);
    
    // Add an item
    const { data: addData, error: addErr } = await supabase.rpc("add_item_to_store_cart", {
        p_store_id: sId,
        p_product_id: "00000000-0000-0000-0000-000000000000",
        p_quantity: 1,
        p_customer_note: "",
        p_session_token: sessionToken,
    });
    
    console.log("Add item result:", addData, addErr);
    
    // Now submit
    const { data: submitData, error: submitErr } = await supabase.rpc("submit_multi_store_intention", {
        p_session_token: sessionToken,
    });
    
    console.log("Submit result:", submitData, submitErr);
}

testCheckout();
