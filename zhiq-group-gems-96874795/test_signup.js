import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSignup() {
  const email = `test_${Date.now()}@test.com`;
  console.log(`Testing signup with email: ${email}`);
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: 'password123',
    options: {
      data: {
        name: 'Test User'
      }
    }
  });

  if (error) {
    console.error('Signup failed:', error);
  } else {
    console.log('Signup succeeded:', data);
  }
}

testSignup();
