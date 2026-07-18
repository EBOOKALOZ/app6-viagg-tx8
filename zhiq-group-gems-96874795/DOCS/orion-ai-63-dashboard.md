# ORION-AI-63 — Creative Layout AI · Dashboard

> **`/admin/orion-creative-layout`** · badge **LAYOUT** (sidebar ORION AI CENTER,
> ícone Wand2, tema fúcsia) · fonte única RPC `clay_dashboard()` (auto-refresh 60s).
> Página `src/pages/admin/AdminOrionCreativeLayout.tsx`.

## Header — Creative Layout Center
Score médio (destaque) + % aprovados + 6 cards: layouts, hoje, exportados,
templates (AI-62), formatos (AI-62), aprovados %.

## 7 abas

1. **Preview** — **canvas ao vivo** que renderiza a composição (elementos posicionados
   em escala real: título/preço/CTA/selo/logo/imagem/contato), + Layout Score do layout
   e selos de validação (sem sobreposição · contraste WCAG · fonte mínima · toque CTA).
   Chips para abrir outros layouts recentes.
2. **Layouts** — distribuição de score (ótimo/bom/regular/baixo) + tabela dos recentes
   (formato/família/objetivo/score/status) com botão **ver** (carrega o preview).
3. **Qualidade & Score** — breakdown do Layout Score (conversão/organização/legibilidade/
   hierarquia/acessibilidade/balanceamento com pesos) + sinais + checagens de acessibilidade.
4. **Blueprints** — famílias estruturais (boxy/vertical/horizontal) e nº de slots.
5. **Componentes** — catálogo de roles (tipo/hierarquia/tamanho relativo/descrição).
6. **Métricas** — tabela diária (criados/usados/exportados/score médio/aprovados %).
7. **Integrações** — status do Ecossistema de Design (Smart Template AI-62, Brand
   Identity AI-61, render PNG via Edge) + garantias (nunca aleatório · WCAG · sem sobreposição).

## Como o preview é renderizado
`clay_preview(id)` devolve `{canvas:{w,h}, elementos:[{x,y,w,h,z,tipo,texto,cor,tipografia}]}`.
O componente `CanvasPreview` escala o canvas (`maxW/canvas.w`) e posiciona cada elemento
absolutamente. Semântica por `tipo`: **media** = placeholder (LOGO/QR/IMAGEM, imagem full-bleed
com gradiente); **cta/badge** = retângulo preenchido (bg/fg reais); **preço** = texto forte na
cor de destaque; **texto/contato** = texto na cor real (com scrim quando sobre imagem).

## Cores e semântica
- Score: verde ≥85 · lima ≥70 · âmbar ≥50 · vermelho <50.
- Selos de validação: verde ✓ / vermelho ✕.
- Tema fúcsia distingue o AI-63 (Creative Layout) do AI-61 Brand (paleta) e AI-62 Template.
