# ORION-ARREMATES FASE D v1.0 — Logística / Entrega (Relatório de Implementação)

**Data:** 2026-07-19 · **Banco:** `broifhfqmnzqoongtokm` (aplicado ao vivo) · **Modelo:** P2P preservado — a plataforma **não intermedia o pagamento do PRODUTO**. A entrega tem 2 modos: **retirada** (sem logística) e **delivery** (frete de motoboy que o **comprador paga à parte**, reusando o fluxo de corridas provado).

**Base:** FASE A (mecanismo de estados) · FASE B v2.0 (P2P) · FASE C (comunicação) · módulo de corridas (`create_customer_delivery_order`) · ALC · Hardening. Nenhuma decisão aprovada foi alterada.

---

## 1. PRINCÍPIO

- **Produto:** pago diretamente comprador↔vendedor (P2P, FASE B v2/C) — a plataforma não toca.
- **Frete (delivery):** é um **serviço de corrida** que o **comprador paga** via o fluxo pré-pago **já provado** (`create_customer_delivery_order`: debita a `customer_wallet` do comprador → escrow da corrida → motoboy). Separado do produto. Reuso puro — **nenhuma primitiva financeira nova**.
- A FASE D **não altera a máquina de estados** (usa os estados FASE C `pagamento_confirmado_vendedor → preparando_entrega → entregue → recebido`); só adiciona o **vínculo** com a corrida e um **trigger** de conclusão.

## 2. OBJETOS CRIADOS / ALTERADOS

| Objeto | Tipo | Papel |
|---|---|---|
| `orion_auction_settlements.fulfillment` | coluna | `retirada` \| `delivery` (CHECK) |
| `orion_auction_settlements.delivery_order_id` | coluna | vínculo com a corrida do frete (`service_orders`) |
| `arremate_definir_fulfillment(listing, modo)` | RPC | comprador/vendedor escolhe retirada ou delivery |
| `arremate_solicitar_entrega(listing, coords/enderecos, frete, notes)` | RPC | **comprador** aciona o frete (chama `create_customer_delivery_order` — comprador paga) + vincula + transita → `preparando_entrega` |
| `tg_arremate_on_delivery_delivered` | trigger em `service_orders` | corrida vinculada chega a `delivered` → arremate avança para `entregue` (aditivo; não altera o despacho) |
| `MeuArremate.tsx` | front | escolha retirada/delivery + formulário "solicitar entrega" + rastreio |
| `arremate_init` | RPC (revisada) | inalterada nesta fase |

**Preservado:** `arremate_transition()`, trigger de imutabilidade winner/valor (FASE A), o despacho de corridas e todos os triggers financeiros existentes (o `tg_service_order_release_payment` continua liberando o frete ao motoboy — coexiste com o novo trigger).

## 3. FLUXO

```
pagamento_confirmado_vendedor
   │
   ├─ RETIRADA ─► vendedor "Disponível para retirada" (arremate_seller_enviar → entregue)
   │                └─► comprador "Recebi o produto" (→ recebido) ─► conclui
   │
   └─ DELIVERY ─► comprador "Solicitar entrega por motoboy" (arremate_solicitar_entrega)
                    │   create_customer_delivery_order (comprador PAGA o frete; corrida despachada)
                    │   arremate → preparando_entrega + delivery_order_id vinculado
                    ▼
                 motoboy entrega (service_orders → 'delivered')
                    │  tg_arremate_on_delivery_delivered
                    ▼
                 arremate → entregue ─► comprador "Recebi o produto" (→ recebido) ─► conclui
```

## 4. TESTES EXECUTADOS (ao vivo, dados de teste depois removidos)

