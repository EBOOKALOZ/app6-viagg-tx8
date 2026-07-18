# ORION-AI-74 — Trust & Reputation AI v1.0

**Chave técnica:** `trust_reputation` · **Namespace:** `orion_rep_*` · **Painéis:** `/admin/orion-trust-center` (admin) + `/minha-reputacao` (usuário)
**Data:** 2026-07-18 · **Status:** 🟢 VIVO em produção (selftest 14/14)

## O que é (e o que NÃO é)

Camada de **reputação por USUÁRIO** do ecossistema: calcula um **Trust Score 0–100 explicável** para cada conta (comprador, vendedor, participante de leilões), concede **selos**, monitora **verificações**, emite **alertas** e **recomendações**.

- **NÃO substitui o AI-20** (`trust`, `orion_trust_*`): o AI-20 pontua ENTIDADES (account/merchant/listing/buyer). O AI-74 é a visão por usuário e **REUSA** AI-20/41/42/ALC como fontes (mesmo padrão AI-59↔AI-30).
- **RECOMENDA, nunca executa**: nenhum bloqueio, limite ou benefício é aplicado pela IA — tudo vira recomendação para decisão humana.
- **READ-ONLY sobre o domínio**: escreve somente em `orion_rep_*` (provado no selftest).

## Trust Score — faixas (spec)

| Faixa | Nível |
|---|---|
| 95–100 | Elite |
| 80–94 | Excelente |
| 65–79 | Confiável |
| 50–64 | Regular |
| 30–49 | Atenção |
| 0–29 | Alto Risco |

## Modelo de score (explicável, 7 pilares)

Peso redistribuído quando o pilar não tem base (declarado em `_auditoria.pilares_ausentes`) — usuário sem vendas não é punido no pilar vendedor.

| Pilar | Peso | Fontes reais |
|---|---|---|
| Cadastro | 15 | `profiles` (tempo de conta, perfil completo, termos) |
| Verificação | 20 | `auth.users` (e-mail/telefone confirmados), `profiles` (CPF/CNPJ, telefone), **AI-42** `orion_identity_profiles` (identity_score) |
| Financeiro | 20 | `pay_payment_orders` — `customer` por `payer_owner_id`; `merchant_store` por `created_by`; **`platform` (institucional) excluído por design**; status ENUM→`::text` |
| Comprador | 10 | `orion_alc_deals` (concluídos×cancelados) + `orion_alc_ratings` (estrelas recebidas) |
| Vendedor | 10 | `advertiser_listings`+`product_listings` (foto+descrição), `advertiser_contact_intentions` (conversão de leads), deals como seller |
| Leilão | 10 | `auction_bids`, `orion_auction_settlements` (arremates honrados = `pagamento_ok`), `orion_alc_disputes` |
| Risco | 15 | **AI-41** `orion_fraud_events` (aberto = status ∉ falso_positivo/resolvida/descartada; desconta `trust_impact`), disputas contra, `support_tickets` 30d |

Todo score carrega `fatores` (7 objetos com subscore, peso, evidência com contagens e fonte) + `_auditoria` (pilares ausentes, lacunas declaradas, reuso).

## Lacunas DECLARADAS (nunca inventadas)

- Confirmação **facial** — sem fonte na plataforma (`orion_rep_verifications.facial = indisponivel`).
- **Taxa/tempo de resposta** de mensagens — sem fonte.
- **Devoluções** — sem tabela.
- **AutoBid (AI-72)** e **Dynamic Pricing (AI-73)** — integrações por descoberta; hoje ausentes/sem dados no registry (`orion_dprice_history` existe, vazio de sinal por usuário).

## Selos (10, automáticos, com evidência e revogação auditável)

vendedor_verificado · comprador_verificado · pagador_pontual · entrega_confiavel · top_vendedor · top_comprador · especialista_leiloes · alta_reputacao · excelente_atendimento · negociacao_segura
Revogação: queda para alto_risco ou fraude aberta revoga (nunca apaga) selos de confiança.

## Alertas

queda_rapida (−15 pts vs 7d) · fraude_potencial (AI-41 aberto) · reclamacoes_recorrentes (≥3 tickets/30d) · melhora_significativa (+15 vs 30d). Dedupe por `dedupe_key`.

## Recomendações (decisão sempre humana)

verificacao_adicional · destacar_perfil · revisao_manual · limitar_funcionalidades (só recomendação!) · mediacao. Auto-resolvem quando a condição desaparece.

## Banco (9 tabelas `orion_rep_*`)

`orion_rep_scores` (snapshot atual, PK user) · `orion_rep_history` (UNIQUE user+dia, imutável) · `orion_rep_events` (mudanças de nível) · `orion_rep_badges_catalog` (10) · `orion_rep_badges` (UNIQUE user+badge) · `orion_rep_verifications` · `orion_rep_recommendations` · `orion_rep_alerts` · `orion_rep_audit_log` (telemetria de cada execução).

**Segurança:** RLS em 100% (usuário vê só a própria linha; alertas/auditoria só admin); `REVOKE ALL/GRANT SELECT`; **REVOKE EXECUTE FROM PUBLIC, anon em todas as `rep_*`** (lição AI-61); guardas server-side (`rep_guard`: próprio usuário ou admin).

## Operação

- Cron `orion_rep_tick` `*/7 * * * *` → `rep_run('cron')` (atualização quase-tempo-real; 9 usuários ≈ ms).
- Evento `rep.updated` no bus `orion_eventos` a cada execução.
- Registry: `orion_ai_module_prefs('trust_reputation','gpt-5-mini')` + 4 prompts `reputation.*` no Prompt Registry (IA só via Gateway).
- **COMANDO TESTE:** `SELECT rep_selftest();` → 14 checks (14/14 na homologação).

## Migration

`supabase/migrations/20260718_orion_ai74_trust_reputation.sql` — idempotente, aplicada via Management API em 2026-07-18.
