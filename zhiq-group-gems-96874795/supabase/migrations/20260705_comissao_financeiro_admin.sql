-- ============================================================
-- COMISSÃO INTELIGENTE — Resumo Financeiro da Plataforma (Admin)
--
-- RPC agregadora sobre o escrow oficial (pay_escrow_holds):
--   bruto (amount_cents), comissão da plataforma (platform_fee_cents),
--   repasse do parceiro (professional_amount_cents), por dia, categoria
--   (service_type) e status (held/released/refunded/...).
--
-- O front calcula a partir daí: receita dia/semana/mês/ano, pendente
-- (held) × recebida (released), split Plataforma × Parceiros e por
-- categoria (ride=Motorista, mototaxi=Moto-Táxi, delivery=Motoboy...).
--
-- Rodar no SQL Editor do projeto broifhfqmnzqoongtokm
-- (junto com 20260705_comissao_inteligente_sync.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_commission_finance(p_days int DEFAULT 730)
RETURNS TABLE(
  day date,
  service_type text,
  status text,
  tx_count int,
  gross_cents bigint,
  fee_cents bigint,
  professional_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Somente admins (is_platform_admin vem da migration
  -- 20260705_comissao_inteligente_sync.sql — rodar aquela primeiro)
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  RETURN QUERY
  SELECT
    (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
    e.service_type,
    e.status,
    COUNT(*)::int                             AS tx_count,
    COALESCE(SUM(e.amount_cents), 0)::bigint  AS gross_cents,
    COALESCE(SUM(e.platform_fee_cents), 0)::bigint        AS fee_cents,
    COALESCE(SUM(e.professional_amount_cents), 0)::bigint AS professional_cents
  FROM public.pay_escrow_holds e
  WHERE e.created_at >= now() - make_interval(days => GREATEST(COALESCE(p_days, 730), 1))
  GROUP BY 1, 2, 3
  ORDER BY 1;
END;
$$;
