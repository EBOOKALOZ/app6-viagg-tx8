# ORION-480 — Guia de execução futura (NÃO executar sem staging pronto)

Este documento descreve como uma execução real seria conduzida quando o
`docs/CHECKLIST_STAGING.md` estiver 100% concluído. Nada aqui foi rodado
por esta preparação.

## Passo a passo por etapa

1. Confirmar que a etapa anterior foi analisada e aprovada (exceto S0,
   primeira execução).
2. Preencher/atualizar `loadtest/config/.env.staging` (a partir de
   `.env.example`) com os valores de staging da campanha atual.
3. Rodar em modo dry-run primeiro, para conferir o comando montado:
   ```
   ./loadtest/run-stage.sh S0 --dry-run
   ```
4. Rodar de fato (pede confirmação interativa `sim`):
   ```
   ./loadtest/run-stage.sh S0
   ```
5. Durante a execução, acompanhar em paralelo:
   - Output do k6 no terminal (progresso de VUs, thresholds).
   - Supabase Dashboard (Database Reports, Edge Functions Logs, Realtime).
   - Monitor de CPU/RAM do host gerador.
6. Ao final, o `handleSummary()` grava
   `loadtest/results/summary-<STAGE_LABEL>.json` e imprime um resumo
   textual no stdout.
7. Aguardar a janela de recuperação (5-10min) e registrar o teste de
   recuperação (`docs/LIMITES.md`).
8. Preencher o relatório da etapa (modelo abaixo).
9. Decidir: **aprovar próxima etapa** ou **bloquear e corrigir**. Só
   prosseguir para a etapa seguinte após decisão explícita — nunca
   automático.

## Modelo de relatório por etapa

```markdown
# ORION-480 — Relatório da Etapa <ID> (<N> VUs)

## Resultado
- VUs alvo: <N>          VUs efetivamente ativos (pico): <N observado>
- Duração total (ramp-up + platô + ramp-down): <...>
- Distribuição de cenários usada: <pesos efetivos, se diferentes do default>

## Métricas
- RPS médio / pico: <...>
- Throughput: <...>
- P50 / P95 / P99: <...> ms
- Taxa de sucesso: <...>%
- HTTP 4xx: <...>   HTTP 5xx: <...>   Timeouts: <...>
- Rate limited (negócio, esperado): <...>
- CPU do gerador (pico): <...>%     RAM do gerador (pico): <...>
- Rede do gerador: <...>
- Conexões de banco (Supabase Dashboard): <...>
- Latência de banco: <...>
- Edge Functions — erros/latência: <...>
- Realtime — conexões / falhas / latência de mensagem: <...>
- Filas observadas: <...>

## Diferenciação de limites (A/B/C/D — ver docs/LIMITES.md)
- <qual categoria explica cada anomalia observada, se houve>

## Teste de recuperação
- CPU/RAM do servidor voltou ao baseline em: <tempo>
- Conexões voltaram ao normal: sim/não
- Filas drenaram: sim/não
- Erros residuais: <...>
- Estabilidade pós-teste: <...>

## Gargalo encontrado
- <descrição, com evidência: log, métrica, categoria A/B/C/D>

## Erros e limitações
- <...>

## Recomendação
- **APROVAR próxima etapa (<ID seguinte>)** ou
- **BLOQUEAR — investigação necessária**: <motivo específico>
```

## Regra fundamental (repetida de propósito)

Não existe "modo automático" que avança sozinho de etapa em etapa neste
kit — `run-stage.sh` roda exatamente **uma** etapa por chamada e pede
confirmação interativa. Isso é deliberado: a decisão de avançar é humana,
baseada na análise do relatório acima, nunca disparada pelo script.
