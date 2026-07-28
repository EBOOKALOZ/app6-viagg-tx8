SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname IN ('auto_set_active_profile', 'set_updated_at', 'assign_admin_role_on_signup', 'ensure_wallet_from_profile');
