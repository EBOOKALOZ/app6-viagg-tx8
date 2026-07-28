-- ============================================================================
-- Correção P0-2 (auditoria 2026-07-28): auction_bids sem FK para auction_listings.
--
-- Causa raiz: a migration 20260723_auction_enterprise_baseline_oficial.sql
-- tentou criar a FK dentro de um bloco DO ... EXCEPTION WHEN duplicate_object
-- OR others THEN NULL, que engoliu silenciosamente o erro causado pelos
-- próprios registros órfãos já existentes (2 lances em auction_bids sem
-- listing_id correspondente em auction_listings) — a FK nunca foi criada.
--
-- Evidência coletada no banco vivo (broifhfqmnzqoongtokm) em 2026-07-28:
--   - 2 bids órfãos, ambos user_id=12921e5d-4632-49b7-82fe-de937f383553
--     (conta do próprio dono do projeto, angelo_zanatta@hotmail.com).
--   - 3 settlements órfãos em orion_auction_settlements para os mesmos
--     listing_id + 1 terceiro ("[Imóvel] Chácara recanto -TESTE-"), todos
--     com título contendo "-TESTE-", status='no_winner', winner_user_id
--     NULL, arremate_status NULL, contato_liberado=false, pagamento_ok=false.
--   - Nenhum arremate foi iniciado, nenhum pagamento tramitou, nenhum
--     terceiro (comprador) está envolvido — são leilões de desenvolvimento
--     cujo auction_listings pai foi apagado manualmente depois.
--   - Nenhum outro padrão de órfão foi encontrado em auction_watchers,
--     auction_proxy_bids (ambos 0 órfãos).
--
-- Decisão: remover os 2 bids órfãos por ID explícito (não um DELETE
-- genérico) e os 3 settlements órfãos pela mesma razão, documentando a
-- evidência acima. Em seguida recriar a FK sem o swallow silencioso de
-- erro — se houver qualquer outro órfão desconhecido, a migration deve
-- falhar de forma visível (fail-loud), não silenciar o problema.
-- ============================================================================

BEGIN;

-- Remoção pontual, por ID, dos 2 bids de teste já identificados e
-- documentados acima (não um DELETE amplo por padrão).
DELETE FROM public.auction_bids
WHERE id IN (
  '9a366413-e7fb-40fd-b0f5-b25081d35cc3',
  'be98fbc1-9384-477d-b776-85e87e52d535'
);

-- Remoção pontual dos 3 settlements de teste correspondentes (mesmos
-- listing_id órfãos + o terceiro caso "-TESTE-" com o mesmo padrão).
DELETE FROM public.orion_auction_settlements
WHERE listing_id IN (
  '4261c810-9bd4-4f84-8e08-9d3bbc12e7f6',
  '28d8e0cc-67cd-443f-8747-c948c758a8c1',
  'cdf88ee7-8c65-4ecb-b37d-23aad7070c7f',
  'd378eb2e-3e96-4dfc-9ee0-e0975529d33f'
);

-- Recria a FK de listing_id sem engolir exceção — qualquer órfão
-- remanescente deve fazer esta migration falhar visivelmente.
ALTER TABLE public.auction_bids
  DROP CONSTRAINT IF EXISTS auction_bids_listing_id_fkey;

ALTER TABLE public.auction_bids
  ADD CONSTRAINT auction_bids_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES public.auction_listings(id) ON DELETE CASCADE;

-- FK de user_id, ausente até agora.
ALTER TABLE public.auction_bids
  DROP CONSTRAINT IF EXISTS auction_bids_user_id_fkey;

ALTER TABLE public.auction_bids
  ADD CONSTRAINT auction_bids_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- CHECK ausente: valor de lance deve ser positivo.
ALTER TABLE public.auction_bids
  DROP CONSTRAINT IF EXISTS auction_bids_amount_cents_check;

ALTER TABLE public.auction_bids
  ADD CONSTRAINT auction_bids_amount_cents_check CHECK (amount_cents > 0);

COMMIT;

-- ROLLBACK (documentado, não executado):
-- BEGIN;
-- ALTER TABLE public.auction_bids DROP CONSTRAINT IF EXISTS auction_bids_amount_cents_check;
-- ALTER TABLE public.auction_bids DROP CONSTRAINT IF EXISTS auction_bids_user_id_fkey;
-- ALTER TABLE public.auction_bids DROP CONSTRAINT IF EXISTS auction_bids_listing_id_fkey;
-- COMMIT;
-- (Os registros deletados não são recuperáveis por este rollback — foram
-- documentados acima com evidência completa antes da remoção.)
