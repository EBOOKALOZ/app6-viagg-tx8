import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://broifhfqmnzqoongtokm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: purchases, error } = await supabase
    .from('credit_purchases')
    .select('id, status, amount_paid, credits_granted, product_name, store_id');
  
  if (error) {
    console.error('Error fetching credit purchases:', error);
    return;
  }
  
  console.log('Total purchases in DB:', purchases.length);
  const statusCounts: Record<string, number> = {};
  let totalPaidAmount = 0;
  let totalPendingAmount = 0;
  let totalCredits = 0;
  const uniqueStores = new Set();

  purchases.forEach(p => {
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
    totalCredits += p.credits_granted || 0;
    if (p.store_id) uniqueStores.add(p.store_id);
    
    const amt = Number(p.amount_paid || 0);
    if (p.status === 'paid') {
      totalPaidAmount += amt;
    } else if (p.status === 'pending' || p.status === 'awaiting_payment') {
      totalPendingAmount += amt;
    }
  });

  console.log('Status counts:', statusCounts);
  console.log('Total Paid Revenue:', totalPaidAmount);
  console.log('Total Pending/Awaiting Revenue:', totalPendingAmount);
  console.log('Total Credits:', totalCredits);
  console.log('Unique Stores:', uniqueStores.size);
}

main();
