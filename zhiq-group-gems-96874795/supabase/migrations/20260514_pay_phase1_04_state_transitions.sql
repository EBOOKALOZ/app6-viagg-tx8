-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 1 / SQL 04 / pay_state_transitions + pay_update_delivery_status
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pay_state_transitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text NOT NULL,
  from_status   text NOT NULL,
  to_status     text NOT NULL,
  actor_role    text NOT NULL,
  is_terminal   boolean NOT NULL DEFAULT false,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, from_status, to_status, actor_role)
);

CREATE INDEX IF NOT EXISTS idx_pay_state_transitions_lookup
  ON public.pay_state_transitions (entity_type, from_status, to_status);

ALTER TABLE public.pay_state_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pay_state_transitions_public_read ON public.pay_state_transitions;
CREATE POLICY pay_state_transitions_public_read
  ON public.pay_state_transitions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS pay_state_transitions_admin_write ON public.pay_state_transitions;
CREATE POLICY pay_state_transitions_admin_write
  ON public.pay_state_transitions FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

INSERT INTO public.pay_state_transitions (entity_type, from_status, to_status, actor_role, is_terminal, description) VALUES
  ('delivery_order', 'pending',    'open',      'system',  false, 'Pricing calculado, ofertas podem ser abertas'),
  ('delivery_order', 'open',       'offered',   'system',  false, 'Sistema enviou pra motoboys'),
  ('delivery_order', 'offered',    'accepted',  'motoboy', false, 'Motoboy aceitou'),
  ('delivery_order', 'accepted',   'picked_up', 'motoboy', false, 'Motoboy coletou na loja'),
  ('delivery_order', 'picked_up',  'delivered', 'motoboy', true,  'Entrega concluída'),
  ('delivery_order', 'pending',    'cancelled', 'merchant',true,  'Lojista cancelou antes de abrir'),
  ('delivery_order', 'open',       'cancelled', 'merchant',true,  'Lojista cancelou em aberto'),
  ('delivery_order', 'offered',    'cancelled', 'merchant',true,  'Lojista cancelou após oferta'),
  ('delivery_order', 'accepted',   'cancelled', 'merchant',true,  'Lojista cancelou após aceite'),
  ('delivery_order', 'accepted',   'cancelled', 'motoboy', true,  'Motoboy desistiu'),
  ('delivery_order', 'open',       'expired',   'system',  true,  'Nenhum motoboy aceitou no prazo'),
  ('delivery_order', 'offered',    'expired',   'system',  true,  'Nenhum motoboy aceitou no prazo'),
  ('delivery_order', 'pending',    'cancelled', 'admin',   true,  'Admin cancelou'),
  ('delivery_order', 'open',       'cancelled', 'admin',   true,  'Admin cancelou'),
  ('delivery_order', 'accepted',   'cancelled', 'admin',   true,  'Admin cancelou'),
  ('delivery_order', 'picked_up',  'cancelled', 'admin',   true,  'Admin cancelou (incidente)')
ON CONFLICT (entity_type, from_status, to_status, actor_role) DO NOTHING;

-- pay_update_delivery_status: ver SQL 07 para versão final hardened.
