import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://broifhfqmnzqoongtokm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: products, error } = await supabase
    .from('merchant_credit_products')
    .select('*');
  
  if (error) {
    console.error('Error fetching merchant_credit_products:', error);
    return;
  }
  
  console.log('Total products in DB:', products.length);
  console.log('Products:', JSON.stringify(products, null, 2));
}

main();
