# ORION-AI-63 — Creative Layout AI v1.0

> **Designer Inteligente de Layouts** do ORION Design Ecosystem.
> Chave `creative_layout` · namespace `orion_layout_*` (funções `clay_*`) · painel `/admin/orion-creative-layout` (badge **LAYOUT**).
> Migration: `supabase/migrations/20260718_orion_creative_layout_ai.sql`.

## O que é

Motor **determinístico** de composição. Recebe um **template** (Smart Template AI-62)
+ uma **identidade** (Brand Identity AI-61) + um **brief** e produz uma
**composição posicionada profissional**: hierarquia visual, grid/terços, safe areas,
**sem sobreposição de texto**, contraste **WCAG** real, **Layout Score** e variantes
responsivas. **Nunca cria layout aleatório** — segue princípios de design/UX/marketing.

## Reuso (não duplica) — o lugar do AI-63 no Design Ecosystem

| Módulo | Papel | AI-63 usa |
|---|---|---|
| **AI-61 Brand Identity** (`orion_brand_*`) | identidade visual | `generate_palette()`, `brand_contrast()` (WCAG), `brand_book()` |
| **AI-62 Smart Template** (`orion_tpl_*`) | escolhe o template | `orion_tpl_templates` (componentes/cores/fontes/estilo) + `orion_tpl_formats` (rede/largura/altura/aspecto) |
| **AI-63 Creative Layout** (`orion_layout_*`) | **compõe/posiciona** | ← este módulo (a renderização que o AI-62 delega) |

> O AI-62 gerencia **definições** e delega a renderização; o AI-63 é a camada de
> **composição**. As dimensões dos formatos e o catálogo de templates vêm do AI-62 —
> o AI-63 **não recria** esses catálogos.

## Como compõe (determinístico)

1. **Template escolhido** (`clay_pick_template` → AI-62, por segmento/objetivo/formato, ordena por score) define **quais** componentes entram (`componentes`), cores e fontes.
2. **Formato** (`orion_tpl_formats`) dá o canvas (largura×altura/aspecto/rede) → **família** (`clay_familia`): boxy (1:1,4:5), vertical (9:16), horizontal (16:9,1.91:1).
3. **Blueprint** (`orion_layout_templates`, slots normalizados 0..1 por família) diz **onde** cada componente vai — slots de texto **não se sobrepõem por construção**.
4. **`clay_place`** escala normalizado→px, aplica tipografia (tamanho relativo à altura), cor (paleta do template/AI-61) e contraste WCAG (texto do CTA/selo escolhido por `brand_contrast`).
5. **Layout Score** + **validação de acessibilidade** + **preview spec** + **versão imutável**.

## Layout Score (0–100)

`conversao*0.30 + organizacao*0.20 + legibilidade*0.15 + hierarquia*0.15 + acessibilidade*0.12 + balanceamento*0.08`
- **conversão**: presença de preço/CTA/selo/imagem
- **organização**: 0 sobreposição de texto
- **legibilidade**: fonte ≥ mínima
- **hierarquia**: título presente e maior que subtítulo
- **acessibilidade**: contraste WCAG do CTA/selo ≥ 3
- **balanceamento**: whitespace em 0.15–0.62

## Segurança / honestidade

- **Nunca aleatório** — toda posição vem de blueprint + regras.
- **RLS admin** + REVOKE ALL/GRANT SELECT nas 11 tabelas; **`REVOKE EXECUTE FROM PUBLIC,anon`** em todas as `clay_*` (lição AI-61 — Postgres concede EXECUTE a PUBLIC por padrão, o que fura RLS em SECURITY DEFINER).
- **Render binário (PNG/PDF) = Edge Function DECLARADA** — o SQL entrega o *render spec* (canvas + elementos), não o pixel.
- Editor visual drag-and-drop = **roadmap declarado**; v1 entrega composição automática por IA + **preview canvas** e edição via re-geração/otimização.

## Operação

- `orion_creative_layout_tick()` (cron `*/30`) → `clay_metrics_rollup` + `clay_learn` (agrega score por segmento/objetivo/formato).
- Prompts gpt-5-mini via Gateway: `creative_layout.compose/copy/optimize/accessibility`.
- COMANDO TESTE: `SELECT public.clay_selftest();` (14 provas).
