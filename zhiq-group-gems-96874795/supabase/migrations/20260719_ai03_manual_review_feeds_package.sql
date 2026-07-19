-- AI-03 FASE 2: aprovacao MANUAL passa a alimentar a Package AI (consistencia c/ auto-aprovacao)
create or replace function public.ridv_manual_review(p_tabela text, p_id uuid, p_decisao text, p_motivo text default null::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $mr$
declare
  v_tabelas   text[] := array['real_estate_listings','vehicle_listings','travel_listings',
                              'freight_listings','service_listings','product_listings',
                              'advertiser_listings','marketplace_products','auction_listings'];
  v_categoria text;
  v_status    text;
  v_rows      int;
begin
  if not mp_is_admin() then
    raise exception 'Apenas administradores podem revisar anuncios';
  end if;
  if not (p_tabela = any (v_tabelas)) then
    raise exception 'Tabela invalida: %', p_tabela;
  end if;
  if p_decisao not in ('aprovar','rejeitar') then
    raise exception 'Decisao invalida: % (use aprovar/rejeitar)', p_decisao;
  end if;

  v_status := case when p_decisao = 'aprovar' then 'manual_approved' else 'blocked' end;
  v_categoria := case p_tabela
    when 'real_estate_listings' then 'real_estate'
    when 'vehicle_listings'     then 'vehicle'
    when 'travel_listings'      then 'travel'
    when 'freight_listings'     then 'freight'
    when 'service_listings'     then 'service'
    when 'auction_listings'     then 'auction'
    else 'product'
  end;

  perform set_config('ridv.manual_override', 'on', true);
  execute format(
    'UPDATE public.%I SET moderation_status = $1, ai_status = ''manual'',
            moderation_reason = coalesce($2, moderation_reason),
            reviewed_by = $3, reviewed_at = now()
     WHERE id = $4', p_tabela)
  using v_status, p_motivo, auth.uid(), p_id;
  get diagnostics v_rows = row_count;
  perform set_config('ridv.manual_override', 'off', true);

  if v_rows = 0 then
    raise exception 'Anuncio % nao encontrado em %', p_id, p_tabela;
  end if;

  insert into public.ridv_decisions_log
    (listing_id, category, content_type, status, reason, verdict, ai_provider,
     reviewed_by, reviewed_at, metadata)
  values
    (p_id, v_categoria, 'text',
     case when p_decisao = 'aprovar' then 'approved' else 'blocked' end,
     coalesce(p_motivo, 'Revisao manual por administrador'),
     'manual', 'human/manual-review', auth.uid(), now(),
     jsonb_build_object('tabela', p_tabela, 'decisao', p_decisao));

  begin
    insert into public.orion_eventos (tipo, origem, dados)
    values ('anuncio_revisado_manual', 'ridv_manual_review',
            jsonb_build_object('tabela', p_tabela, 'listing_id', p_id,
                               'decisao', p_decisao, 'status', v_status));
    -- NOVO: aprovacao manual alimenta a Package AI (mesmo evento da auto-aprovacao)
    if p_decisao = 'aprovar' then
      insert into public.orion_eventos (tipo, origem, dados)
      values ('anuncio_aprovado', 'ridv_manual_review',
              jsonb_build_object('tabela', p_tabela, 'listing_id', p_id, 'origem', 'manual'));
    end if;
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'tabela', p_tabela, 'id', p_id, 'novo_status', v_status);
end;
$mr$;

select (position('anuncio_aprovado' in pg_get_functiondef(p.oid))>0) manual_agora_emite
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ridv_manual_review';
