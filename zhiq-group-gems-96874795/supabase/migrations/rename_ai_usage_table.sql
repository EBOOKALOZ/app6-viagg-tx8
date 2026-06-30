-- Migration: renomear glm_usage_log → ai_usage_log
-- Execute no Supabase Dashboard → SQL Editor quando estiver pronto.
--
-- ANTES de rodar:
--   1. Altere AI_USAGE_TABLE em src/lib/ai/config.ts para "ai_usage_log"
--   2. Faça deploy do frontend com essa mudança
--   3. ENTÃO rode este SQL
--
-- As políticas RLS e índices se movem automaticamente com a tabela no PostgreSQL.

ALTER TABLE IF EXISTS glm_usage_log RENAME TO ai_usage_log;

-- Compatibilidade: view que mantém o nome antigo funcionando (opcional)
-- CREATE OR REPLACE VIEW glm_usage_log AS SELECT * FROM ai_usage_log;
