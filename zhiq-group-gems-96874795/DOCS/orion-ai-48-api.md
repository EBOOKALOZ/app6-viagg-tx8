# ORION-AI-48 — API (Compliance & LGPD)

Escritas só via RPC DEFINER com guarda admin/service (`compliance_guard`); leituras RLS `mp_is_admin()`; anon não lê nada; helpers internos sem EXECUTE público.

## Motor
- `run_compliance_check(p_trace?)` — controles + retenção medida + solicitações vencidas + incidentes de privacidade (dedupe/auto-resolve) + ponte AI-45 + alertas + rollup. Idempotente.

## Direitos do titular
- `lgpd_request_open(p_tipo, p_user?, p_detalhes?)` — tipos: acesso|correcao|exclusao|anonimizacao|portabilidade|revogacao|oposicao; prazo 15d.
- `lgpd_request_update(p_id, p_status, p_nota?)` — em_analise|concluida|negada; evidência a cada passo. Execução de exclusão/anonimização é HUMANA.

## Leituras
- `compliance_dashboard()` — scores/controles/requests/registry/retention/incidents/alerts/statistics/evidence_count.
- `compliance_scores()` — CPS/LCS/DRS/PRS + fórmula + base. `compliance_summary()` — contexto p/ IA.

## Testes
- `compliance_selftest()` — 14 checks; entrada oficial do COMANDO TESTE.

## Prompts (Registry)
`compliance.audit` · `lgpd.evaluate` · `privacy.summary` · `compliance.recommendation` · `compliance.risk`

## Cron
`orion_compliance_tick` `*/15 * * * *` (ativo). Sem edge: motor no banco; disparo manual pelo painel.