| Teste | Resultado |
|---|---|
| **Retirada E2E** (definir retirada → disponível → recebido → concluído) | **4/4** ✅ |
| **Trigger delivery** (corrida vinculada `delivered` → arremate `entregue`) | ✅ (tx com rollback, sem poluir) |
| **Guard** buyer-only em `arremate_solicitar_entrega` (vendedor negado) | ✅ |
| **Guard** de estado (só após `pagamento_confirmado_vendedor`) | ✅ |
| `arremate_definir_fulfillment` (retirada/delivery) | ✅ |
| **Segurança** anon nas 2 RPCs novas | negado (42501/PGRST202) ✅ |
| **Coexistência** com o trigger de liberação do frete (`tg_service_order_release_payment`) | ✅ (ambos disparam no `delivered`; o meu não exige auth) |
| **Regressão** suíte permanente REST | **39/39** ✅ |
| **Invariantes** DB + FASE C+D | **10/10 + 9/9** ✅ |
| **Build** `vite build` | verde ✅ |

## 5. SEGURANÇA

RPCs `SECURITY DEFINER` com guarda de papel (solicitar entrega = só comprador; definir modo = partes/admin); `REVOKE anon` nas 2 RPCs (0 anon-exec); trigger-fn só `service_role`. O frete usa `create_customer_delivery_order` (que já valida `auth.uid` e debita a `customer_wallet` do comprador) — **o produto continua fora do alcance financeiro da plataforma**. Imutabilidade winner/valor preservada (FASE A).

## 6. ROLLBACK

- **Front:** aditivo; reverter `MeuArremate.tsx`.
- **Backend:** `DROP TRIGGER tg_arremate_on_delivery_delivered`; `DROP FUNCTION` das 2 RPCs; `ALTER TABLE ... DROP COLUMN fulfillment, delivery_order_id`. Nada financeiro a reverter (o frete é o fluxo de corrida existente, independente). FASE A/C intactas.
- **Idempotência:** migration re-aplicável.

## 7. LIMITAÇÕES / PRÓXIMOS PASSOS (v1)

- **Coordenadas do frete:** o formulário do front usa a geolocalização do comprador como ponto de partida e endereços em texto (coleta combinada pelo chat). Um seletor de mapa / geocoder refinaria a precisão do despacho (a coleta é o endereço do vendedor). Recomendado para a v2.
- **Auto-confirmação de recebimento (D+N):** decisão de negócio pendente (recomendado D+7) para fechar arremates com comprador silencioso.
- **Frete grátis / embutido:** hoje o comprador paga o frete à parte (decisão oficial). Modelos alternativos ficam para decisão de negócio.

---

## CRITÉRIO FINAL

**A FASE D foi implementada?** 🟢 **SIM** (retirada + delivery, backend ao vivo + front + testes).

**Houve regressão?** **NÃO** — suíte 39/39, invariantes 10/10 + 9/9, build verde, FASE A/C preservadas, despacho de corridas e triggers financeiros intactos.

**A logística está integrada ao módulo de corridas?** ✅ **SIM** — a entrega delivery reusa `create_customer_delivery_order` (frete pré-pago pelo comprador, despacho de motoboy provado); a conclusão da corrida realimenta o arremate por trigger; o produto permanece P2P.

**O ciclo do arremate está completo (encerramento → entrega → conclusão)?** ✅ **SIM** nos dois modos (retirada e delivery).

---

# 🟢 ORION-ARREMATES FASE D APROVADA

**Logística integrada sem intermediar o pagamento do produto:** retirada direta ou entrega por motoboy (frete pago pelo comprador via o fluxo de corridas provado), com vínculo auditável entre o arremate e a corrida, avanço automático de estado na conclusão da entrega, e segurança/menor-privilégio do Hardening. Backend aplicado ao vivo e provado; front entregue com build verde; testes permanentes estendidos; zero regressão. **Commit e deploy pendentes do usuário.**

---

*Implementação aplicada ao vivo em `broifhfqmnzqoongtokm`; migration + testes + front versionados. Provas por REST (anon + JWT das partes) e Management API. Dados de homologação removidos. 2026-07-19.*
