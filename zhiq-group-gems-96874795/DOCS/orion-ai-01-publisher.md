# ORION-AI-01 — Publisher AI · Documentação de Certificação v1.0

**Papel:** porta oficial de entrada de todos os anúncios. Todo listing novo (ou editado) passa por **validação estrutural + detecção de duplicidade** antes de seguir para a moderação (RIDV) e as vitrines. Módulo **determinístico** (SEM LLM/Gateway) — regras de validação em SQL, com evidência.

## Arquitetura / Fluxo
```
INSERT/UPDATE(title,description,city) em <listing>
        │ trigger orion_publisher_gate (6 tabelas)
        ▼
orion_publisher_tg()  ── (não bloqueia o save; erro vira evento publisher_erro_validacao)
        ▼
orion_publisher_validar(tabela, id)
   ├─ valida: título≥8, descrição≥20, preço>0 (quando aplica), cidade∈IBGE, capa (mercado)
   ├─ duplicidade: similaridade trgm INDEX-ASSISTED (prefiltro %, ranqueia greatest(sim título, sim desc))
   ├─ grava orion_publisher_log (idempotente: ON CONFLICT tabela+listing_id)
   └─ emite orion_eventos: anuncio_reprovado | anuncio_duplicado | anuncio_pronto_para_moderacao
        ▼
consumidores no Sistema Nervoso ORION (RIDV AI, Campaign AI, dashboards)
```
- **Varredura retroativa:** `orion_publisher_varredura()` (admin) processa listings ainda não logados (batch 300/tabela).
- **Responsabilidade única:** validar + detectar duplicidade + registrar. Não modera (RIDV), não publica (motor).

## Banco
| Objeto | Detalhe |
|---|---|
| `orion_publisher_log` | id, tabela, listing_id, modulo, titulo, cidade, status, problemas(jsonb), similaridade(jsonb), recebido_em, processado_em |
| RLS | `orion_pub_admin` — ALL / authenticated / `mp_is_admin()` (admin-only) |
| Índices | pkey; unique(tabela,listing_id); idx_orion_pub_proc(processado_em desc); idx_orion_pub_status_proc(status,processado_em desc) |
| Trgm (duplicidade) | GIN em `(title||' '||description)` nas 6 tabelas de listing (idx_trgm_*) |
| Funções | `orion_publisher_validar` (DEFINER, interno), `orion_publisher_tg` (trigger), `orion_publisher_varredura` (admin), `orion_publisher_painel` (admin), `orion_publisher_selftest` |
| Triggers | `orion_publisher_gate` AFTER INSERT OR UPDATE OF title,description,city em 6 tabelas |

## Segurança (menor privilégio)
- `anon` **não** executa nenhuma função do módulo (nem `orion_eventos_recentes`).
- `orion_publisher_tg` sem grant a role de cliente (só o trigger dispara).
- `orion_publisher_validar` sem grant a cliente (só interno/DEFINER).
- Injeção: SQL dinâmico usa `format()` + `%I` + `$n` (identificadores do schema, não input) → não injetável.
- search_path fixo em todas as funções (inclusive no trigger).

## Eventos
Produz `anuncio_reprovado`, `anuncio_duplicado`, `anuncio_pronto_para_moderacao`, `publisher_erro_validacao` em `orion_eventos` (origem `orion_publisher`). Consumidores: dashboards, RIDV, Campaign.

## IA
**Determinístico** — sem prompt, sem Gateway, sem tokens/custo. Validação = regras SQL.

## Dashboard
`/admin/orion-publisher` (`AdminOrionPublisher.tsx`): KPIs (processados/prontos/erros/duplicados/taxa/última hora), por-módulo, por-cidade; abas Fila&Log, Revisão Manual (RIDV), Eventos; botão Varredura.

## Observabilidade
- `orion_publisher_painel()` (métricas ao vivo); log imutável por RLS admin; falhas de validação viram evento `publisher_erro_validacao` (não são mais engolidas).

## Performance (medições seguras)
- Fila: `idx_orion_pub_proc` (Index Scan comprovado via EXPLAIN).
- Duplicidade: `idx_trgm_*` (Bitmap Index Scan comprovado) — prefiltro `%` antes de ranquear → escalável.
- **Teste de carga / Stress / Chaos: NÃO EXECUTADOS** — ambiente de produção, requer staging. Nenhum número fictício emitido.

## Homologação
`orion_publisher_selftest()` → **PASS 6/6** (funções, search_path, menor-privilégio anon, mecanismo trigger-driven, IA determinística, evento).
