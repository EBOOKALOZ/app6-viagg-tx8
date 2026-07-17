# ORION-AI-43 — API (RPCs)

RPCs PostgREST: `POST https://broifhfqmnzqoongtokm.supabase.co/rest/v1/rpc/<funcao>`
(header `apikey` + JWT). Guarda: admin/service — anon é negado (provado: `correlate`
retorna P0001; tabelas retornam 42501, sem SELECT para anon).

Mapa espec → RPC:

| Espec | RPC | Descrição |
|---|---|---|
| `/api/threat` | `threat_dashboard()` | payload completo (overview + graph + campaigns + correlations + vulnerabilities + metrics + lacunas) |
| `/api/threat/campaigns` | `threat_campaigns()` | campanhas com CRS, entidades e evidências |
| `/api/threat/correlations` | `threat_correlations()` | relações por tipo + top por peso, com evidências |
| `/api/threat/graph` | `threat_graph()` | nós (≤80 por risco) + arestas (≤200 por peso) + contagem por tipo |
| `/api/threat/vulnerabilities` | `threat_vulnerabilities()` | abertas/mitigadas/críticas/recorrentes + lista com VIS/mitigação |
| `/api/threat/explain` | AI-00 Gateway com `prompt_key` `threat.campaign` / `threat.correlation` / `threat.vulnerability` / `threat.mitigation_priority` / `threat.executive_report` | explicações GPT-5-mini sobre evidências |

## Motor / escrita (auditados, admin/service)

| RPC | Efeito |
|---|---|
| `correlate_security_events(p_trace?)` | constrói grafo + correlações + campanhas (incremental, idempotente). **Retorna** `{campanhas, relacoes, nos_total, prioridade, evidencias_nota}` |
| `threat_scan_vulnerabilities()` | postura + ataques recorrentes → `orion_vulnerability_events` |
| `threat_scan_intelligence()` | IOCs de alto risco (nós risco≥60) → `orion_threat_intelligence` |
| `threat_statistics_rollup()` | rollup diário (TIS/MTTC/TRR/tendência) |
| `threat_mark_campaign(p_campaign_id, p_status)` | admin: ativa/mitigada/resolvida/falso_positivo (auditado) |
| `threat_rollback(p_trace)` | admin: reverte correlações+campanhas de um trace (linha de bus; persistem revertidas) |
| `orion_threat_tick()` | pg_cron `*/3`: correlate → vuln → intel → stats |

## Exemplo — `correlate_security_events`

```json
POST /rest/v1/rpc/correlate_security_events  {"p_trace":"manual"}
→ {
  "ok": true, "trace": "manual",
  "nos_total": 14, "relacoes": 3,
  "campanhas": [{"id":1,"nome":"Repeticao de fraud:pagamentos_identicos","severidade":"critica","crs":100}, ...],
  "prioridade": [{"node":"attack:fraud:documento_duplicado","risk":100}, ...],
  "evidencias_nota": "toda relacao tem evidencia; IP/ASN/dispositivo DECLARADOS (sem dado no ambiente)"
}
```

Recebe (implicitamente, do barramento): eventos/sessões/ataques/fraudes/identidade.
Retorna: campanhas, relações, evidências e prioridade — conforme a espec.
