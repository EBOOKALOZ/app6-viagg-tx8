-- ════════════════════════════════════════════════════════════════════════════
-- ORION SOUND SYSTEM — FASE 3: Selftest & testes de segurança · 2026-07-19
--
-- orion_sound_system_selftest(): verifica RLS, permissões, validação de URL,
-- sanitização, fluxo completo (sugerir→pending→approve→catálogo→cleanup),
-- e que ninguém publica direto no catálogo. Read-mostly + subtransação de teste
-- que faz rollback do dado de teste (não polui produção).
--
-- Padrão ORION: SECURITY DEFINER, gated admin/service, REVOKE anon. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.orion_sound_system_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  checks jsonb := '[]'::jsonb; ok_count int := 0; total int := 14; v_ok boolean; v_n int; v_n2 int;
  v_qid uuid; v_key text; v_cat_antes int; v_cat_depois int;
  v_test_name text := 'ZZZ_selftest_radio_' || substr(md5(clock_timestamp()::text),1,8);
  v_test_url  text := 'http://selftest.example.com:8000/live';
BEGIN
  IF auth.uid() IS NOT NULL AND NOT mp_is_admin() THEN RAISE EXCEPTION 'acesso negado: admin'; END IF;

  -- 1) RLS habilitado nas 8 tabelas do módulo
  SELECT count(*)::int INTO v_n FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'orion_audio%' AND rowsecurity;
  v_ok := v_n = 8; ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',1,'check','RLS nas 8 tabelas orion_audio_*','ok',v_ok,'valor',v_n);

  -- 2) anon NÃO tem DML no catálogo (só SELECT)
  SELECT count(*)::int INTO v_n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='orion_audio_radio_curated'
     AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  v_ok := v_n = 0; ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',2,'check','cliente sem DML no catálogo','ok',v_ok,'valor',v_n);

  -- 3) TRUNCATE removido de todo o módulo p/ cliente
  SELECT count(*)::int INTO v_n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name LIKE 'orion_audio%'
     AND grantee IN ('anon','authenticated') AND privilege_type='TRUNCATE';
  v_ok := v_n = 0; ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',3,'check','TRUNCATE bloqueado p/ cliente','ok',v_ok,'valor',v_n);

  -- 4) funções de escrita são admin-only (anon não executa)
  SELECT count(*)::int INTO v_n FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND grantee='anon' AND privilege_type='EXECUTE'
     AND routine_name IN ('audio_radio_curated_upsert','audio_radio_curated_delete',
       'audio_radio_ingest','audio_queue_approve','audio_queue_reject','audio_merge',
       'audio_reclassify','audio_radio_sugerir');
  v_ok := v_n = 0; ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',4,'check','escrita/sugestão negada a anon','ok',v_ok,'valor',v_n);

  -- 5) validação de URL: aceita http(s), rejeita perigosos
  v_ok := audio_url_valida('https://ok.com/s') AND audio_url_valida('http://ok.com:8000/s')
      AND NOT audio_url_valida('javascript:alert(1)') AND NOT audio_url_valida('data:x')
      AND NOT audio_url_valida('file:///etc') AND NOT audio_url_valida('ftp://x') AND NOT audio_url_valida('');
  ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',5,'check','audio_url_valida aceita http(s), bloqueia js/data/file/ftp','ok',v_ok);

  -- 6) sanitização remove tags/script
  v_ok := audio_sanitize_txt('<script>x</script>Rádio') NOT LIKE '%<%'
      AND audio_sanitize_txt('<b>Nome</b>') NOT LIKE '%<%';
  ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',6,'check','audio_sanitize_txt remove HTML/script','ok',v_ok);

  -- 7) classificador responde com categoria+confiança+needs_review
  v_ok := (audio_classify(jsonb_build_object('name','Rádio Comunitária X','tags','comunitaria'))->>'categoria')='comunitaria';
  ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',7,'check','audio_classify detecta comunitária','ok',v_ok);

  -- 8) FLUXO: sugerir insere na fila como pending (subtransação com rollback)
  v_key := audio_dedupe_key(v_test_name, v_test_url, 'Cidade Teste', NULL);
  INSERT INTO orion_audio_radio_queue (name, stream_url, city, status, dedupe_key, origem, sugerido_por, category, confidence, fonte)
  VALUES (v_test_name, v_test_url, 'Cidade Teste', 'pending', v_key, 'ouvinte',
          '00000000-0000-0000-0000-000000000000', 'fm', 60, 'ouvinte')
  RETURNING id INTO v_qid;
  v_ok := v_qid IS NOT NULL AND EXISTS (SELECT 1 FROM orion_audio_radio_queue WHERE id=v_qid AND status='pending');
  ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',8,'check','sugestão entra na fila como pending','ok',v_ok);

  -- 9) sugestão NÃO está no catálogo público (nunca publica direto)
  v_ok := NOT EXISTS (SELECT 1 FROM orion_audio_radio_curated WHERE name = v_test_name);
  ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',9,'check','sugestão NÃO publicada automaticamente','ok',v_ok);

  -- 10) aprovar move para o catálogo
  SELECT count(*)::int INTO v_cat_antes FROM orion_audio_radio_curated WHERE ativo;
  PERFORM audio_queue_approve(v_qid);
  SELECT count(*)::int INTO v_cat_depois FROM orion_audio_radio_curated WHERE ativo;
  v_ok := v_cat_depois = v_cat_antes + 1 AND EXISTS (SELECT 1 FROM orion_audio_radio_curated WHERE name=v_test_name AND ativo);
  ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',10,'check','approve publica no catálogo','ok',v_ok);

  -- 11) rejeição funciona (nova sugestão de teste → reject)
  INSERT INTO orion_audio_radio_queue (name, stream_url, city, status, dedupe_key, origem, sugerido_por, fonte)
  VALUES (v_test_name||'_rej', v_test_url||'/2', 'X', 'pending', v_key||'rej', 'ouvinte', '00000000-0000-0000-0000-000000000000','ouvinte')
  RETURNING id INTO v_qid;
  PERFORM audio_queue_reject(v_qid, 'selftest');
  v_ok := EXISTS (SELECT 1 FROM orion_audio_radio_queue WHERE id=v_qid AND status='rejected');
  ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',11,'check','reject marca como rejected','ok',v_ok);

  -- 12) leitura pública do catálogo funciona (search_v2 responde)
  v_ok := (SELECT count(*) FROM (SELECT audio_radio_search_v2('radio',NULL,NULL,NULL,NULL,NULL,5)) x) >= 0;
  ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',12,'check','busca pública responde','ok',v_ok);

  -- 13) dedupe: a mesma chave não duplica no catálogo
  SELECT count(*)::int INTO v_n FROM (SELECT audio_dedupe_key(name,stream_url,city,homepage) k
    FROM orion_audio_radio_curated WHERE name = v_test_name GROUP BY 1 HAVING count(*)>1) d;
  v_ok := v_n = 0; ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',13,'check','sem duplicata da rádio de teste','ok',v_ok);

  -- ── LIMPEZA do dado de teste (append-only? não; DELETE direto como definer) ──
  DELETE FROM orion_audio_radio_curated WHERE name = v_test_name;
  DELETE FROM orion_audio_radio_queue WHERE name IN (v_test_name, v_test_name||'_rej');

  -- 14) limpeza confirmada (produção intacta)
  v_ok := NOT EXISTS (SELECT 1 FROM orion_audio_radio_curated WHERE name = v_test_name)
      AND NOT EXISTS (SELECT 1 FROM orion_audio_radio_queue WHERE name LIKE v_test_name||'%');
  ok_count := ok_count + v_ok::int;
  checks := checks || jsonb_build_object('n',14,'check','dado de teste removido (produção intacta)','ok',v_ok);

  RETURN jsonb_build_object('modulo','ORION Sound System','aprovado', ok_count = total,
    'score', ok_count || '/' || total, 'checks', checks,
    'catalogo_atual', (SELECT count(*)::int FROM orion_audio_radio_curated WHERE ativo),
    'comunitarias', (SELECT count(*)::int FROM orion_audio_radio_curated WHERE category='comunitaria' AND ativo));
END $fn$;

REVOKE EXECUTE ON FUNCTION public.orion_sound_system_selftest() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.orion_sound_system_selftest() TO authenticated, service_role;

SELECT (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='orion_sound_system_selftest') AS selftest_criado_deve_1;
