SELECT email, created_at FROM auth.users WHERE email LIKE 'test_%@test.com' ORDER BY created_at DESC LIMIT 5;
