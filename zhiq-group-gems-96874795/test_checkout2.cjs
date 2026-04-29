const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testCheckout() {
    const sessionToken = "test-session-123456";
    
    // Get a real product
    const { data: prods } = await supabase.from('merchant_marketing_products').select('id, merchant_store_id').limit(1);
    if (!prods || prods.length === 0) {
        console.log("No products found.");
        return;
    }
    const pId = prods[0].id;
    const sId = prods[0].merchant_store_id;
    
    // Add an item
    const { data: addData, error: addErr } = await supabase.rpc("add_item_to_store_cart", {
        p_store_id: sId,
        p_product_id: pId,
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
