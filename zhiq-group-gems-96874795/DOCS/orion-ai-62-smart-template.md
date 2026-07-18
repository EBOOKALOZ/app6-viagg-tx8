# ORION-AI-62 — Smart Template AI v1.0

**Missão:** biblioteca inteligente de templates gráficos — cria/classifica/recomenda/adapta o layout ideal por segmento/objetivo/formato/rede, **respeitando a Brand Identity AI** (nunca recomenda estilo incompatível). Parte do ORION Design Ecosystem.

**Chave:** `smart_template` · **Painel:** `/admin/orion-smart-template` (badge **TEMPLATE**) · **Modelo:** gpt-5-mini · **Cron:** `orion_tpl_tick` a cada 30 min (ranking por uso)

## Anti-colisão
Brand Identity (irmã) usa `orion_brand_*` (incl. `orion_brand_templates` = templates POR MARCA). AI-62 é a biblioteca **compartilhada e inteligente**: namespace **`orion_tpl_*`**, funções `tpl_*`/`recommend_template`/`adapt_template`. **LÊ `orion_brand_profiles`** (segmento/estilo_visual) para compatibilidade — nunca escreve nele.

## Escopo honesto
Gerencia **DEFINIÇÕES** de template (estrutura/componentes/tokens de estilo/cores/fontes). A **renderização em PNG/vídeo é do Design Studio AI (DELEGADA, declarado)**; preview/thumbnail via Storage. Marketplace interno: campos `nivel` (gratuito/premium/oficial/exclusivo/patrocinado/ia) existem; monetização usa o sistema de créditos existente (não recriado). O catálogo-semente (24 segmentos reais + 18 objetivos + 14 formatos/redes + 30 templates curados) É o produto, não dado sintético.

## 12 camadas → 9 tabelas
`orion_tpl_templates` (biblioteca) · `_segments`/`_objectives`/`_formats` (catálogos reais) · `_versions` (imutável, anti-exclusão) · `_usage` (uso/download/conversão reais → ranking) · `_favorites` · `_recommendations` (log) · `_statistics`.

## APIs
`create_template(def)` · `update_template(id, patch)` (versiona) · `duplicate_template(id, nome)` · **`recommend_template(ctx)`** (casa segmento/objetivo/rede + estilo da marca; loga) · **`adapt_template(id, redes[])`** (reflow por aspecto de cada rede) · `template_search(filtros)` · `template_track(id, evento)` · `run_template_ranking()` · `template_dashboard()`. Prompts: `template.recommend/generate/adapt/analyze/summary`.

## Aprendizado contínuo
`score` efetivo = `base_score` (qualidade curada) + boost por **conversão real** (CTR = conversões/usos). Uso começa vazio no pré-lançamento (DECLARADO) → score = base até acumular. Cron recalcula o ranking a cada 30 min.

## COMANDO TESTE
`SELECT tpl_selftest()` — **17/17** (seeds, CRUD+versão, recommend brand-aware, adapt multi-formato, ranking por uso, imutabilidade de versões, anti-exclusão de templates, RLS, cron).

## 1ª aplicação (2026-07-17)
30 templates · 24 segmentos · recomendação real: pizzarias+promoção+instagram → `promo_pizzarias` (confiança 95%, score 80). Proteção anti-exclusão: `orion_tpl_templates` sem DELETE (soft via `ativo=false`); versões imutáveis.
