SELECT u.email, p.id as profile_id, p.name, ur.role 
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email = 'test_1785116834082@test.com';
