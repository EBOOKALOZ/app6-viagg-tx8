# ORION-AI-52 — Cost Optimization AI v1.0

**Missão:** Controlador Financeiro Técnico — monitora/analisa/prevê/otimiza os custos operacionais da plataforma com **uso REAL medido**. Recomenda com economia/impacto/risco; **nada é aplicado automaticamente**; nunca acessa/expõe credenciais (só métricas agregadas).

**Chave:** `cost_optimization` · **Painel:** `/admin/orion-cost-optimization` (badge **COST**) · **Modelo:** gpt-5-mini · **Cron:** `orion_cost_tick` a cada 15 min

## Anti-colisão
**AI-37 `ai_center` = CFO das IAs** → AI-52 **LÊ** `orion_ai_costs`/`orion_ai_log` (nunca recalcula custo de IA). AI-38 = governança de custo de IA. AI-04 finance = dinheiro do NEGÓCIO (pay_*). **AI-52 = custo TÉCNICO da plataforma.** Namespace `orion_cost_*`, funções `cost_*`/`run_cost_check`. Mapa spec→real: 10 tabelas → 8 (metrics→usage; alerts→anomalias tipo orçamento).

## Medições reais
`pg_database_size` (DB 87MB) · `storage.objects` (482 obj/141MB) · IA via AI-37 · execuções de cron (`job_run_details`) · chamadas do Gateway. **Custo = uso real × preço unitário CONFIGURADO** (preços Supabase declarados/editáveis em `orion_cost_services`; billing API inacessível do SQL). Centros de custo dinâmicos (INSERT). LACUNAS DECLARADAS: CPU/memória/rede/CDN/Realtime (sem métrica SQL), sazonalidade (histórico curto), billing oficial.

## Motor `run_cost_check()` (idempotente)
Mede uso do dia → orçamentos realizado×previsto (mensal/anual/por serviço) → **forecasts 7/30/90/180/365d** (média diária 7d linear; limitações declaradas) → **anomalias** (custo >2× média 7d; orçamento estourado — dedupe/dia) → **recomendações com evidência** (tabelas grandes p/ arquivamento, módulos de IA mais caros, cache do Gateway baixo) → statistics + history imutável + eventos no barramento (`cost_optimization` — AI-49 SOC e AI-51 Observability leem).

## Scores (explicáveis)
**COS** = 100 − 20·anom.críticas − 10·abertas − 5·recs P1 − 20·orçamentos estourados · **CES** = cache_rate×100+40 · **RIS** = 95 fixo DECLARADO (87MB/8GB dentro do plano; CPU/mem sem métrica) · **FAS** = % serviços com fonte medida · **BCS** = % orçamentos dentro do limite.

## COMANDO TESTE
`SELECT cost_selftest()` — **12 checks 12/12** (motor, medições, forecasts, orçamento estoura→anomalia, recomendações com evidência, scores, imutabilidade, RLS, cron).

## 1ª medição real (2026-07-17)
Custo do dia **$0,85** (plano base pro-rata + storage + IA); COS 85 · CES 57 · FAS 83 · BCS 100; 4 recomendações abertas com economia estimada. APIs: `cost_dashboard()`, `cost_scores()`, `cost_summary()`, `cost_set_budget(escopo, limite, periodo)`. Prompts: `cost.summary/forecast/optimization/anomaly/recommendation`.
