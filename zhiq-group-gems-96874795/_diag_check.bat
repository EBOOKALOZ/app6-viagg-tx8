@echo off
setlocal

for /f "tokens=1,2 delims==" %%a in ('findstr "SUPABASE_SERVICE_ROLE_KEY" .env.staging') do set SRK=%%b

echo === A. Tabelas com 'wallet' no nome ===
curl -s -X POST "https://jndjkwtceloysbnwxblg.supabase.co/rest/v1/rpc/execute_sql" -H "apikey: %SRK%" -H "Authorization: Bearer %SRK%" -H "Content-Type: application/json" -d "{\"query\":\"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%%wallet%%' ORDER BY table_name\"}" --connect-timeout 15 --max-time 20 2>nul
echo.

echo === B. Tabelas com 'wallet' via pg_tables ===
curl -s -X GET "https://jndjkwtceloysbnwxblg.supabase.co/rest/v1/wallets?select=*&limit=0" -H "apikey: %SRK%" -H "Authorization: Bearer %SRK%" -H "Prefer: count=exact" -w "\nHTTP:%%{http_code}\n" --connect-timeout 15 --max-time 20
echo.

echo === C. wallet_accounts ===
curl -s -X GET "https://jndjkwtceloysbnwxblg.supabase.co/rest/v1/wallet_accounts?select=*&limit=0" -H "apikey: %SRK%" -H "Authorization: Bearer %SRK%" -H "Prefer: count=exact" -w "\nHTTP:%%{http_code}\n" --connect-timeout 15 --max-time 20
echo.

echo === D. pay_accounts (wallet do Pay) ===
curl -s -X GET "https://jndjkwtceloysbnwxblg.supabase.co/rest/v1/pay_accounts?select=*&limit=0" -H "apikey: %SRK%" -H "Authorization: Bearer %SRK%" -H "Prefer: count=exact" -w "\nHTTP:%%{http_code}\n" --connect-timeout 15 --max-time 20
echo.

echo === E. auction_listings colunas (limit=1) ===
curl -s -X GET "https://jndjkwtceloysbnwxblg.supabase.co/rest/v1/auction_listings?select=*&limit=1" -H "apikey: %SRK%" -H "Authorization: Bearer %SRK%" -w "\nHTTP:%%{http_code}\n" --connect-timeout 15 --max-time 20
echo.

echo === F. Existe coluna current_price em auction_listings? ===
curl -s -X GET "https://jndjkwtceloysbnwxblg.supabase.co/rest/v1/auction_listings?select=current_price&limit=1" -H "apikey: %SRK%" -H "Authorization: Bearer %SRK%" -w "\nHTTP:%%{http_code}\n" --connect-timeout 15 --max-time 20
echo.

echo === G. RPC place_auction_bid existe? ===
curl -s -X POST "https://jndjkwtceloysbnwxblg.supabase.co/rest/v1/rpc/place_auction_bid" -H "apikey: %SRK%" -H "Authorization: Bearer %SRK%" -H "Content-Type: application/json" -d "{}" -w "\nHTTP:%%{http_code}\n" --connect-timeout 15 --max-time 20
echo.

echo === H. auction_bids tabela existe? ===
curl -s -X GET "https://jndjkwtceloysbnwxblg.supabase.co/rest/v1/auction_bids?select=*&limit=0" -H "apikey: %SRK%" -H "Authorization: Bearer %SRK%" -H "Prefer: count=exact" -w "\nHTTP:%%{http_code}\n" --connect-timeout 15 --max-time 20
echo.

endlocal
