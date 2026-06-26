-- Tabela de mensagens de negociação entre comprador e vendedor (travel)
-- RODAR MANUALMENTE no Supabase Dashboard > SQL Editor (projeto broifhfqmnzqoongtokm)

CREATE TABLE IF NOT EXISTS travel_negotiation_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  intention_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tnm_intention_created
  ON travel_negotiation_messages(intention_id, created_at);

ALTER TABLE travel_negotiation_messages ENABLE ROW LEVEL SECURITY;

-- Apenas participantes da intenção (comprador ou vendedor) podem LER
CREATE POLICY "tnm_select" ON travel_negotiation_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM advertiser_contact_intentions aci
      WHERE aci.id = travel_negotiation_messages.intention_id
        AND (
          aci.contact_user_id = auth.uid()
          OR aci.advertiser_user_id = auth.uid()
        )
    )
  );

-- Apenas participantes podem ENVIAR (e só como eles mesmos)
CREATE POLICY "tnm_insert" ON travel_negotiation_messages
  FOR INSERT WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM advertiser_contact_intentions aci
      WHERE aci.id = travel_negotiation_messages.intention_id
        AND (
          aci.contact_user_id = auth.uid()
          OR aci.advertiser_user_id = auth.uid()
        )
    )
  );
