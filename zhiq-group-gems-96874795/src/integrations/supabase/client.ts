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

// Environment variables exclusively
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail fast se não tiver as envs! Pra evitar shadow-bugs batendo em outros bancos
if (!SUPABASE_URL) {
  throw new Error("VITE_SUPABASE_URL está faltando no ambiente. Verifique o .env.");
}

if (!SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("VITE_SUPABASE_ANON_KEY está faltando no ambiente. Verifique o .env.");
}

// Log initialization status
console.log("SUPABASE URL:", SUPABASE_URL);

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
