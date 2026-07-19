# ORION-REVIEW FASE A v1.0 — Validação Técnica Pré-Implementação (Arremates)

> **Data:** 2026-07-18 · **Natureza:** validação técnica (ZERO implementação/migration/alteração)
> **Base:** ORION-ARCHITECTURE v1.0 (`orion-arquitetura-pos-leilao-v1.md`) + ORION-AUDIT (`orion-audit-leiloes-v1.md`) + **introspecção ao vivo** do banco `broifhfqmnzqoongtokm` + código `analise-programador`.
> **Escopo da FASE A validado:** coluna `arremate_status` + máquina de transições no motor + eventos `arremate.*` + proteção winner/valor + policies ALC + higiene de RPCs.

---

## ETAPA 1 — Arquitetura: consistente, com 2 correções factuais

✅ **D1 confirmada:** `orion_auction_settlements` tem `PRIMARY KEY (listing_id)` — 1 leilão = 1 arremate, chave natural para `arremate_status` e para as chaves idempotentes `auction_*:<listing_id>`. Coluna `arremate_status` **não existe** (sem colisão).
✅ Responsabilidades/dependências sem conflito: nenhum objeto do banco depende internamente das RPCs a dropar (pg_depend limpo) e o `aeo_discover` (AI-70) **não** referencia as sobrecargas por nome (descoberta dinâmica — não quebra).
📌 **Correção factual 1:** as policies ALC **já cobrem as partes** — `orion_alc_deals_sel` = seller OR buyer OR admin; disputes idem via deal; `orion_auction_settlements` já tem `orion_settle_read` (seller/winner/admin). O item "policies ALC das partes" da FASE A está **~90% pronto** (falta apenas policy de INSERT de disputa pela parte, quando a UI nascer — FASE E).
📌 **Correção factual 2:** `orion_alc_ratings_sel` é `USING (true)` — avaliação legível por qualquer autenticado. Aceitável (avaliações são públicas por natureza), mas registrar como decisão consciente.

## ETAPA 2 — Banco de dados (tabelas da FASE A)

| Tabela | Uso atual | Impacto FASE A | Compatível? |
|---|---|---|---|
| `orion_auction_settlements` (2 rows) | liquidação AI-65 | +1 coluna nullable `arremate_status` + trigger de proteção | ✅ aditivo; RLS já ON c/ policy das partes |
| `orion_eventos` (21.083 rows) | bus do ecossistema | receberá `arremate.*` (0 colisões hoje) | ✅ estrutura ok · 🔴 **P0-2 grants (Etapa 8)** |
| `orion_auction_audit` (5) | trilha do leilão | + registros de transição | ✅ aditivo |
| `orion_alc_deals/disputes/ratings` | trilha operacional | leitura; nenhum DDL | ✅ |
| `auction_listings` (4) / `auction_bids` (1) | disputa | nenhum DDL na FASE A | ✅ |
| `auction_financial_rules` (1 regra 6%) | comissão | leitura | ✅ |

**Nenhuma alteração da FASE A toca módulo existente** — tudo é aditivo (coluna nullable, trigger novo, policies, REVOKEs) ou remoção de código morto comprovado.

## ETAPA 3 — Migrations

Repo íntegro e **alinhado com produção** (as correções da auditoria v1 vieram de `20260718_orion_auction_security_monetization_ai671.sql` e `20260718_orion_auction_official_flow_ai672.sql`, aplicadas). Sem migrations pendentes do domínio. **Sequência recomendada:** 1 migration única `20260719_arremate_fase_a.sql`, idempotente, nesta ordem interna: ① snapshot de rollback (comentário com defs das fns a dropar) → ② coluna+backfill do status → ③ trigger de proteção → ④ função de transição+eventos → ⑤ REVOKEs (P0) → ⑥ drop das sobrecargas mortas → ⑦ bloco de verificação. Sem conflito com `20260718_orion_ai74_trust_reputation.sql` (namespaces disjuntos).

## ETAPA 4 — RPCs (lista completa do domínio: ~85 funções)

