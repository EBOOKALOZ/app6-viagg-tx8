# ORION-AI-47 — Zero Trust AI · Dashboard

> **`/admin/orion-zero-trust`** · badge **ZERO TRUST** (sidebar ORION AI CENTER,
> ícone Lock, tema verde-esmeralda) · fonte única RPC `zerotrust_dashboard()`
> (auto-refresh 60s). Página `src/pages/admin/AdminOrionZeroTrust.tsx`.

## Header
Score Geral Zero Trust (ZTG, destaque) + ZTS médio (chip) + 6 cards:
decisões/min (última 1h), permitidas hoje, negadas hoje, autenticações
adicionais, sessões monitoradas, dispositivos em risco.

## 9 abas

1. **Resumo** — ZTS/RCS médios, decisões hoje, usuários de risco alto; sessões
   com bloqueio recomendado, dispositivos confiáveis, políticas/exceções ativas;
   painel de **lacunas declaradas**.
2. **Sessões** — chips por estado (validada/monitorada/reavaliar/bloqueio
   recomendado) + lista por menor SAS com evidências (avaliação contínua).
3. **Dispositivos** — chips por estado (confiável/monitorado/em risco/bloqueado)
   + lista por menor DAS; bloqueio físico remete ao AI-42.
4. **Políticas** — políticas por escopo com faixas de RCS e exceções temporárias
   + trilha de alterações (antes/depois do cofre).
5. **Decisões** — chips por decisão do dia + lista imutável com justificativa,
   scores, política, origem; **botão Revogar** (linha compensatória).
6. **Riscos** — risco acumulado por usuário com componentes explicáveis
   (cyber/fraude/identidade/plataforma; AI-45/46 declarados).
7. **Evidências** — cofre append-only (contagem por tipo + últimas 30);
   evidências NUNCA removidas.
8. **Estatísticas** — tabela diária (decisões, permitidas, monitoradas,
   reautenticações, MFA, aprovações, bloqueios, negadas, ZTS/RCS/ZTG).
9. **Configurações** — cron + métricas; **botão "Rodar suíte de testes (COMANDO
   TESTE)"** (`zerotrust_selftest`) com último relatório; integrações AI-40..46
   (AI-45/46 mostram "não construído/detectado" conforme a superfície).

## Cores e semântica
- Scores (ZTS/DAS/SAS/RCS/ZTG): verde ≥80 · lima ≥60 · âmbar ≥40 · vermelho <40.
- Decisões: permitir (verde) → negar (vermelho forte); revogada (cinza).
- Estados de sessão/dispositivo: paleta própria (validada/confiável verde …
  bloqueio_recomendado/em_risco vermelho).
- Tema esmeralda distingue o AI-47 do IDENTITY (índigo), FRAUD/CYBER (vermelho),
  THREAT/AUDIT/INCIDENT (irmãos do ecossistema).

## Honestidade do painel
- Toda decisão e todo score exibem evidências (componentes + fórmulas).
- `exigir_mfa` sempre acompanhado da nota de degradação (MFA=0 DECLARADO).
- Ações de alto impacto explicitam serem recomendação/execução humana.
- O botão de testes grava o relatório no cofre e mostra verde/falhas na hora.
