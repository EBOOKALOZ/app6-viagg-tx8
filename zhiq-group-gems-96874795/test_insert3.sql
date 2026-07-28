INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role, instance_id) 
VALUES (gen_random_uuid(), 'test_trigger_debug_5@test.com', '{"name": "Debug Test"}'::jsonb, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