**Vivas e mantidas:** `create_auction_listing` (SOBRECARGA CANÔNICA = a do conjunto usado pelo `useAuctions`: `p_store_id,p_title,p_description,p_product_image_url,p_starting_bid,p_buy_now_price,p_reserve_price,p_minimum_increment,p_city,p_neighborhood,p_state,p_duration_hours,p_product_id,p_listing_type`), `place_auction_bid` (2-arg `p_listing_id,p_amount_cents`), `end_auction_listing`, suíte close/settle/charge/antisniper/autoclose, financial_rules, intel/growth/aeo/alc, dashboards.
**Quebrada (dropar):** `place_auction_bid` 3-arg (`p_auction_listing_id,p_bidder_user_id,p_bid_amount`) — escreve em colunas inexistentes. Confirmado sem dependentes.
**Obsoletas (dropar):** 5 sobrecargas de `create_auction_listing` (2 em cents com sets diferentes, 1 com `p_starts_at/p_ends_at/p_created_by`, 2 subconjuntos da canônica — risco real de PGRST203 quando o front variar payload).
**Duplicadas (consolidar depois, FASE C):** `submit_arremate_offer` ×2 + fallback INSERT direto no modal; `create_auction_listing_v2` (avaliar fusão com a canônica).

## ETAPA 5 — Edge Functions

**A FASE A não precisa de NENHUMA Edge** (motor 100% DB/RPC). Única Edge do ecossistema relacionada: `send-event-notification` (existe no repo; precisa republicar — dependência da **FASE C**, não da A). Gateway IA intocado.

## ETAPA 6 — Eventos

✅ Bus `orion_eventos(tipo, origem, dados, user_id, criado_em)` comporta os 17 eventos `arremate.*`; **zero colisão** (0 eventos `arremate%` hoje em 21k). Consumidores (AI-31/67/69/70/74) leem por `tipo/origem` — aditivo. ⚠ Condição: hardening dos grants (P0-2) antes de o bus virar espinha dorsal da auditoria do arremate.

## ETAPA 7 — Máquina de estados (validação formal)

- **Transição impossível?** Nenhuma — todas as 18 têm gatilho definido e ator claro.
- **Estado redundante?** `encerrado`→`vencedor_definido`→`settlement_criado` são micro-estados que hoje ocorrem na MESMA transação (close→settle no mesmo tick). **Recomendação:** mantê-los como EVENTOS; o primeiro `arremate_status` persistido é `aguardando_pagamento` (com vencedor) ou `sem_vencedor` (terminal). Evita estados fantasma de milissegundos.
- **Estado ausente?** ① `sem_vencedor` — formalizar como terminal (os 2 settlements reais já estão nele). ② **Transição ausente: 5→15** (`pagamento_em_processamento` → `expirado` quando o prazo de 48h vence com ordem MP pendente — cancelar a ordem e expirar). Corrigir na spec ao implementar.
- **Risco de loop?** `em_disputa`→estado anterior→`em_disputa`… **Mitigação obrigatória:** máx. 1 disputa por marco (pagamento/entrega); reincidência → só admin reabre.
- **Risco de deadlock?** `em_disputa` sem SLA humano trava escrow indefinidamente. **Mitigação obrigatória:** SLA de decisão (7 dias, alerta admin no D+3, escalada no D+7). Sem isso o estado é um poço.

## ETAPA 8 — Segurança (achados AO VIVO)

| # | Sev | Achado | Prova |
|---|---|---|---|
| **P0-1** | 🔴 | **10 funções SECURITY DEFINER do leilão com EXECUTE para anon**: `orion_auction_close`, `orion_auction_charge`, `orion_auction_autoclose_tick`, `end_auction_listing`, `create_auction_listing`, `place_auction_bid`, `auction_set_owner`, `create_arremate_listing`, `accept_arremate_offer_advertiser`, `respond_arremate_offer`. Qualquer portador da anon key pode **encerrar leilão antes da hora, cobrar créditos do lojista e aceitar ofertas como anunciante**. Suíte é anterior à lição AI-61; as fns novas (settle/intel/aeo/rep) já estão blindadas. | `routine_privileges` × `prosecdef` (92 grants em 39 fns) |
| **P0-2** | 🔴 | **`orion_eventos` com grants DML totais p/ anon+authenticated, incluindo TRUNCATE** (RLS não barra TRUNCATE) → qualquer um pode apagar os 21.083 eventos do ecossistema. Única policy é `admin SELECT`. | `role_table_grants` |
| P1 | 🟠 | Sem proteção de imutabilidade de `winner_user_id`/`valor_final` (nenhum trigger em settlements) — exatamente o que a FASE A cria. | `pg_trigger` = NENHUM |
| P2 | 🟡 | `orion_alc_ratings` legível por todos (`USING true`) — provavelmente intencional; ratificar. | `pg_policies` |

