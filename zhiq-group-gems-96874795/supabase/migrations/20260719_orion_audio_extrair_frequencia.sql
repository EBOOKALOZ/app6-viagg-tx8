-- Extrai frequência FM/AM do NOME/tags (ex.: "Rádio Mix 106.3 FM" -> "106.3")
-- e preenche a coluna frequency. Adiciona a freq ao search_text (via trigger de enrich).
-- Padrões: 87-108 (FM) ou 3-4 digitos (AM). Aceita ponto ou vírgula.
WITH extraidas AS (
  SELECT id,
    (regexp_match(
       concat_ws(' ', name, tags),
       '(?<![0-9])(1?[0-9]{2}[.,][0-9])(?![0-9])'   -- ex.: 106.3 / 89,9 / 105.7
     ))[1] AS freq_dec,
    (regexp_match(concat_ws(' ', name, tags), '(?<![0-9.,])(8[7-9]|9[0-9]|10[0-8])(?![0-9.,])'))[1] AS freq_int
  FROM orion_audio_radio_curated
  WHERE (frequency IS NULL OR frequency = '')
)
UPDATE orion_audio_radio_curated c
   SET frequency = replace(coalesce(e.freq_dec, e.freq_int), ',', '.')
  FROM extraidas e
 WHERE c.id = e.id AND coalesce(e.freq_dec, e.freq_int) IS NOT NULL;

-- reindexa o search_text (aciona o trigger de enrich, que inclui frequency)
UPDATE orion_audio_radio_curated SET frequency = frequency WHERE frequency IS NOT NULL AND frequency <> '';

SELECT count(*) FILTER (WHERE frequency IS NOT NULL AND frequency <> '')::int AS com_frequencia,
       count(*)::int AS total,
       (SELECT string_agg(name || ' -> ' || frequency, ' | ') FROM (SELECT name, frequency FROM orion_audio_radio_curated WHERE frequency IS NOT NULL AND frequency <> '' LIMIT 6) x) AS amostra
FROM orion_audio_radio_curated WHERE ativo;
