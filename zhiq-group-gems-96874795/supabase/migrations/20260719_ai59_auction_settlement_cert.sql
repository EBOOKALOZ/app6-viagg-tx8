-- AI-59 Auction Settlement (AI-65 oficial): modulo BEM protegido. orion_auction_settle
-- ja anon=0/authenticated=0 (so service/definer-chain), tem controle de vencedor, e
-- NAO faz debito real (debito real DESLIGADO comprovado: 0 pay_post_transaction/
-- debitSellerCredits/advertiser_credit/pay_release; grava so orion_auction_settlements/
-- auction_listings/audit; comissao em CREDITOS). tg_arremate_settlement_protect e'
-- trigger fn (anon inofensivo, nao chamavel por RPC). P-ASET-H1: selftest c/ invariante
-- settlement_sem_debito_real.
create or replace function public.orion_settlement_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_settle_debito int; v_settle_exposto int; v_tbl int; v_sp_bad int; v_pass int; v_warn int; v_fail int;
begin
  -- invariante FINANCEIRA CRITICA: orion_auction_settle NAO faz debito real (LEILAO = pgto direto)
  select count(*) into v_settle_debito from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='orion_auction_settle'
    and (lower(pg_get_functiondef(p.oid)) like '%pay_post_transaction(%' or lower(pg_get_functiondef(p.oid)) like '%debitsellercredits(%' or lower(pg_get_functiondef(p.oid)) like '%advertiser_credit(%' or lower(pg_get_functiondef(p.oid)) like '%pay_release%' or lower(pg_get_functiondef(p.oid)) like '%customer_wallet%');
  -- orion_auction_settle nao exposto a anon/authenticated (so service/definer-chain)
  select (case when has_function_privilege('anon','public.orion_auction_settle(uuid)','execute') then 1 else 0 end
         + case when has_function_privilege('authenticated','public.orion_auction_settle(uuid)','execute') then 1 else 0 end) into v_settle_exposto;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (c.relname ~ 'settlement' or c.relname='orion_auction_settlements') and c.relrowsecurity;
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('orion_auction_settle','orion_auction_settlement_dashboard') and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','settlement_sem_debito_real','resultado',case when v_settle_debito=0 then 'PASS' else 'FAIL' end,'evidencia',v_settle_debito||' chamadas de debito real no settle (LEILAO=pgto direto, debito DESLIGADO)'),
    jsonb_build_object('nome','settle_nao_exposto','resultado',case when v_settle_exposto=0 then 'PASS' else 'FAIL' end,'evidencia',v_settle_exposto||' grants anon/authenticated no settle (deve ser 0)'),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=3 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas settlement c/ RLS'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' fns DEFINER sem search_path')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','auction_settlement','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_settlement_selftest() from public, anon;
grant execute on function public.orion_settlement_selftest() to authenticated;

select (public.orion_settlement_selftest())->>'status' selftest_status,
       (public.orion_settlement_selftest())->'resumo' resumo,
       (public.orion_settlement_selftest())->'checks'->0->>'evidencia' debito_check;
