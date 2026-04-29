CREATE OR REPLACE FUNCTION public.get_server_timestamp()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT now();
$$;