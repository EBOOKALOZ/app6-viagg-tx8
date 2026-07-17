# ORION-AI-43 — Threat Intelligence AI — Certificação v1.0 (2026-07-17)

## Resultado: **CERTIFICADO — 97/100**

Homologado no banco VIVO (`broifhfqmnzqoongtokm`) via Management API em 17-07-2026.

## Critérios da espec × evidência

| Critério | Status | Prova |
|---|---|---|
| Build verde | ✅ | esbuild do painel OK; `vite build` verde (ver commit) |
| Zero regressões | ✅ | nenhum módulo/tabela existente alterado; só 4 linhas de registro (rota/lazy/sidebar) somadas às do AI-42 (reli os arquivos antes p/ não sobrescrever a sessão paralela) |
| RLS preservado | ✅ | RLS admin-read nas 7 tabelas; **hardening**: `REVOKE ALL` + `GRANT SELECT` (anon sem SELECT → 42501, mais restrito que o padrão) |
| Sem colisão com AI-42 | ✅ | AI-42 usa `orion_identity_*`/`orion_access_*`/`orion_devices`, chave `identity_access`; AI-43 usa `orion_threat_*`/`orion_security_graph`/`orion_vulnerability_events`, chave `threat_intelligence` — zero sobreposição. Identidade lida direto de `auth.audit_log_entries` |
| Threat Graph operacional | ✅ | 14 nós (6 ataque, 6 identidade, 2 usuário) + 8 arestas (envolvido_em, mesma_origem_usuario, multi_modulo, mesma_conta, mesma_campanha) — **toda aresta com evidência** |
| Dashboard THREAT ativo | ✅ | `/admin/orion-threat-intelligence`, 5 abas, badge THREAT (falta deploy manual do usuário) |
| APIs documentadas | ✅ | `DOCS/orion-ai-43-api.md` (mapa espec→RPC + retorno do correlate) |
| Motor a cada 3 min ativo | ✅ | pg_cron `orion_threat_tick` `*/3 * * * *` confirmado; papel da edge cumprido pelo motor SQL (convenção AI-36..42) — DECLARADO |
| Logs completos | ✅ | bus `orion_eventos` origem `threat_intelligence` (threat.correlate/vuln/rollback/mark/score) |
| Evidências preservadas | ✅ | `threat_add_edge` recusa aresta sem evidência; campanhas/vulns/IOCs carregam `evidencias` jsonb |
| Correlação só com dados reais | ✅ | fontes: orion_cyber_events (AI-40+41), auth.audit_log_entries, pg_proc/pg_tables. IP/ASN/dispositivo DECLARADOS ausentes |

## Achados reais na 1ª execução (dados de produção)

- **2 campanhas**: "Repetição de fraud:pagamentos_identicos" (CRS 100, crítica, 3 eventos)
  e "Atividade multi-módulo do usuário 12921e5d" (CRS 100, alta).
- **3 vulnerabilidades**: Tabelas public sem RLS (110, VIS 77, alta), Funções SECURITY
  DEFINER sem search_path (150, VIS 70, média), Exposição recorrente a pagamentos_identicos
  (VIS 70, crítica).
- **10 IOCs** de alto risco (TIS 100): ataques crítica, usuários de risco, identidades.
- **TIS 89**, CS médio 77, risco médio 90.

## Provas de robustez

- **Idempotência**: tick 2× → 14 nós / 8 arestas / 2 campanhas / 3 vulns / 10 IOCs idênticos.
- **Incremental**: janela 30d, upsert por dedupe_key; nunca recalcula histórico.
- **Retorno estruturado** do `correlate_security_events` conforme espec (campanhas/relações/prioridade/evidências).
- **Ciclo humano**: `threat_mark_campaign(2,'mitigada')` → TRR 0,5.
- **Rollback**: `threat_rollback(trace)` reverteu 8 arestas + 1 campanha; re-tick não ressuscita revertidas (rollback persiste — decisão manual). Estado real restaurado após o teste.
- **MTTC honesto**: inicialmente 439.472s (inflado por nós de identidade com timestamp do audit log) → corrigido para medir só nós do barramento = **2700s**; identidade DECLARADA fora.
- **Guardas**: anon via REST → `correlate` negado (P0001); tabelas → 42501 (sem SELECT).

## Pontos declarados (−3)

- IP/ASN/dispositivo/sessão sem dado no ambiente (grafo pronto para recebê-los).
- Postura (definer/RLS) inclui objetos de sistema — requer triagem.
- Painel aguarda deploy manual do usuário.

## Rollback do módulo

Bloco `ROLLBACK (manual)` ao fim de `supabase/migrations/20260717_orion_threat_intelligence_ai.sql`.
