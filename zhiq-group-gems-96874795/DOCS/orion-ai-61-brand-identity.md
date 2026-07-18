# ORION-AI-61 — Brand Identity AI v1.0 (Inteligência de Identidade Visual)

> **Abre o ORION Design Ecosystem.** Chave: **`brand_identity`**. Painel:
> **`/admin/orion-brand`** (badge BRAND). Tick: **pg_cron `*/15`**.

## Missão

Construir/proteger/padronizar/evoluir a identidade visual de empresas, lojas,
profissionais e marcas — sempre a partir de **dados reais** da plataforma.

## Honestidade: REAL em SQL × DECLARADO (Edge)

| REAL (determinístico, no banco) | DECLARADO (Edge com processamento de imagem/visão) |
|---|---|
| **Motor de cor**: hex↔rgb↔hsl + rotações de matiz + gradiente + **contraste WCAG** (luminância relativa) → `generate_palette` | `analyze_logo` (formato/resolução/vetorização/área de proteção dos **pixels**) |
| Tipografia por regra de segmento (`generate_typography`) | `extract_colors` **de uma imagem** (pixel) |
| Estilo visual por regra (`brand_infer_style`) | Geração das versões do logo (mono/negativa/favicon) |
| Consistência por regra (arte declara cores/fontes → valida vs guidelines) | Export do **Brand Book em PDF** |
| Brand/Identity/Consistency Score por completude; Brand Book (JSON) | (plataforma pré-lançamento → poucas marcas, real) |

> **Prova do motor de cor** (homologação): complementar de `#FF0000` = `#00FFFF` exato;
> contraste WCAG preto/branco = **21.00** (o máximo teórico — valida a luminância).
> É matemática real, não aproximação.

## Fontes REAIS (sondadas 07-17)

`profiles` (name/nome_loja/logo_url/avatar_url/categoria/cidade) + `advertiser_accounts`
(full_name). Homologação: **17 marcas ingeridas** (4 com logo real), cada uma com paleta
gerada (4 cores) + tipografia por segmento.

## Tabelas (12, namespace `orion_brand_*`)

`orion_brand_profiles` · `orion_brand_colors` (hex/hsl/contraste WCAG) · `orion_brand_fonts`
· `orion_brand_guidelines` · `orion_brand_logos` (versões — geração=Edge) · `orion_brand_assets`
· `orion_brand_templates` (por canal) · `orion_brand_versions` (versionamento) ·
`orion_brand_history` (audit) · `orion_brand_recommendations` · `orion_brand_exports`
(PDF=Edge) · `orion_brand_statistics`. RLS admin + REVOKE ALL/GRANT SELECT.

## Motor de cor (o núcleo real)

`brand_hex_to_rgb`, `brand_rgb_to_hex`, `brand_luminance` (WCAG), `brand_contrast`
(razão WCAG), `brand_rotate_hue` (HSL), `brand_hsl_str`, **`generate_palette(hex)`** →
primária + secundária/terciária (análogas ±30°) + complementar (180°) + tríade (±120°)
+ gradiente + neutras + flags de acessibilidade AA. Tudo determinístico, <2s.

## APIs (RPCs)

`create/ingest` (`brand_ingest`), `generate_palette`, `generate_typography`,
`brand_score`, `brand_consistency` (valida arte), `brand_book` (Brand Book JSON),
`brand_snapshot_version`, `brand_export` (PDF=Edge), `brand_overview/list/recommendations_view/dashboard`.

## Consistência (regra da spec)

**Nenhuma arte é aprovada se violar a identidade.** `brand_consistency(brand, arte)`
valida cores/fontes declaradas da arte vs paleta/manual → lista violações. Validação de
**pixel** (analisar a imagem final) = Edge, DECLARADO.

## Scores

- **Brand Score** = completude (logo/paleta/fontes/manual/slogan/estilo).
- **Identity Score** = 50%·brand + 30%·consistency + 20%·estilo+missão.
- **Visual Consistency** = % de cores com contraste WCAG AA (≥4.5:1).

## IA (via AI-00 Gateway, `gpt-5-mini`)

`brand.advisor` (Brand Advisor: "minha marca transmite confiança?"), `brand.palette_explain`,
`brand.consistency`, `brand.recommendation`, `brand.book`.

## Suíte de testes (COMANDO TESTE)

`brand_selftest()` — 9 casos, incluindo **complementar correta** e **contraste WCAG 21:1**
(prova do motor de cor). Homologação: **9/9 aprovado**.

## Segurança (lição sistêmica)

RLS + REVOKE ALL/GRANT SELECT nas tabelas. **HARDENING**: funções SECURITY DEFINER que
LEEM dados furam RLS e o Postgres concede EXECUTE a PUBLIC por default → adicionei
`REVOKE EXECUTE ... FROM PUBLIC, anon` nas funções de dados (anon bloqueado: 42501).
As de matemática pura (color engine) ficam públicas por serem stateless (sem risco).

## Integrações (Design Ecosystem)

Fornece paleta/tipografia/consistência para Design Studio / Smart Template / Creative
Layout / Publisher / Campaign AI (quando existirem). Bus origem `brand_identity` (implícito).

## Arquivos

- Migration: `supabase/migrations/20260717_orion_brand_identity_ai61.sql` (ROLLBACK manual ao fim)
- Painel: `src/pages/admin/AdminOrionBrand.tsx` (+ rota/lazy/sidebar badge BRAND; gerador de paleta interativo)
- API: `DOCS/orion-ai-61-api.md` · Dashboard: `DOCS/orion-ai-61-dashboard.md` · Certificação: `DOCS/orion-ai-61-certificacao.md`
