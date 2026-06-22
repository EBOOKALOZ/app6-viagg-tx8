-- ═══════════════════════════════════════════════════════════════════════════
-- Troca service_listings.service_type de enum fechado (8 valores) pra texto
-- livre — agora a categoria vem de uma lista grande (~300 nomes, agrupados
-- por setor) mantida no front-end (src/lib/services/serviceCategories.ts),
-- igual ao padrão já usado em products (PRODUCT_CATEGORIES).
--
-- Linhas existentes com os 8 valores antigos são remapeadas pro nome novo
-- equivalente (ex.: 'academia' -> 'Academias').
-- ═══════════════════════════════════════════════════════════════════════════

-- A view pública depende da coluna (rule _RETURN) — precisa ser removida
-- antes do ALTER COLUMN e recriada depois, com a definição idêntica à
-- original (20260621_service_listings_base.sql).
drop view if exists public.public_service_listings;

alter table public.service_listings
  alter column service_type drop default;

alter table public.service_listings
  alter column service_type type text
  using (
    case service_type::text
      when 'academia' then 'Academias'
      when 'dentista' then 'Dentistas'
      when 'farmacia' then 'Farmácias'
      when 'advogado' then 'Advogados'
      when 'mecanico' then 'Oficinas Mecânicas'
      when 'salao' then 'Salões de Beleza'
      when 'clinica' then 'Clínicas Médicas'
      else 'Outros Serviços'
    end
  );

alter table public.service_listings
  alter column service_type set default 'Outros Serviços';

drop type if exists public.service_type_enum;

create or replace view public.public_service_listings as
select
  s.id,
  s.title,
  s.slug,
  s.service_type,
  s.price_label,
  s.city,
  s.state,
  s.neighborhood,
  s.public_address_label,
  s.published_at
from public.service_listings s
where s.visibility_status = 'published';

grant select on public.public_service_listings to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
