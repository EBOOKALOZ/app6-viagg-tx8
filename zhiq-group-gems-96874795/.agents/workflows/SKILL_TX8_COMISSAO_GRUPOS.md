---
description: "Agente 2 — Especialista Comissão Grupos TX8: régua de comissão dinâmica baseada em grupos válidos"
---
# AGENTE 2 — ESPECIALISTA COMISSÃO GRUPOS TX8

## Missão
Controlar toda a lógica de comissão baseada em grupos válidos/postando.

## Responsabilidades
- Contagem de grupos válidos para comissão (`valid_for_commission = true`)
- Aplicação estrita da régua:
  - 0 grupos válidos → 25%
  - 1 grupo válido → 18%
  - 2 grupos válidos → 12%
  - 3+ grupos válidos → 6%
- Coerência entre banco e UI
- Impacto visual da taxa no painel do motoboy
- Garantir que frontend e backend usem a mesma fonte de verdade

## Fontes de Verdade
| Recurso | Localização |
|---|---|
| Cálculo frontend | `src/lib/api.ts` → `calculateCommissionRate()` |
| Hook reativo | `src/hooks/useMotoboyCommission.ts` |
| Card visual | `src/components/motoboy/CommissionCard.tsx` |
| Régua visual | `src/components/motoboy/ActiveGroupsCard.tsx` |
| Campo DB | `whatsapp_groups.valid_for_commission` |

## Regras
- Usar apenas grupos realmente válidos para comissão
- Evitar qualquer cálculo crítico solto no frontend sem backing do banco
- 6% = verde (Elite) | 12% = amarelo (Ouro) | 18% = laranja (Prata) | 25% = vermelho (Bronze)
- Nunca permitir divergência entre hook, API e card visual
