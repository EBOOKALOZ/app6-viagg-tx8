# ORION-AI-61 — Dashboard `/admin/orion-brand` (badge BRAND)

Fonte única: `brand_dashboard()` (refetch 60s). Arquivo: `src/pages/admin/AdminOrionBrand.tsx`.
Sidebar: grupo ORION → **Brand Identity AI** (ícone Palette, badge **BRAND**), após Knowledge Graph.

## Header

3 scores (Brand/Identity/Consistency médios) + faixa: marcas, com logo, com paleta,
com fontes, com manual, recomendações.

## Abas (6 — cobrem os 12 menus da spec)

1. **Dashboard** — 3 cards de score explicáveis; marcas por estilo visual; evolução 7 dias.
2. **Marcas** — lista de marcas com **swatches da paleta** (WCAG AA no tooltip), fontes,
   consistency %, brand score, logo. Cobre "Marcas/Logotipos/Paletas/Fontes".
3. **Gerador de Paleta** — **motor de cor interativo**: color-picker/hex → `generate_palette`
   ao vivo, mostrando primária/secundária/terciária/complementar/tríade + gradiente +
   **contraste WCAG real** (vs branco/preto, flags AA) + neutras. É o coração real do módulo.
4. **Consistência** — valida uma arte (marca + cores) → aprovado/reprovado + violações.
   Cobre "Consistência" (nenhuma arte aprovada se violar a identidade).
5. **Recomendações** — Brand Advisor: melhorias priorizadas por lacuna (sem logo/manual/contraste).
6. **Config** — cron, modelo, motor de cor, nota de segurança + declarado (Edge/futuro).

## Mapeamento spec → painel

Os 12 menus da spec (Dashboard/Marcas/Logotipos/Paletas/Fontes/Elementos/Manual/
Consistência/Recomendações/Downloads/Histórico/Config) foram consolidados em 6 abas:
Logotipos/Paletas/Fontes vivem dentro de **Marcas** (swatches + fontes por marca) e do
**Gerador de Paleta**; Manual/Downloads = `brand_book`/`brand_export` (PDF=Edge declarado);
Histórico = `orion_brand_versions`/`orion_brand_history`.

## Guarda

Funções de dados admin-only (RLS + REVOKE PUBLIC/anon → 42501). O motor de cor é público
(matemática pura, sem dados). Painel atrás de ProtectedRoute requireAdmin.
