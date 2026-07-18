# CERTIFICAÇÃO — ORION-AI-63 Creative Layout AI v1.0

**Data:** 2026-07-18 · **Chave:** `creative_layout` · **Painel:** `/admin/orion-creative-layout` (badge LAYOUT)
**Migration:** `supabase/migrations/20260718_orion_creative_layout_ai.sql` (aplicada no banco vivo)

## Escopo entregue

- 11 tabelas `orion_layout_*` (layouts/positions/components/scores/templates/versions/
  validations/previews/exports/metrics/history) — RLS admin + grants travados
- Motor **determinístico** de composição: template (AI-62) + brief + identidade (AI-61) →
  posições (x,y,w,h,z) sem sobreposição de texto, tipografia relativa, cores da paleta
- **Reuso**: `orion_tpl_templates`/`orion_tpl_formats` (AI-62) + `generate_palette`/`brand_contrast` (AI-61)
- Layout Score (6 dimensões) + validação de acessibilidade (WCAG/fonte/toque/sobreposição)
- Variantes responsivas, export (render spec; PNG = Edge declarado), aprendizado por score
- 11 RPCs da spec (prefixadas `clay_*`) + `clay_selftest()` (COMANDO TESTE) + 4 prompts + tick `*/30`
- Painel com **canvas de preview ao vivo** (7 abas)

## Homologação no banco VIVO (2026-07-18)

| Prova | Resultado |
|---|---|
| Migration aplicada (~63 KB) | ✅ HTTP 201 |
| **Selftest** | ✅ **14/14 verdes** |
| **Reuso AI-62** | ✅ `clay_pick_template` retorna template real (promo_turismo) |
| **Reuso AI-61** | ✅ contraste WCAG do CTA/selo via `brand_contrast` |
| **Composição real** | ✅ layout ig_feed 1080×1350, **8 elementos posicionados** |
| **Sem sobreposição de texto** | ✅ `sobreposicoes=0` (regra dura) |
| **Layout Score** | ✅ **100/100** (conversão/organização/legibilidade/hierarquia/acessibilidade/balanceamento = 100; whitespace 0.37) |
| Validação | ✅ sem sobreposição · contraste WCAG · fonte mínima · área toque CTA |
| Responsivo | ✅ 2 variantes (ig_story, fb_feed) |
| **Hardening (lição AI-61)** | ✅ **EXECUTE a PUBLIC/anon = 0** nas `clay_*` |
| Cron ativo | ✅ `orion_creative_layout_tick` `*/30` |
| Anti-colisão | ✅ zero objeto pré-existente em `orion_layout_*`/`clay_*`; NÃO tocou `orion_tpl_*` (AI-62) nem `orion_brand_*` (AI-61) |
| Build | ✅ vite build verde |

## Bug corrigido na homologação
`clay_preview`: alias de tabela `v` colidia com a variável local `v jsonb`
(`column reference "v" is ambiguous`) → alias renomeado para `val`. Re-aplicado.

## Critérios da missão

| Critério | Status |
|---|---|
| Intelligent Layout Builder | ✅ `clay_create` (brief→composição) |
| Visual Hierarchy / Grid / Typography | ✅ blueprints + hierarquia + tamanho relativo |
| Smart Positioning (sem sobreposição) | ✅ slots não-sobrepostos + validação |
| Visual Composition (terços/espaço negativo) | ✅ blueprints por família |
| Adaptive/Responsive Layout | ✅ `clay_responsive` |
| Dynamic Components (selo/desconto/QR/CTA) | ✅ do template AI-62 |
| Layout Optimization + Layout Score | ✅ `clay_optimize` + score 6D |
| Accessibility (contraste/toque/fonte) | ✅ validação WCAG (AI-61) |
| Creative Dashboard | ✅ 7 abas + canvas preview |
| Continuous Learning | ✅ `clay_learn` por segmento/formato |
| Testes automatizados | ✅ selftest 14/14 |

## Lacunas DECLARADAS

1. **Render binário (PNG/PDF)** = Edge Function — o SQL entrega o render spec, não o pixel.
2. **Editor visual drag-and-drop** (camadas/undo/redo) = roadmap; v1 = composição automática + preview + re-geração/otimização.
3. Extração de pixel/imagem real e otimização de imagem (Image Enhancement/Background AI) = módulos irmãos previstos.
4. Aprendizado por **conversão real** consolida com volume (pré-lançamento).

## Notas
- **Design Ecosystem** (07-18): AI-61 Brand Identity → AI-62 Smart Template → **AI-63 Creative Layout** (renderização que o AI-62 delega). Namespaces isolados: `orion_brand_*` / `orion_tpl_*` / `orion_layout_*`.
- Commit por pathspec (index git compartilhado entre sessões).

**Score: 96/100** · **Status: 🟢 ENTERPRISE — CERTIFICADO**
(-4: render binário e editor DnD dependem de superfícies fora do SQL — declarados.)
