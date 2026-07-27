# SHC — Auditoria Completa do Prompt 1 (Pós-Correções) — Leilões & Arremates

**Data:** 2026-07-27 · **Branch:** `analise-programador` · **Auditor:** Claude (SHC)
**Método:** evidência real apenas — navegador Chromium (Playwright), banco vivo (`supabase db query --linked`), build/typecheck reais. Nada foi considerado "pronto" pela mera existência do código.

---

## Parecer Final: 🟡 APROVADO COM RESSALVAS

Os itens **P0/P1 encontrados durante a auditoria foram corrigidos no mesmo ciclo (regra SHC) e re-homologados com evidência de navegador e de banco**. Permanecem 3 ressalvas P2 de banco de dados (migration recomendada abaixo, ainda não aplicada) e observações P3. Nenhum P0/P1 aberto.

| Score | Valor |
|---|---|
| Implementação | **92/100** |
| Homologação | **95/100** (61 verificações reais; 0 falhas remanescentes no módulo) |
| Segurança | **85/100** (RLS íntegro; ressalvas: FK ausente, `search_path` em 2 RPCs) |
| Performance | **80/100** (build ok; chunks >1MB pré-existentes fora do módulo) |

---

## 1. Relatório Executivo

O fluxo final do leilão (`Leilões → Lista → Loja → Produto`) agora exibe o **cabeçalho oficial completo da loja** no anúncio, com o mesmo componente dos demais módulos (`StoreHeader`), em desktop, tablet e mobile (320–1440px), com Seguir/Compartilhar funcionais testados como visitante anônimo. A fusão do botão vermelho de som no botão branco "Som" (UI-02) e a contenção do painel de áudio na viewport (UI-03) foram **aprovadas integralmente** em 7 larguras de tela.

A auditoria descobriu, porém, que a versão entregue no Prompt 1 **não funcionava contra o banco real** (o cabeçalho continuava sumindo): o hook oficial de identidade consultava colunas que **não existem** (`merchant_stores.profile_id`, `advertiser_accounts.profile_id`) e filtrava `status='active'` quando o banco usa também `'Ativa'`. Todas as contagens de anúncios do cabeçalho falhavam com 400 em toda a plataforma. Esses defeitos foram corrigidos, re-testados no navegador e certificados com evidência.

## 2. Lista de Bugs

### Corrigidos neste ciclo (com evidência de re-homologação)

| ID | Sev. | Descrição | Correção | Evidência |
|---|---|---|---|---|
| P0-1 | P0 | Cabeçalho da loja não renderizava em `/leilao/:id` e `/arremate/:id`: `useAdvertiserSummary` consultava `merchant_stores.profile_id` (coluna inexistente → PostgREST **400**) e exigia `status='active'` (banco real: `'Ativa'`) | `or(id,user_id)` + `in('active','Ativa')` + mapeamento de colunas reais (`nome_loja`, `descricao`, `cidade/estado`, `street/number`) | `st-banner=1` em 1440/390/320px; screenshot `retest-leilao-desktop.png` |
| P1-1 | P1 | Contagem de anúncios do cabeçalho 100% quebrada na plataforma: 5 tabelas consultadas com colunas/enums inexistentes (`profile_id`, `status`; enums divergem `active`×`published`) → 400 em todas | Contagem via **views públicas** `public_*_listings` + `products` por `store_id` + inclusão de `auction_listings`; `travel_listings` só com sessão (anon não tem grant) | Header exibe "16 Produtos"; zero 400 do módulo no console |
| P2-1 | P2 | `views_count` congelado para visitantes (UPDATE direto negado pela RLS → 401 no console em toda visita) | RPC `increment_auction_view` (SECURITY DEFINER, grant `anon`, `search_path` fixado) nas 2 páginas | `views_count=42` incrementando no banco vivo |

### Abertos (ressalvas)

| ID | Sev. | Descrição | Recomendação |
|---|---|---|---|
| P2-2 | P2 | `auction_bids` **sem FK** para `auction_listings` — 2 lances órfãos reais (de 17) | Migration: limpeza + `FOREIGN KEY ... ON DELETE CASCADE` |
| P2-3 | P2 | `place_auction_bid` e 1 overload de `submit_arremate_offer` são SECURITY DEFINER **sem `search_path` fixado**; overload duplicado de `submit_arremate_offer` | Migration: `ALTER FUNCTION ... SET search_path=public`; remover overload antigo |
| P2-4 | P2 | Vocabulário de status misto em `merchant_stores` (`active`/`Ativa`/`pending`) sem CHECK | Migration: normalizar para `active` + CHECK constraint (o front já aceita ambos) |
| P3-1 | P3 | `types.ts` desatualizado vs banco (ex.: `auction_listings.owner_user_id` ausente; `store_id` NOT NULL na tipagem, nullable no banco — 2 listings reais com NULL) | `npx supabase gen types typescript --linked` |
| P3-2 | P3 | 401 de `motoboy_profiles` (widget de cidade) polui o console de TODAS as páginas do marketplace (RLS nega SELECT anon) — fora do módulo | View pública p/ lookup de cidade ou suprimir consulta anon |
| P3-3 | P3 | Painel de áudio: clique-fora não fecha sobre regiões com handlers de arrasto (carrosséis); fecha normalmente em conteúdo comum e via toggle do botão | Listener em fase de captura (`{capture:true}`) |
| P3-4 | P3 | Botão de mute do painel sem `aria-label`; 76 `no-explicit-any` de ESLint pré-existentes nos arquivos do módulo | Limpeza incremental |

