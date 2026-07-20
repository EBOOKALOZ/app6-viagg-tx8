-- ORGANIZACAO FINAL: hardening de fechamento do ORION CORE original (35 fns orion_*
-- anon-exec que antecedem o programa de certificacao). Fns de escrita sensivel
-- (orion_ai_prompt_set/config_set/model_upsert/diretriz_salvar/aprovar) tem gate
-- interno (mp_is_admin, PROVADO ao vivo: 'Apenas administradores'), mas grant anon
-- viola defesa-em-profundidade. Revoga anon de todas (exceto orion_norm = utilitario
-- IMMUTABLE puro). Nenhuma mudanca de regra de negocio - so remove exposicao anon.
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prokind='f' and p.prorettype<>'trigger'::regtype
             and has_function_privilege('anon',p.oid,'execute')
             and p.proname ~ '^orion_'
             and p.proname <> 'orion_norm'
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

-- verificacao: quantas orion_ (nao-trigger, nao orion_norm) ainda anon?
select count(*) orion_anon_restante
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and p.prorettype<>'trigger'::regtype
  and has_function_privilege('anon',p.oid,'execute') and p.proname ~ '^orion_' and p.proname<>'orion_norm';
