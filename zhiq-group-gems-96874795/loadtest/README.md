# ORION-480 — Suíte de Teste de Carga (preparação, não executada)

Este diretório contém a suíte de teste de carga progressivo do ORION-480
(25k → 900k usuários virtuais sintéticos), **preparada mas não executada**.
Nenhum tráfego foi gerado, nenhuma dependência foi instalada, nada foi
implantado ou alterado em produção ao criar estes artefatos.

## Por quê "só preparação"

O `.env` atual do projeto aponta para
`https://broifhfqmnzqoongtokm.supabase.co`, que é o Supabase de
**produção** usado por este app (mesmo projeto referenciado em todas as
auditorias de segurança anteriores). Rodar qualquer VU contra esse host
geraria tráfego real em produção. Este kit só deve ser executado contra
um projeto Supabase de **staging** isolado — ver
`docs/CHECKLIST_STAGING.md` para os pré-requisitos, nenhum dos quais foi
provisionado aqui.

## Leitura recomendada, nesta ordem

1. `docs/ARQUITETURA.md` — visão geral, estrutura de arquivos, escopo e
   fora-de-escopo.
2. `docs/FERRAMENTA-K6-VS-ARTILLERY.md` — por que k6 foi escolhido.
3. `docs/CHECKLIST_STAGING.md` — o que precisa existir antes de rodar
   qualquer etapa, mesmo a de 25k.
4. `docs/DISTRIBUICAO.md` — como escalar a geração de carga além de 1 PC.
5. `docs/LIMITES.md` — métricas obrigatórias, thresholds, e como
   diferenciar limite do PC / do gerador / da aplicação / do Supabase.
6. `docs/EXECUCAO.md` — passo a passo de uma execução futura + modelo de
   relatório por etapa.

## Estrutura

```
loadtest/
  k6/main.js               script principal (options, thresholds, dispatcher)
  k6/lib/                  guarda anti-produção, config, métricas, auth, seed
  k6/scenarios/            13 cenários por domínio
  config/progression.json  matriz oficial 25k -> 900k
  config/.env.example      template de variáveis (sem segredos)
  docs/                    documentação completa
  run-stage.sh             monta/roda o comando k6 de UMA etapa por vez
```

## Pré-requisitos ainda pendentes (nada disto foi feito)

- k6 **não está instalado** neste ambiente.
- Nenhum projeto Supabase de staging foi identificado/criado.
- Nenhum dado de seed sintético foi gerado.
- Nenhum usuário de teste foi provisionado.

Ver `docs/CHECKLIST_STAGING.md` para a lista completa antes de cogitar a
primeira execução real (S0, 25k VUs).

## Como uma execução futura seria disparada (não fazer agora)

```bash
cp loadtest/config/.env.example loadtest/config/.env.staging
# preencher .env.staging com dados REAIS de STAGING (nunca produção)

./loadtest/run-stage.sh S0 --dry-run   # confere o comando montado
./loadtest/run-stage.sh S0             # executa a etapa 25k, com confirmação interativa
```

Cada etapa seguinte (`S1`...`S10`) só deve rodar após análise e aprovação
explícita da etapa anterior — ver `docs/EXECUCAO.md`.
