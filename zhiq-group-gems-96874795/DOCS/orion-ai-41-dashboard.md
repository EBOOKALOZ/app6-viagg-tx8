# ORION-AI-41 — Dashboard `/admin/orion-fraud` (badge FRAUD)

Fonte única: `fraud_dashboard()` (refetch 60s). Arquivo: `src/pages/admin/AdminOrionFraud.tsx`.
Sidebar: grupo ORION → **Fraud Detection AI** (ícone ShieldAlert, badge **FRAUD**).

## Header (7 painéis)

FS médio (cor por faixa) · críticas abertas · fraudes hoje · em análise · confirmadas ·
perdas evitadas 30d (BRL) · FPR · tendência 7d (Δ vs 7d anteriores).

## Abas (7) — ~34 painéis

1. **Visão Geral** — 4 cards de score (FS/FR/FT/FC com explicação); tabela de
   estatísticas 7 dias (detectadas/confirmadas/FP/ELP/tempo de resposta, com a nota
   "ELP = estimativa DECLARADA"); trilha de ações da política (imutável, com botão
   **rollback** por ação → linha compensatória); lacunas declaradas (6).
2. **Contas & Usuários** — casos de conta (documento/telefone/e-mail/dispositivo) +
   comportamento (automação, mudança brusca). Cada caso: severidade, FS, FC, status,
   **evidências JSON expandíveis**, botões **Confirmar fraude** / **Falso positivo**.
3. **Marketplace** — auto-clique, auto-interesse, spam de interesse + exploração de
   IA/algoritmos (ranking/recomendações).
4. **Delivery & Corridas** — velocidade impossível, corrida instantânea, cancelamento
   em massa, conluio; nota de lacuna (tabelas sem volume; GPS = telemetria do app).
5. **Financeiro** — pagamentos idênticos, estornos repetitivos, créditos (rajada/pago
   sem valor); nota de lacuna (cupons/cashback/carteira).
6. **Heatmap** — barras por **cidade**, **estado**, **categoria** e **hora do dia**
   (cidade/estado via perfil do usuário envolvido — eventos sem user_id declarados fora).
7. **Ranking** — padrões mais frequentes (com risco e descrição do critério),
   usuários reincidentes, lojas em análise, tipos de fraude.

## Ações no painel

- `fraud_mark(id, status)` — Confirmar fraude / Falso positivo (some da lista ativa,
  entra no FPR/FDR; toda marcação vira linha de auditoria).
- `fraud_action_rollback(action_id)` — reverte ação automatizada (recusa duplo rollback).
- Guarda: tudo exige admin (RLS + guarda nas funções); anon negado.
