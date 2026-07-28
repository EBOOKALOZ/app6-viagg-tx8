# Sprint de Acabamento Visual — Módulo Leilões e Arremates (2026-07-28)

> Sprint exclusivo de UI/UX/Layout/Responsividade/Identidade Visual, sobre o módulo já homologado pelo SHC. Nenhuma migration, RLS, RPC, regra de negócio ou fluxo foi alterado — confirmado pelo gate final (ver Encerramento).

## Etapa 1 — Padronização das Cores

- Confirmado o amarelo institucional do módulo: token `bg-institutional-yellow` (`--institutional-yellow: 55 91% 56%` em `src/index.css`, equivalente a `#F4E328`/`#F5E62B`, contraste 12.51:1 com texto escuro — muito acima do mínimo WCAG AA de 4.5:1).
- Aplicado o token (substituindo o hex hardcoded `#F5E62B`) em `AuctionMarketDetailPage.tsx`, `AuctionPublicPage.tsx`, `AuctionListPage.tsx`, `AllAuctionsPage.tsx` — os 4 arquivos exclusivos do módulo que ainda usavam o valor literal.
- `MarketLayout.tsx` (compartilhado por todos os módulos do marketplace) não foi tocado — fora do escopo de um sprint dedicado a Leilões.
- Verde de countdown "normal" em `AuctionPublicPage.tsx` corrigido de `#00a300` (hardcoded, divergente) para `#00C58E` (verde oficial da marca, `dark-card.tsx`).

## Etapa 2 — Página "Detalhes do Leilão"

- Fundo institucional amarelo: ✅ já aplicado (token atualizado).
- 📍 Localização · 🚚 Entrega · 📋 Especificações · 💳 Pagamento · 🛡 Garantias · 🏪 Informações da Loja · 📊 Dados do Leilão: ✅ já implementados em `AuctionInfoPanel.tsx`, todos carregados do banco. O bloco 💳 Pagamento é omitido por decisão de dados reais — o schema do vendedor não tem formas de pagamento cadastradas; o componente documenta essa decisão explicitamente ("nenhum dado fictício — campo sem valor no banco fica oculto").
- Estado "não encontrado" redesenhado: ícone com fundo consistente com o dark-card, texto de apoio, CTA com radius/peso padronizados (antes: texto solto sem hierarquia).

## Etapa 3 — "Mais Produtos desta Loja" (`StorePublicPage.tsx`)

- Fundo institucional: ✅ já aplicado (`bg-institutional-yellow`) em sessão anterior deste mesmo dia.
- Placeholder de imagem do produto em destaque padronizado: ícone + rótulo "Sem imagem" com fundo consistente (antes: ícone solto sem contexto visual quando a imagem falha).
- O fallback de bucket (Viagens → Imóveis) foi preservado — é uma tentativa adicional de exibir a imagem real, não lógica de negócio; removê-lo arriscaria regressão de imagens hoje visíveis via esse caminho.

## Etapa 4 — "Leilões da Loja" (`StorePublicPage.tsx`)

- Fundo institucional, cabeçalho, espaçamentos e skeleton de loading: ✅ já implementados em sessão anterior (`bg-institutional-yellow rounded-3xl`, cards brancos preservados, empty state com card tracejado).

## Etapa 5 — Revisão dos Cards

- `MarketAuctionCard.tsx`: já segue o design system oficial (`CardDark`/`DarkBadge`/`CardImageOverlay`). Removida uma prop `tone="green"` morta (sobrescrita sempre por `className`, sem efeito real) no badge de condição do produto.
- Bordas/sombras/radius/tipografia já consistentes com a spec do `dark-card.tsx` em todos os cards do módulo.

## Painel do Lojista — unificação de paleta (decisão tomada com o usuário)

`MerchantAuctions.tsx` e `MerchantArremate.tsx` usavam uma paleta dark divergente (`#1B1F24`/`#14171B`/`#2A3038`/`#F5F7FA`/`#A7B0BE`) da paleta oficial documentada em `dark-card.tsx` (`#1A1F24`/`#252B33`/`#323A45`/`#FFFFFF`/`#8E98A3`), usada por `MerchantArrematesPanel.tsx`. Unificado para a paleta oficial nos dois arquivos (111 ocorrências corrigidas, confirmado por contagem antes/depois). O laranja de marca (`#FF6A00` no painel do lojista vs. `#FF7A00` no design system genérico) foi mantido como está — é usado internamente de forma consistente em cada contexto e trocá-lo em massa (120+ ocorrências, incluindo gradientes e sombras coloridas) tinha risco de regressão visual sem ganho claro.

## Etapa 6 — Imagens

