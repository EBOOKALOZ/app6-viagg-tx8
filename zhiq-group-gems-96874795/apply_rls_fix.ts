/**
 * Fix RLS policies for merchant_credit_products
 * Run: npx tsx apply_rls_fix.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || "https://broifhfqmnzqoongtokm.supabase.co";
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  // Sign in first (need authenticated session for RPC)
  console.log("Checking auth...");
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session) {
    console.log("Not logged in. Trying to sign in...");
    // Try signing in with email from env or prompt
    const email = process.env.ADMIN_EMAIL || "admin@viagg.com";
    const password = process.env.ADMIN_PASSWORD || "";
    if (password) {
      await supabase.auth.signInWithPassword({ email, password });
    } else {
      console.log("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars, or run from browser console");
    }
  }

  // Test: try updating a product directly
  console.log("\nTesting direct update...");
  const { data: products } = await (supabase.from("merchant_credit_products") as any)
    .select("id, name, is_active, updated_at")
    .eq("is_active", true)
    .limit(1);

  if (!products || products.length === 0) {
    console.log("No active products found");
    return;
  }

  const testProduct = products[0];
  console.log(`Found: ${testProduct.name} (${testProduct.id})`);
  console.log(`Current updated_at: ${testProduct.updated_at}`);

  // Try the update
  const { data: updateResult, error: updateError, count, status, statusText } = await (supabase.from("merchant_credit_products") as any)
    .update({ updated_at: new Date().toISOString() })
    .eq("id", testProduct.id)
    .select();

  console.log(`\nUpdate result:`);
  console.log(`  Status: ${status} ${statusText}`);
  console.log(`  Error: ${updateError ? JSON.stringify(updateError) : "none"}`);
  console.log(`  Rows returned: ${updateResult?.length ?? 0}`);
  
  if (updateResult && updateResult.length > 0) {
    console.log(`  New updated_at: ${updateResult[0].updated_at}`);
    console.log("\n✅ UPDATE WORKS! RLS policy is OK.");
  } else {
    console.log("\n❌ UPDATE returned 0 rows - RLS UPDATE policy is MISSING!");
    console.log("\nYou need to run this SQL in Supabase SQL Editor:");
    console.log(`
CREATE POLICY "mcp_update" ON public.merchant_credit_products FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "mcp_insert" ON public.merchant_credit_products FOR INSERT WITH CHECK (true);
    `);
  }
}

main().catch(console.error);
