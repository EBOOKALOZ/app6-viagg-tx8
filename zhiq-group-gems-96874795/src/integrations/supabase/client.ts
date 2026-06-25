/**
 * Supabase Client with Fallback Protection
 * 
 * This file provides the Supabase client for the entire application.
 * It includes fallback values to prevent crashes when environment variables
 * are not properly injected by the build system.
 * 
 * IMPORTANT: The fallback values are the Lovable Cloud credentials for this project.
 * The anon key is a PUBLIC key and is safe to include in client-side code.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://broifhfqmnzqoongtokm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8";

if (import.meta.env.DEV) {
  console.log('[Supabase] Initializing client:', {
    url: SUPABASE_URL.substring(0, 40) + '...',
    usingEnvUrl: Boolean(import.meta.env.VITE_SUPABASE_URL),
    usingEnvKey: Boolean(SUPABASE_PUBLISHABLE_KEY)
  });
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  }
});
