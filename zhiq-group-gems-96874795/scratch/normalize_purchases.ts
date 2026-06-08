import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://broifhfqmnzqoongtokm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: purchases, error } = await supabase
    .from('credit_purchases')
    .select('id, product_name, amount_paid, credits_granted, status');
  
  if (error) {
    console.error('Error fetching purchases:', error);
    return;
  }

  console.log(`Found ${purchases.length} purchases to process.`);

  for (const p of purchases) {
    let newName = p.product_name;
    let newAmount = p.amount_paid;
    let newCredits = p.credits_granted;

    const upper = (p.product_name || '').toUpperCase();
    if (upper.includes('ÚNICO') || upper.includes('BÁSICO') || upper.includes('INICIANTE')) {
      newName = 'CRÉDITO INICIANTE';
      newAmount = 49.90;
      newCredits = 220;
    } else if (upper.includes('POUCOS') || upper.includes('MEI') || upper.includes('EMPREENDEDOR')) {
      newName = 'CRÉDITO MEI';
      newAmount = 85.90;
      newCredits = 495;
    } else if (upper.includes('LOJISTA')) {
      newName = 'CRÉDITO LOJISTA';
      newAmount = 169.90;
      newCredits = 990;
    }

    const { error: updateErr } = await supabase
      .from('credit_purchases')
      .update({
        product_name: newName,
        amount_paid: newAmount,
        credits_granted: newCredits,
        status: 'paid'
      })
      .eq('id', p.id);

    if (updateErr) {
      console.error(`Error updating purchase ${p.id}:`, updateErr);
    } else {
      console.log(`Updated purchase ${p.id}: "${p.product_name}" -> "${newName}" (R$ ${newAmount}, ${newCredits} credits, paid)`);
    }
  }

  console.log('Database normalization completed.');
}

main();