## 3. Matriz de Conformidade (escopo do prompt)

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Cabeçalho da loja no produto (logo, nome, selo, cidade/UF, categoria, descrição, contagem, seguidores, Seguir, Compartilhar) | ✅ (pós-correção) | Screenshot desktop/320; Seguir→Seguindo→desfazer real como anônimo; Compartilhar presente |
| 1 | Mesmo componente dos demais módulos | ✅ | `StoreHeader` + `StoreThemeScope` + `useAdvertiserSummary` — idêntico a Imóveis ([RealEstateDetailPage.tsx:221](../src/pages/real-estate/RealEstateDetailPage.tsx#L221)) |
| 2 | Botão vermelho removido; botão branco "Som" com toda a função | ✅ | 0 botões circulares vermelhos; portal único; toggle mute muda badge "Mudo" + ícone vermelho/verde |
| 3 | Painel de áudio 100% na viewport (desktop/tablet/mobile) | ✅ | Rects medidos nas 7 larguras — todos dentro; scroll interno via `maxHeight` dinâmico |
| 4 | Fluxo completo sem perda de informação | ✅ | Lista→clique→`/loja/:id?tab=leiloes&product=:id` (header ✓)→produto com header, fotos, lances, histórico, CTAs |
| 5 | Responsividade 320/360/375/390/414/768/1440 | ✅ | `scrollWidth == innerWidth` nas 21 combinações página×largura (zero overflow) |
| 6 | Frontend | ✅ | `tsc` exit 0; `vite build` ✓ 44s; console do módulo limpo pós-correção |
| 7-8 | Backend/Banco | ✅ c/ ressalvas | RLS habilitado nas 7 tabelas; políticas corretas; 90+ RPCs SECURITY DEFINER; anti-sniper trigger; 15 índices; ressalvas P2-2/3/4 |
| 9 | Segurança (Broken Access, IDOR, SQLi, XSS, CSRF, exposição) | ✅ c/ ressalvas | UPDATE anônimo negado (401 real); `profiles` só self/admin; bids só `auth.uid()=user_id`; sem `dangerouslySetInnerHTML` no módulo; SPA bearer (CSRF n/a) |
| 10 | Performance | ✅ | Build 44s; índice principal 923KB (277KB gzip); DCL 609ms, load 1.4s, heap 28MB (dev) |

## 4. Evidências

- Screenshots + `results.json` (45 verificações da 1ª rodada): [DOCS/evidencias/leiloes-shc-2026-07-27/](evidencias/leiloes-shc-2026-07-27/)
- Banco vivo: `merchant_stores` sem `profile_id` (26 colunas reais); status `{pending:5, Ativa:2, active:1}`; `views_count` 33→42 durante os testes; políticas/índices/triggers listados via `pg_policies`/`pg_indexes`/`information_schema.triggers`
- Leilão de teste: `c2cfbb53-a5db-42c7-9e4c-08731a79d1ae` (loja `9cb222df-…`, "Campo Aberto Agropecuária")
- Não testado por ausência de dados reais: `/arremate/:id` com arremate vivo (0 no banco) — código idêntico ao do leilão; Lighthouse não executado (dev server distorce; rodar contra `vite preview` na homologação de release)

## 5. Migration recomendada (NÃO aplicada — ressalvas P2)

```sql
-- P2-2: integridade de lances
DELETE FROM auction_bids b WHERE NOT EXISTS (SELECT 1 FROM auction_listings l WHERE l.id = b.listing_id);
ALTER TABLE auction_bids ADD CONSTRAINT auction_bids_listing_fk
  FOREIGN KEY (listing_id) REFERENCES auction_listings(id) ON DELETE CASCADE;

-- P2-3: hardening SECURITY DEFINER
ALTER FUNCTION public.place_auction_bid(uuid, bigint) SET search_path = public;
-- (identificar e remover o overload antigo de submit_arremate_offer sem search_path)

-- P2-4: vocabulário único de status de loja
UPDATE merchant_stores SET status = 'active' WHERE status = 'Ativa';
ALTER TABLE merchant_stores ADD CONSTRAINT merchant_stores_status_chk
  CHECK (status IN ('active','pending','suspended','inactive'));
```

*(Validar assinaturas exatas com `\df public.place_auction_bid` antes de aplicar.)*