Auditoria completa realizada (Marketplace, Leilões, Viagens, Turismo, Veículos, Imóveis, Serviços). Achados **puramente visuais** corrigidos nesta sessão (fallback do produto em destaque em `StorePublicPage.tsx`). Achados que são **bugs funcionais** (ex.: Leilões sem upload real de imagem, 4 verticais exibindo mídia sem checar `moderation_status`, `auction_media` sem pipeline de escrita) foram deliberadamente **não corrigidos**, por decisão explícita do usuário, e documentados em `DOCS/pendencias-tecnicas-imagens-leiloes-2026-07-28.md` para um ciclo funcional futuro — a restrição do Sprint proíbe alterar lógica/banco/RPCs.

## Etapa 7 — Responsividade

- Grids de listagem confirmados responsivos em 4 breakpoints (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) em `AuctionListPage`, `AllAuctionsPage` e dentro da aba "Leilões da Loja".
- Carrosséis (`AuctionCarousel`, `HorizontalCarousel`) já usam largura de card por breakpoint.
- `AuctionMarketDetailPage` mantida em `max-w-4xl` (896px) por ser a largura correta para legibilidade de conteúdo denso — ampliar prejudicaria a leitura em desktop sem ganho real.

## Etapa 8 — UX

- Loading substituído por **skeleton fiel à silhueta real da página** (galeria + título + preço + CTAs) em `AuctionMarketDetailPage.tsx` e `AuctionPublicPage.tsx` — antes, spinner isolado sem contexto.
- Loading em grid substituído por skeleton de cards (8 placeholders na paleta oficial) em `AuctionListPage.tsx` e `AllAuctionsPage.tsx`.
- Estados "não encontrado" redesenhados nas duas páginas de detalhe, com hierarquia visual, ícone contextual e CTA consistente.
- Novo componente `DarkSkeleton` adicionado ao design system (`src/components/ui/dark-card.tsx`) — reutilizável por qualquer tela dark do módulo (e de outros módulos que sigam a mesma spec).

## Etapa 9 — Identidade Visual

- Cores, tipografia (font-black/uppercase/tracking padronizados), ícones Lucide, botões (`DarkButton`) e cabeçalhos já seguem o mesmo padrão em todas as páginas revisadas.
- Paleta dark do painel do lojista unificada com o restante do módulo (ver acima).

## Etapa 10 — Auditoria Final Visual

| Critério | Status |
|---|---|
| Consistência entre páginas | ✅ Token de cor institucional único; paleta dark unificada em todo o módulo (público + lojista) |
| Responsividade | ✅ Grids e carrosséis confirmados em 4 breakpoints |
| Acessibilidade / Contraste | ✅ Texto principal sobre fundo institucional: 12.51:1 (WCAG AAA) |
| Hierarquia visual | ✅ Skeletons e estados vazios redesenhados com hierarquia clara |
| Navegação | ✅ Sem alteração de rotas ou fluxos |
| Experiência do usuário | ✅ Loading states substituídos por skeletons fiéis ao layout real |

### Verificação técnica (Restrições do Sprint)

- `npx tsc --noEmit`: **limpo**, zero erros em todo o projeto.
- `npm run build` (inclui o gate SHC `verify-shc.mjs`): **exit 0**.
- Gate SHC reexecutado isoladamente após todas as mudanças: **Leilões = APPROVED** (score mantido), demais 11 módulos inalterados (`APPROVED`/`APPROVED_WITH_WARNINGS`, 0 `FAILED`).
- Nenhuma migration, tabela, RLS, RPC ou fluxo de leilão/arremate foi tocado nesta sessão.

## Critérios de Aceite — resultado

- ✅ Identidade visual padronizada (token de cor institucional + paleta dark unificada)
- ✅ Fundos institucionais consistentes em todas as páginas do módulo
- 🟡 Imagens exibidas corretamente **dentro do que é ajustável via UI** — bugs de pipeline de imagem (upload, moderação, resolver) documentados como pendência técnica, não corrigidos por restrição de escopo
- ✅ Sem áreas vazias sem propósito (skeletons e empty states com hierarquia)
- ✅ Experiência visual uniforme entre páginas
- ✅ Responsividade confirmada (desktop/tablet/mobile, grids e carrosséis)
- ✅ Nenhuma regressão funcional (typecheck limpo, build verde, gate SHC intacto)
- ✅ Compatível com a homologação SHC aprovada — estabilidade técnica preservada

## Arquivos alterados

- `src/components/ui/dark-card.tsx` — novo `DarkSkeleton`
- `src/pages/public/AuctionMarketDetailPage.tsx`
- `src/pages/public/AuctionPublicPage.tsx`
- `src/pages/public/AuctionListPage.tsx`
- `src/pages/public/AllAuctionsPage.tsx`
- `src/pages/public/StorePublicPage.tsx`
- `src/pages/merchant/MerchantAuctions.tsx`
- `src/pages/merchant/MerchantArremate.tsx`
- `src/components/advertiser/MarketAuctionCard.tsx`
- `DOCS/pendencias-tecnicas-imagens-leiloes-2026-07-28.md` (novo)