**Os 2 P0 são vulnerabilidades PRÉ-EXISTENTES** (fazem parte do quadro ORION-HARDENING FASE 1: 104 tabelas com grant anon). A FASE A não abre NENHUMA vulnerabilidade nova — e deve **incorporar os REVOKEs** ao seu escopo de higiene.

## ETAPA 9 — Compatibilidade

Marketplace ✅ (leituras intactas) · Financeiro/PAY/Escrow/MP ✅ (FASE A não toca dinheiro — zero risco) · ALC ✅ (só leitura + policies já ok) · RIDV ✅ (triggers intactos) · Notificações ✅ (nada na A) · Delivery/Motoboy/Moto-Táxi ✅ (nada na A) · Reputação AI-74 ✅ (lerá `arremate_status` quando existir; hoje lê `pagamento_ok` — manter os booleans espelhados) · IA 41/67/69/70 ✅ (read-only; AEO não referencia sobrecargas). **Front:** único ponto de contato = sobrecargas dropadas; a canônica preservada mantém `useAuctions` funcionando sem deploy obrigatório.

## ETAPA 10 — Plano de Rollback

**Pontos de restauração:** ① git tag `pre-arremate-fase-a` antes do commit da migration; ② **export das definições** (`pg_get_functiondef`) das 6 fns a dropar, salvo em `DOCS/rollback-fase-a-fns.sql` ANTES do drop; ③ a migration é idempotente e re-aplicável.
**Sequência de reversão (ordem inversa, cada passo independente):** ① recriar sobrecargas dropadas a partir do export (restaura estado anterior por completo); ② `DROP TRIGGER` proteção winner/valor; ③ `DROP FUNCTION` transição/eventos `arremate.*` (eventos já emitidos PERMANECEM — bus é imutável, sem perda de auditoria); ④ `ALTER TABLE ... DROP COLUMN arremate_status` (nenhum consumidor externo na FASE A — perda zero); ⑤ REVOKEs **não se revertem** (correção de segurança fica — rollback de vulnerabilidade não existe).
**Riscos do rollback:** baixos; nenhum dado de domínio é destruído (coluna nova é derivável dos booleans + eventos). **Impacto:** front intocado (sobrecarga canônica nunca sai).

## ETAPA 11 — Plano de Homologação (executar APÓS implementar a FASE A)

**Funcionais:** ① criar leilão pela canônica (front real); ② lance 2-arg + anti-sniper; ③ encerrar auto (cron) e manual; ④ `arremate_status` inicial correto (`sem_vencedor`/`aguardando_pagamento`); ⑤ transição válida aceita / inválida REJEITADA (testar 3 proibidas: pular pago→contato, liquidar sem confirmação, sair de terminal); ⑥ eventos `arremate.*` emitidos 1× (idempotência: repetir tick → 0 duplicatas).
**Financeiros:** ⑦ FASE A não move dinheiro — provar `pay_ledger_entries`/`pay_escrow_holds`/carteiras COUNT inalterados antes×depois de todo o ciclo de testes.
**RLS/Segurança:** ⑧ anon: EXECUTE nas 10 fns P0-1 = negado (sonda REST com anon key); ⑨ anon: TRUNCATE/INSERT/UPDATE/DELETE em `orion_eventos` = negado; ⑩ parte lê o próprio settlement/deal; terceiro NÃO lê; ⑪ UPDATE direto de `winner_user_id`/`valor_final`/`arremate_status` = bloqueado pelo trigger (inclusive como admin via PostgREST).
**Integração:** ⑫ AI-74 continua lendo `pagamento_ok` (selftest 14/14); ⑬ AEO `aeo_selftest` 14/14; ⑭ `auction_security_selftest` verde; ⑮ AI-67/69 selftests verdes (nada quebrou com os drops).
**Regressão:** ⑯ vite build verde; ⑰ fluxo público completo no navegador (lista→detalhe→lance) + realtime e2e (2 navegadores — pendência A2 da arquitetura).
**Auditoria:** ⑱ toda transição gera linha em `orion_auction_audit` (estado anterior→novo, ator, origem) + evento no bus; ⑲ tentar UPDATE/DELETE em `orion_auction_audit`/`orion_eventos` = negado.
**Critério de aceite:** 19/19 verdes + selftest dedicado da FASE A (COMANDO TESTE) criado junto com a migration.

