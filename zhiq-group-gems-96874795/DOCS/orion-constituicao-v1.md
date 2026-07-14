# ORION — Constituição v1.0 (VISION 2035)
**Organismo de Inteligência Territorial da VIAGG-TX8**
Data: 2026-07-13 · Status: Fase 1 IMPLANTADA em produção (banco) + painel `/admin/orion`

---

## 1. O que a ORION é

A ORION é o cérebro oficial da VIAGG-TX8 — um Sistema Operacional Cognitivo em 3 níveis:

| Nível | Nome | O que faz | Onde vive hoje |
|---|---|---|---|
| 1 | **ORION CORE** | Interpreta a pergunta, escolhe motores, reúne evidências, consolida UMA resposta com confiança | `src/lib/orion/orionCore.ts` |
| 2 | **Motores Especializados** | Especialistas sem interface própria; só respondem ao CORE | Funções SQL `orion_*` + entradas em `MOTORES` |
| 3 | **Sistema Nervoso** | Todo evento importante da plataforma flui para a ORION | `orion_eventos` + triggers + RPC `orion_emitir_evento` |

## 2. O que a Fase 1 já entrega (tudo com dados REAIS)

- **Gêmeo Digital do Brasil v1**: `orion_municipios` — 5.571 municípios IBGE com população oficial, UF e região; campo `perfil jsonb` extensível para PIB/IDH/renda/turismo (Fase 2).
- **Gêmeo Operacional v1**: `orion_presenca_cidades()` — motoboys, lojas, anúncios e usuários reais por cidade.
- **Índices Cognitivos versionados**: tabela `orion_indices` (IPV, IOD, ISAT, ICLA, IPRE — fórmula e fonte auditáveis; nova versão = nova linha, nunca sobrescrever).
- **Motor Territorial**: `orion_ranking(uf, limite)` — score explicável por vertical (delivery, marketplace, mobilidade, publicidade) + classificação de expansão em 6 níveis com justificativa.
- **Motor Operacional**: `orion_alertas()` — gargalos reais (loja sem entregador, profissional ocioso, taxa de cancelamento).
- **IA Preditiva v1**: `orion_prever_demanda()` — baseline sobre pedidos reais com confiança proporcional ao volume (IPRE).
- **IA Prescritiva**: `orion_gerar_recomendacoes()` — cada recomendação carrega motivo, indicadores, confiança, benefícios, riscos e alternativas.
- **Autoaprendizado**: `orion_decidir(id, ação)` grava decisão em `orion_aprendizado`; histórico alimenta o motor LEARN.
- **Simulador v1**: `orion_simular_recrutamento(cidade, novos)` — antes/depois com premissas explícitas.
- **Painel Executivo**: `/admin/orion` — Pergunte à ORION, Visão Nacional, Recomendações, Alertas, Previsão & Simulador, Núcleo.

## 3. Governança (obrigatória em qualquer evolução)

1. Toda resposta do CORE informa **quais motores participaram** e o **nível de confiança**.
2. **Fato ≠ estimativa**: números medidos são fatos; projeções são rotuladas como estimativa (premissas visíveis).
3. Confiança < 50% → a ORION **avisa** que a base de dados ainda é limitada.
4. A ORION **recomenda, não executa**: decisão final é humana (`orion_decidir` registra a trilha).
5. Acesso restrito: todas as funções exigem `mp_is_admin()`; tabelas `orion_*` com RLS admin.
6. Tabelas financeiras `pay_*` só entram na ORION após parecer das regras financeiras (skill `regras-financeiras`).

## 4. Plataforma Orientada pela ORION — checklist de TODO novo módulo

Antes de desenvolver qualquer funcionalidade, responder por escrito:

1. Quais **dados** esse módulo produzirá?
2. Quais **eventos** serão enviados para a ORION? (usar `orion_emitir_evento(tipo, origem, dados)` ou trigger `orion_tg_evento`)
3. Quais **índices** serão atualizados (ou criados em `orion_indices`)?
4. Quais **previsões** poderão ser melhoradas?
5. Quais **recomendações** poderão ser geradas?
6. Como isso **fortalece a inteligência coletiva** da plataforma?

Nenhum módulo nasce isolado.

## 5. Como estender (sem reescrever o núcleo)

- **Novo motor de análise** → nova função SQL `orion_*` (admin-gated) + nova entrada em `MOTORES` no `orionCore.ts`.
- **Nova fonte de evento** → trigger `AFTER INSERT ... EXECUTE FUNCTION orion_tg_evento('tipo')` (não-bloqueante) ou chamada de `orion_emitir_evento` no app.
- **Novo índice** → INSERT em `orion_indices` (sigla, versao+1) + implementação na função correspondente.
- **Novo indicador de município** → chave no `perfil jsonb` de `orion_municipios` (sem migração de schema).

## 6. Roadmap de fases

| Fase | Entrega | Status |
|---|---|---|
| 1 | Gêmeo territorial + motores base + painel + nervoso + índices v1 | ✅ 2026-07-13 |
| 2 | Perfil rico dos municípios (PIB/IDH/renda IBGE-SIDRA), área territorial, ranking de bairros | pendente |
| 3 | Previsão por cidade/hora com histórico de eventos; ORION SECURITY (fraude/abuso) e ORION ADS (ROI/CAC/LTV — depende do módulo financeiro de ads) | pendente |
| 4 | Mapa choropleth Brasil/UF/município no painel; simulador multi-cenário (preço, comissão, campanhas) | pendente |
| 5 | Autonomia assistida: ORION prepara campanhas/recrutamento para aprovação em 1 clique; medição automática de resultado (ROI real → LEARN) | pendente |

## 7. Inventário técnico Fase 1

- Migrations: `20260713_orion_fase1.sql`, `20260713_orion_nervoso.sql`, `20260713_orion_indices.sql` (aplicadas via Management API).
- Front: `src/lib/orion/orionCore.ts`, `src/pages/admin/AdminOrion.tsx` (+ wiring em lazyPages/adminRoutes/AdminSidebar — seção Gestão).
- Prova ponta a ponta (2026-07-13): ranking nacional ok; 5 recomendações de expansão geradas (SP, RJ, BSB, Fortaleza, Salvador); aceite registrado no LEARN; alerta real de cancelamento 24,6%; simulador Blumenau (385.558 hab); CORE respondeu com EXECUTIVE+GEO e confiança 61%.
