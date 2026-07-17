# ORION-AI-41 — API (RPCs)

A plataforma é SPA (Vite) — as "APIs" do módulo são **RPCs PostgREST**:
`POST https://broifhfqmnzqoongtokm.supabase.co/rest/v1/rpc/<funcao>`
(header `apikey` + JWT; guarda: admin/service — anon é negado, provado na homologação).

Mapa espec → RPC:

| Espec | RPC | Descrição |
|---|---|---|
| `/api/fraud` | `fraud_dashboard()` | payload completo do painel (overview + 6 categorias + heatmap + ranking + metrics + lacunas) |
| `/api/fraud/events` | `fraud_panel(p_categoria)` | eventos por categoria (`conta`,`marketplace`,`delivery`,`financeiro`,`usuario`,`ia`) com evidências |
| `/api/fraud/statistics` | `fraud_metrics()` + tabela `orion_fraud_statistics` | séries diárias: detectadas/confirmadas/FP/ELP/resposta |
| `/api/fraud/alerts` | `fraud_overview()` | KPIs: FS/FR/FT/FC, fraudes hoje, em análise, críticas abertas, ELP 30d, FPR/FDR, tendência |
| `/api/fraud/explain` | AI-00 Gateway com `prompt_key` `fraud.explain` / `fraud.evidence` / `fraud.false_positive` / `fraud.action` / `fraud.financial_report` | explicações GPT-5-mini sobre as evidências |
| `/api/fraud/risk` | `detect_fraud(p_tipo, p_id)` | score sob demanda de uma entidade (pedido/pagamento/usuário/evento) |

## RPCs de escrita (auditadas)

| RPC | Quem | Efeito |
|---|---|---|
| `fraud_scan(p_trace?)` | admin/service | roda os 17 detectores (incremental, idempotente) |
| `fraud_respond()` | admin/service | aplica a política `fraud_politica_v1` (ações + alertas; nunca bloqueia) |
| `fraud_mark(p_fraud_id, p_status, p_motivo?)` | admin | marca `confirmada`/`falso_positivo`/`resolvida`/`em_analise` (linha de auditoria) |
| `fraud_action_rollback(p_action_id, p_motivo?)` | admin | reverte ação automatizada por **linha compensatória**; recusa duplo rollback |
| `fraud_patterns_rollup()` / `fraud_statistics_rollup()` | admin/service | rollups idempotentes (padrões / estatísticas do dia) |
| `orion_fraud_tick()` | pg_cron `*/2` | scan → respond → rollups |

## Exemplo — `detect_fraud`

```json
POST /rest/v1/rpc/detect_fraud  {"p_tipo":"user","p_id":"<uuid>"}
→ {
  "entidade": {"tipo":"user","id":"..."},
  "eventos_ativos": 1, "fraud_score": 75, "financial_risk": 40,
  "trust_score": 40, "confidence": 90, "risco": "alto",
  "acao_recomendada": "validacao_adicional",
  "eventos": [{"tipo":"auto_interesse","evidencias":{"criterio":"telefone do visitante = telefone do proprio anunciante (aci)", ...}}],
  "nota": "toda classificacao tem evidencia; acoes de alto impacto exigem aprovacao humana"
}
```

`p_tipo` aceita `entidade_tipo` (`user`,`documento`,`telefone`,`dispositivo`,`pagamento`,
`loja`,`visitante`,`corrida`,`par`) ou uma categoria; `null` = qualquer. O `p_id` casa
contra `entidade_id`, `user_id`, `merchant_id` e `order_id`.