---

## RELATÓRIO FINAL

| Área | Resultado |
|---|---|
| Arquitetura | ✅ consistente (2 correções factuais registradas — ALC melhor que o esperado) |
| Banco | ✅ impacto 100% aditivo; zero efeito em módulos existentes |
| Migrations | ✅ sem conflitos; repo alinhado à produção; 1 migration única recomendada |
| RPCs | ✅ canônica identificada; 1 quebrada + 5 obsoletas com drop SEGURO comprovado (pg_depend/AEO/front) |
| Edge Functions | ✅ FASE A precisa de zero Edges |
| Eventos | ✅ bus comporta `arremate.*` sem colisão — condicionado ao P0-2 |
| Estados | ✅ máquina válida com 3 ajustes: micro-estados 1-3 como eventos, transição 5→15, SLA de disputa |
| Segurança | 🔴 2 P0 PRÉ-EXISTENTES encontrados (não causados pela FASE A) — entram no escopo dela |
| Compatibilidade | ✅ 13/13 integrações sem quebra |
| Rollback | ✅ plano aprovado (aditivo + export pré-drop; REVOKEs permanecem) |
| Homologação | ✅ checklist de 19 testes definido |

### A FASE A está tecnicamente pronta para implementação?
✅ **SIM.**

### Bloqueios técnicos?
**Nenhum bloqueio para INICIAR.** Condições para CONCLUIR a FASE A (incorporadas ao escopo): resolver P0-1 e P0-2 na própria migration (REVOKEs), aplicar os 3 ajustes da máquina de estados, salvar o export de rollback antes dos drops.

### Riscos críticos?
- **P0-1:** anon executa motor DEFINER (close/charge/accept/end...) — corrigir NA FASE A.
- **P0-2:** anon pode TRUNCATE o bus `orion_eventos` — corrigir NA FASE A.
- **P1:** imutabilidade winner/valor inexistente (é a entrega da FASE A); loop/deadlock de disputa sem SLA (ajuste de spec); `submit_arremate_offer` ambígua (FASE C).
- **P2:** ratings públicos (ratificar); realtime sem validação e2e (homologação ⑰); índice parcial do feed (tuning).

### A implementação poderá ocorrer sem retrabalho?
✅ **SIM** — a entidade e a chave já são as da arquitetura (settlement PK listing_id), tudo é aditivo, a sobrecarga canônica preserva o front sem deploy casado, os consumidores (AI-74/AEO/intel) já leem os campos que serão espelhados, e os ajustes de estado foram capturados AGORA (antes de codificar) — que é exatamente o retrabalho que esta revisão elimina.

---

# 🟢 FASE A LIBERADA PARA IMPLEMENTAÇÃO

**Justificativa técnica:** escopo 100% aditivo sem impacto em módulos vivos; drops comprovadamente seguros (sem dependentes internos, front preservado pela canônica, AEO dinâmico); os únicos riscos críticos encontrados são vulnerabilidades PRÉ-EXISTENTES cuja correção é justamente parte do escopo de higiene da FASE A; rollback completo definido; homologação de 19 testes pronta. Condições de conclusão: P0-1 + P0-2 resolvidos na migration, ajustes da máquina de estados aplicados, export de rollback salvo antes dos drops, 19/19 da homologação verdes.
