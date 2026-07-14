-- ═══════════════════════════════════════════════════════════════
-- ORION Fase 1.2 — Índices Cognitivos documentados e versionados
-- (ORION VISION 2035: "todos devem ser documentados, versionados e
--  recalculados automaticamente"). Registro oficial das fórmulas.
-- Aplicada via Management API em 2026-07-13. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS orion_indices (
  sigla        text NOT NULL,
  versao       int  NOT NULL,
  nome         text NOT NULL,
  formula      text NOT NULL,     -- descrição auditável da fórmula em vigor
  fonte        text NOT NULL,     -- de onde vêm os dados
  ativo        boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sigla, versao)
);
ALTER TABLE orion_indices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_idx_admin_read ON orion_indices;
CREATE POLICY orion_idx_admin_read ON orion_indices
  FOR SELECT TO authenticated USING (mp_is_admin());

INSERT INTO orion_indices (sigla, versao, nome, formula, fonte) VALUES
  ('IPV', 1, 'Índice de Potencial VIAGG',
   'score_geral do orion_ranking: pontos de porte populacional (8-50) + densidade (0-15) + presença real ((lojas+motoboys)*2, cap 15) + anúncios (cap 10). Escala 0-100.',
   'orion_municipios (IBGE) + motoboy_profiles + merchant_stores + advertiser_listings + profiles'),
  ('IOD', 1, 'Índice de Oferta × Demanda',
   'capacidade (motoboys*12 entregas/dia) ÷ demanda estimada (lojas*6 + populacao/50000 pedidos/dia). <1 = falta oferta; >2 = sobra.',
   'orion_presenca_cidades + orion_municipios'),
  ('ISAT', 1, 'Índice de Saturação',
   'profissionais por 10 mil habitantes (motoboys*10000/populacao). Referência v1: saudável entre 0,5 e 3,0.',
   'orion_presenca_cidades + orion_municipios'),
  ('ICLA', 1, 'Classificação de Expansão',
   'Regras do Motor Territorial: presença>0 e (lojas+anúncios)>=5 → crescimento_acelerado; presença>0 → consolidação; pop>=200k sem presença → implantação_imediata; >=80k → alta_prioridade; >=30k → observação; senão baixa_prioridade.',
   'orion_ranking'),
  ('IPRE', 1, 'Confiança de Previsão',
   'Baseline: >=300 pedidos/30d → 0,75; >=100 → 0,60; >=30 → 0,45; senão 0,30. Cresce com o volume de dados reais.',
   'service_orders via orion_prever_demanda')
ON CONFLICT (sigla, versao) DO UPDATE
  SET formula = EXCLUDED.formula, fonte = EXCLUDED.fonte;

-- Consulta pública (admin) do registro de índices vigentes
CREATE OR REPLACE FUNCTION orion_indices_vigentes()
RETURNS TABLE (sigla text, versao int, nome text, formula text, fonte text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;
  RETURN QUERY
  SELECT i.sigla, i.versao, i.nome, i.formula, i.fonte
  FROM orion_indices i WHERE i.ativo
  ORDER BY i.sigla, i.versao DESC;
END; $$;
GRANT EXECUTE ON FUNCTION orion_indices_vigentes() TO authenticated;
