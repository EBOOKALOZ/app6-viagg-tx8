# ORION-AI-55 — Predictive Intelligence AI v1.0

**Missão:** transformar o histórico REAL da plataforma em previsões com **confiança, margem de erro, modelo e fatores** — nunca inventa. Pré-lançamento (11 usuários, séries curtas) = modelos estatísticos explicáveis (`regr_slope`) + heurísticas com evidência; **acurácia medida por BACKTEST** previsto×realizado (MAE) conforme o histórico cresce.

**Chave:** `predictive_intelligence` · **Painel:** `/admin/orion-predictive` (badge **PREDICTIVE**) · **Modelo:** gpt-5-mini · **Cron:** `orion_predict_tick` a cada 10 min

## Anti-colisão
**AI-16 `forecast`** (orion_forecast_snapshots) já prevê demanda com previsto×realizado → AI-55 **LÊ**; AI-52 prevê custos (LÊ); AI-54 fornece série diária (LÊ); AI-07 Growth = score por cidade (distinto). Namespace **`orion_predict_*`** (7 tabelas). Edge de treino/inferência = **DECLARADA desnecessária** (motor no banco; volumes atuais).

## 12 camadas da spec → implementação honesta
Crescimento/receita/demanda/financeiro: projeção linear sobre séries reais 30d (usuários, cliques, receita paga, custo AI-52) × **7 horizontes** (7..365d). Demanda por hora: histograma real dos cliques. Expansão: ranking por cidade (cliques+contatos reais — bairro/CEP/região **declarados**). Churn + comportamento: score por usuário (inatividade/cliques/tem_loja — `credit_purchases` é por **store_id**, drift verificado) com classe/probabilidade/fatores/recomendação, **sem PII**. Tendências: variação real 7d×7d (categorias de produto declaradas — catálogo vazio). Capacidade: corridas previstas ÷ 10/dia/motoboy (volume ~0 declarado). Simulador `simulate_future(cenario)`: what-if linear com **elasticidades DECLARADAS** editáveis, log imutável. Clima/feriados/eventos/ML pesado = **DECLARADOS**.

## APIs
`run_predict_check()` (motor) · `predict_dashboard()` · `predict_domain(dominio)` (growth/revenue/demand/expansion/capacity/finance) · `simulate_future(jsonb)` · `predict_summary()`. Scores: **PAS** (100−MAE·10; 30 enquanto sem histórico) · **PCS** (média das confianças) · **PIS** = (PAS+PCS)/2.

## COMANDO TESTE
`SELECT predict_selftest()` — **14/14** (motor, 7 horizontes, 6+ domínios, explicabilidade, churn em 100% dos usuários, simulador+log imutável, backtest, RLS, cron).

## 1ª execução real (2026-07-17)
PIS 30 (série curta declarada) · tendência marketplace **alta** · **6 usuários churn alto/crítico** (metade da base inativa 14d+, com recomendação de reativação) · previsões em 6 domínios · backtest armado (MAE preenche sozinho D+1). Armadilhas: `round(dp,int)` não existe (cast `::numeric`); `credit_purchases` sem user_id (por loja).
