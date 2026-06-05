/*
  Garante que `whatsapp_groups.group_link` seja único no banco.
  Passos:
    1. Limpa duplicatas existentes (mantém o registro mais antigo de cada link).
    2. Cria índice UNIQUE no campo group_link.
  Após esta migration o próprio Postgres barra qualquer INSERT de link já existente
  com código 23505 (unique_violation) — mesmo em corridas concorrentes.
*/

/* 1. Dedup: para cada group_link com >1 linha, mantém a mais antiga e apaga as demais. */
WITH ranked AS (
  SELECT
    id,
    group_link,
    ROW_NUMBER() OVER (
      PARTITION BY group_link
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.whatsapp_groups
  WHERE group_link IS NOT NULL AND group_link <> ''
)
DELETE FROM public.whatsapp_groups w
USING ranked r
WHERE w.id = r.id
  AND r.rn > 1;

/* 2. Cria constraint UNIQUE no group_link.
   Usa CREATE UNIQUE INDEX em vez de ALTER TABLE ... ADD CONSTRAINT
   pra permitir que registros com group_link NULL/vazio convivam (índices únicos
   no Postgres aceitam múltiplos NULLs por padrão). */
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_groups_group_link_uniq
  ON public.whatsapp_groups (group_link)
  WHERE group_link IS NOT NULL AND group_link <> '';

COMMENT ON INDEX public.whatsapp_groups_group_link_uniq IS
  'Bloqueia duplicatas de group_link entre motoboys. Violação → SQLSTATE 23505.';
