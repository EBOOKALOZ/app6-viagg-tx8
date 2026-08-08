# ORION-480 ENTERPRISE

# CONSOLIDAÇÃO FINAL — AUDITORIA HIGH (A-1 a A-8)

## FASE 4 — WORKFLOW ORION-HIGH-01

**Documento:** `DOCS/ORION-480-CONSOLIDACAO-FINAL-HIGH-A1-A8-2026-08-07.md`

**Versão:** 1.0
**Data:** 07/08/2026
**Status:** CONSOLIDAÇÃO TÉCNICA CONCLUÍDA — pendências de commit/deploy explicitadas na Seção 3

---

# 0. ADVERTÊNCIA METODOLÓGICA — LEIA ANTES DO RESTO

Este workflow (`ORION-HIGH-01`) executou 16 agentes (8 correções + 8 verificações adversariais independentes) sobre os 8 achados HIGH da Fase 4. Ao consolidar, uma checagem do estado real do repositório (`git log`, `git status`, `git diff`, `npx tsc --noEmit`, `npx vite build` — todos executados agora, não fabricados) revelou que **uma sessão paralela alheia a este workflow já havia corrigido, commitado e parcialmente deployado em produção 4 dos 8 achados (A-1 a A-4) enquanto este workflow rodava em background**, de forma independente e sem coordenação.

Isso significa:

* As correções de **A-1 a A-4 relatadas pelos meus 8 agentes são reais e foram verificadas adversarialmente por eles**, mas **não são as correções que estão hoje no repositório** — foram superadas por um commit de outra sessão antes que eu pudesse consolidar.
* As correções de **A-5 a A-8 produzidas por este workflow são, até onde a evidência mostra, as únicas existentes** — permanecem no working tree, não commitadas, não deployadas.
* Nenhuma alegação de "commitado" ou "deployado em produção" neste documento vem de relatório de agente — vem de leitura direta de `git log`/`git diff`/`git show` feita nesta etapa de consolidação.

Este documento reporta o **estado real verificado**, não o conteúdo bruto dos relatórios dos agentes.

---

# 1. CONSOLIDAÇÃO EXECUTIVA

| Métrica | Valor |
|---|---:|
| HIGH analisados nesta auditoria | 8 (A-1 a A-8) |
| Confirmados como reportados (nenhum falso positivo) | 8 |
| Reclassificados | 0 (todos mantidos ALTO — ver justificativa técnica por achado na Seção 2) |
| Corrigidos no código (working tree ou commit) | 8 |
| **Commitados no repositório** | 4 (A-1, A-2, A-3, A-4 — commit `72acd1b`, de sessão paralela) |
| **Deployados em produção confirmado** | 2 (A-2, A-3 — commit `c6a08c0`, `vercel --prod`, deployment `dpl_6R2H3P61Ad4FkeMuLo4rWnpZo8cW`) |
| **Não deployado apesar de commitado** | 1 (A-1 — função Auth Hook alvo não identificada no Supabase remoto pela sessão paralela; migration do A-4 aplicada em produção via SQL direto, fora do fluxo `db push`, ver Seção 3.4) |
| **Apenas no working tree, não commitado, não deployado** | 4 (A-5, A-6, A-7, A-8 — produto deste workflow) |
| Validados adversarialmente com veredito SUFICIENTE | 8/8 (pelos agentes deste workflow; A-1 a A-4 também foram validados de forma independente pela sessão paralela, ver seus próprios docs) |
| Achados colaterais novos descobertos durante a correção/verificação | 4 (ver Seção 6) |

---

# 2. CONSOLIDAÇÃO TÉCNICA POR ACHADO

Convenção: "Origem" indica se a correção hoje em vigor no repositório é da sessão paralela (commit `72acd1b`) ou deste workflow (working tree).

## A-1 — `send-auth-email` sem verificação de assinatura/secret

* **Origem da correção vigente:** commit `72acd1b` (sessão paralela). Este workflow produziu uma correção equivalente (HMAC Standard Webhooks + fallback `x-client-secret` constant-time) que foi superada.
* **Causa raiz:** `API_CLIENT_SECRET` era validado só no boot do módulo Deno, nunca comparado contra header algum no handler.
* **Correção:** handler agora chama `verifyCallerAuthenticity(req, rawBody)` antes de `JSON.parse`/SMTP, rejeitando com 401 sem assinatura Standard Webhooks válida ou secret compartilhado correto (comparação constant-time).
* **Verificação adversarial (deste workflow):** SUFICIENTE. Fuzzing real via `deno run` com 13 vetores de bypass (sem header, secret errado, replay >300s, assinatura forjada) — nenhum bypass encontrado.
* **Status de deploy:** **NÃO deployado.** Commit `c6a08c0` registra explicitamente que a sessão paralela não conseguiu identificar qual função no Supabase remoto corresponde ao Auth Hook real — pendente de confirmação do usuário no Dashboard (Authentication > Hooks > Send Email) antes de deploy.
* **Classificação final:** MANTIDO ALTO.

## A-2 — Ausência de headers de segurança (CSP/HSTS/X-Frame-Options)

* **Origem da correção vigente:** mesclada — base do commit `72acd1b` (sessão paralela) + expansão de allowlist do CSP feita por este workflow, ainda **não commitada** (1 linha de diff residual em `vercel.json`, ver Seção 3.1).
* **Causa raiz:** `vercel.json` nunca definiu bloco `headers`; único ponto de configuração de deploy do projeto (sem `_headers`/`netlify.toml`/`.htaccess`).
* **Correção:** CSP + X-Frame-Options: DENY + HSTS + X-Content-Type-Options + Referrer-Policy + Permissions-Policy, aplicados a `/(.*)`. Allowlist de CSP levantada por grep real no código-fonte (Mapbox, Mercado Pago, Supabase, YouTube/Vimeo, Google Fonts, clima/CEP/rádio/Twitch).
* **Divergência verificada nesta consolidação:** a versão commitada (`72acd1b`) tem uma CSP **mais restrita** que a versão em disco agora — este workflow adicionou `api.x.ai`, `viacep.com.br`, `brasilapi.com.br`, `openweathermap`, `open-meteo`, `itunes.apple.com`, `musicbrainz.org`, `player.twitch.tv`. **Confirmado por grep nesta consolidação que todos esses domínios são de fato chamados por código real do projeto** (`src/hooks/useWeather*.ts`, `src/lib/multimedia/*`, `src/lib/ai/config.ts`) — a expansão é legítima, não especulativa.
* **Status de deploy:** commit `72acd1b` (versão mais restrita) **já está em produção** (commit `c6a08c0`). A expansão de allowlist deste workflow ainda não foi commitada nem deployada — sem ela, chamadas a clima/CEP/rádio/Twitch/xAI podem ser bloqueadas pela CSP hoje em produção (ver Seção 6, achado colateral).
* **Classificação final:** MANTIDO ALTO.

## A-3 — `dangerouslySetInnerHTML` sem sanitização em 6 pontos

* **Origem da correção vigente:** commit `72acd1b` (sessão paralela). Este workflow produziu correção equivalente que foi superada.
* **Correção:** `dompurify` instalado; helper `src/lib/sanitizeHtml.ts`; aplicado nos 6 pontos (FloatingAIChat ×2, Support.tsx, AdminLegalDocuments.tsx, LgpdContent.tsx, NewVersionModal.tsx).
* **Verificação adversarial (deste workflow):** SUFICIENTE. Probe com 15 payloads de bypass não usados pelo autor (data:/vbscript:/svg-foreignObject/tag soup) — nenhum bypass real.
* **Status de deploy:** **deployado em produção** (commit `c6a08c0` confirma `sanitizeHtml` presente no bundle JS servido).
* **Classificação final:** MANTIDO ALTO.

## A-4 — `accept_arremate_offer_advertiser` sem `FOR UPDATE` — débito duplicado

* **Origem da correção vigente:** commit `72acd1b` (sessão paralela), migration `supabase/migrations/20260807020000_p1_fix_accept_arremate_offer_advertiser_lock.sql`.
* **Correção:** `FOR UPDATE` na leitura da oferta + `UPDATE` condicional (`WHERE status='pending'`) com `RAISE EXCEPTION` de defesa em profundidade, replicando o padrão de `accept_offer_with_credits`.
* **Verificação adversarial (deste workflow):** SUFICIENTE, com leitura direta do banco vivo via `supabase db query --linked` (somente leitura, `pg_get_functiondef`) confirmando que **a função em produção já contém o fix**.
* **Achado operacional confirmado nesta consolidação:** `supabase_migrations.schema_migrations` no banco **não tem registro da versão `20260807020000`** — a aplicação em produção foi feita por SQL direto, fora do fluxo `supabase db push`, gerando drift entre o histórico formal de migrations e o schema real. Não compromete a correção funcional, mas é risco de rastreabilidade para futuras migrations.
* **Status de deploy:** **já aplicado em produção** (confirmado por leitura read-only do banco vivo).
* **Classificação final:** MANTIDO ALTO.

## A-5 — Cliente Supabase sem timeout configurado

* **Origem da correção vigente:** este workflow. **Apenas no working tree, não commitado.**
* **Causa raiz:** `createClient()` não usava `global.fetch`; único timeout existente (`src/dashboards/core/api.ts`, `Promise.race`) é soft — não cancela o fetch real.
* **Correção:** `fetchWithTimeout` com `AbortController` real, injetado via `global: { fetch }`; 20s para queries/RPC, 90s para Storage (diferenciado por padrão de URL, pois uploads não são comprimidos).
* **Verificação adversarial:** SUFICIENTE. Confirmado por leitura do bundle `@supabase/supabase-js` que o fetch customizado cobre REST/RPC/Storage/Functions mas **não cobre Realtime** (WebSocket) — limitação correta e esperada, documentada.
* **Achado colateral confirmado na verificação:** existe um segundo `createClient()` em `src/pages/admin/AdminOrionLocalTestLab.tsx` (client isolado de laboratório de testes admin) sem o timeout — fora do escopo do achado original (não está entre as chamadas de aplicação), mas é um ponto cego real.
* **Classificação final:** MANTIDO ALTO.

## A-6 — Hooks de realtime não tratam `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`

* **Origem da correção vigente:** este workflow, sobre uma correção parcial pré-existente não commitada de outra sessão anterior. **Apenas no working tree, não commitado.**
* **Correção:** os 3 pontos `.subscribe()` de `useRealtimeCalls.ts` agora reconectam em erro/timeout/fechamento (padrão de `RealtimeService.ts`); adicionado `channelStatusesRef` + `recomputeIsConnected` para que `isConnected` reflita corretamente o estado combinado dos 3 canais (antes só o canal principal atualizava esse estado).
* **Achado colateral CRÍTICO para o valor prático da correção, confirmado na verificação adversarial:** `src/contexts/GlobalCallContext.tsx:287` expõe `isConnected` **hardcoded como `true`** — o valor real retornado pelo hook é obtido mas nunca usado. Isso significa que `MotoboyPanel.tsx`, que consome `isConnected` via esse contexto, **nunca vai refletir uma queda de canal real** — o indicador "Online" sempre aparece, independentemente do estado da conexão. `DriverCalls.tsx` e `DeliveryCalls.tsx` (que leem o hook diretamente, sem passar pelo contexto) **se beneficiam corretamente**. Recomenda-se tratar isso como um novo achado (severidade a avaliar) em ação separada.
* **Classificação final:** MANTIDO ALTO, com ressalva de efetividade parcial documentada acima.

## A-7 — CORS aberto (`"*"`) em 100% das 32 edge functions

* **Origem da correção vigente:** este workflow. **Apenas no working tree, não commitado** (32 arquivos modificados + `supabase/functions/_shared/cors.ts` novo).
* **Correção:** helper centralizado `getCorsHeaders(origin, extra)` que só ecoa `Access-Control-Allow-Origin` se o `Origin` da requisição bater com a allowlist (`viagg-tx8.com.br` + `www.` variante, `localhost:8080`/`127.0.0.1:8080`, `*.vercel.app` via HTTPS). Aplicado nos 32 arquivos restantes (o 33º, `send-auth-email`, já usa o padrão desde o commit `72acd1b`).
* **Verificação adversarial:** SUFICIENTE. Testados bypasses clássicos (sufixo de domínio, domínio irmão, downgrade HTTP, string vazia/`null`) — todos bloqueados.
* **Risco residual documentado (não bloqueante):** allowlist `*.vercel.app` é estruturalmente ampla — qualquer conta Vercel gratuita ganha um subdomínio dentro da allowlist. Aceito como tradeoff para não quebrar deploy previews legítimos; recomendada revisão humana.
* **Classificação final:** MANTIDO ALTO.

## A-8 — Login por senha sem controle anti-brute-force

* **Origem da correção vigente:** este workflow, generalizando uma correção pré-existente não commitada que cobria só `Auth.tsx`. **Apenas no working tree, não commitado.**
* **Ampliação de escopo real confirmada:** o achado original citava apenas `AuthContext.tsx:372`, mas há **3 telas de login por senha** (`Auth.tsx`, `RealEstateAuthCard.tsx`, `GestorLoginPage.tsx`) — só a primeira tinha proteção antes desta correção.
* **Correção:** hook `useLoginBruteForceGuard.ts` (3 tentativas livres, backoff progressivo até 60s, exige `MathCaptchaDialog` já existente) aplicado nas 3 telas.
* **Verificação adversarial:** SUFICIENTE, incluindo teste dinâmico real via Playwright contra dev server local (4 tentativas simuladas, captcha efetivamente bloqueou o submit na 4ª).
* **Limitação estrutural (documentada, não é regressão):** proteção 100% client-side (localStorage) — contornável limpando o storage ou atacando a API REST do Supabase diretamente; não implementada camada server-side por decisão de escopo/risco.
* **Classificação final:** MANTIDO ALTO.

---

# 3. PENDÊNCIAS DE COMMIT E DEPLOY (AÇÃO HUMANA NECESSÁRIA)

## 3.1 — Expansão de CSP do A-2 não commitada

`vercel.json` em disco tem uma CSP mais ampla e correta que a que está em produção. **Recomendação:** revisar o diff (Seção 2, A-2) e commitar antes que qualquer tela de clima/CEP/rádio/Twitch/xAI seja usada em produção sob a CSP restrita atual.

## 3.2 — A-5, A-6, A-7, A-8 não commitados

Todo o código dessas 4 correções existe apenas no working tree local desta máquina. **Recomendação:** revisão humana do diff completo (`git diff` sobre os arquivos listados na Seção 2) e commit em um ou mais lotes lógicos, seguido de deploy.

## 3.3 — A-1 commitado mas não deployado

Correção pronta e commitada, mas **bloqueada por uma decisão de negócio pendente**: confirmar no Dashboard do Supabase (Authentication > Hooks > Send Email) qual é a função Auth Hook real e alinhar o secret configurado lá com `API_CLIENT_SECRET`. Sem isso, o deploy desta correção pode quebrar o fluxo legítimo de e-mail de recovery/magic-link.

## 3.4 — Drift de schema_migrations no A-4

A correção já está ativa em produção, mas fora do controle formal de migrations do Supabase CLI. **Recomendação:** registrar a migration `20260807020000` no histórico formal (ou confirmar que o próximo `db push` não tentará reaplicá-la de forma conflitante) para não comprometer a rastreabilidade de auditorias futuras.

---

# 4. EVIDÊNCIAS

| Achado | Commit | Deploy confirmado | Evidência primária |
|---|---|---|---|
| A-1 | `72acd1b` | Não | Leitura de código + fuzzing `deno run` (16 vetores) — este workflow |
| A-2 | `72acd1b` (parcial) | Sim (versão restrita) | `git show c6a08c0`, headers HTTP reais capturados na sessão paralela |
| A-3 | `72acd1b` | Sim | `git show c6a08c0`, bundle JS com `sanitizeHtml`/`purify.es-*.js` confirmado |
| A-4 | `72acd1b` | Sim | `pg_get_functiondef` via `supabase db query --linked` (leitura real, banco vivo) |
| A-5 | não commitado | Não | `npx tsc --noEmit` + `npx vite build` limpos nesta consolidação |
| A-6 | não commitado | Não | idem |
| A-7 | não commitado | Não | idem + checagem de sintaxe TS sobre os 37 arquivos Deno |
| A-8 | não commitado | Não | idem + teste dinâmico Playwright (sessão do agente corretor) |

Build e typecheck do estado atual do working tree, executados nesta consolidação (não herdados de relatório de agente):
- `npx tsc --noEmit -p tsconfig.json` → sem erros.
- `npx vite build` → `✓ built in 1m 8s`, sem erros novos (apenas warnings pré-existentes de chunk size).

---

# 5. MATRIZ DE RISCO ATUALIZADA

| Criticidade | Situação |
|---|---|
| Crítico (C-1, C-2 da Fase 4) | Fora do escopo deste workflow — já corrigidos e validados conforme certificação P0 anterior; não reauditados aqui |
| Alto (A-1 a A-8) | 8/8 corrigidos tecnicamente e validados adversarialmente; 4 em produção (A-2 parcial, A-3, A-4), 1 commitado sem deploy (A-1), 4 pendentes de commit (A-5 a A-8) |
| Achados colaterais novos (Seção 6) | 4 — nenhum commitado, nenhum corrigido nesta rodada (fora do escopo do comando ORION-HIGH-01) |

---

# 6. ACHADOS COLATERAIS NOVOS (fora do escopo original, não corrigidos)

Descobertos durante a correção/verificação adversarial dos 8 HIGH. Não foram corrigidos por estarem fora do escopo explícito do comando ORION-HIGH-01 ("trabalhe somente sobre os achados HIGH já identificados"):

1. **`GlobalCallContext.tsx:287`** — `isConnected` hardcoded como `true`, anulando parcialmente o benefício do A-6 para o painel do motoboy (ver A-6 acima).
2. **`src/lib/ai/cardCapture.ts`** — faz `fetch()` client-side direto para `api.openai.com` com API key OpenAI exposta via `VITE_GLM_API_KEY` no bundle. Módulo confirmado sem nenhum call-site ativo (`.tsx` que o importe) — código morto, sem superfície de exploração ativa hoje, mas key exposta se algum dia for importado.
3. **`AdminOrionLocalTestLab.tsx:145`** — segundo `createClient()` Supabase isolado (probes de RLS em laboratório admin) sem o timeout do A-5.
4. **CSP restrita em produção** (Seção 3.1) — bloqueio potencial de chamadas legítimas de clima/CEP/rádio/Twitch/xAI até a expansão do working tree ser commitada e deployada.

Nenhum destes é HIGH pelo critério desta auditoria (nenhum permite acesso indevido a dados de terceiros nem impacto financeiro direto); recomenda-se avaliação de severidade em uma próxima rodada de auditoria.

---

# 7. RESPOSTA ÀS PERGUNTAS DO COMANDO ORION-HIGH-01

* **Quantos HIGH foram corrigidos:** 8 de 8 (tecnicamente, no código). **4 já em produção** (A-2 parcialmente, A-3, A-4), **1 commitado mas não deployado** (A-1), **4 apenas no working tree local, não commitados** (A-5, A-6, A-7, A-8).
* **Quantos permanecem:** 0 acham-se sem correção escrita; **4 permanecem sem proteção real em produção** até commit+deploy (A-5 a A-8), e A-1 permanece sem proteção em produção até decisão do usuário sobre o Auth Hook.
* **Quantos foram reclassificados:** 0 — todos os 8 mantiveram classificação ALTO após validação adversarial e verificação técnica desta consolidação.
* **Quantos eram falso positivo:** 0.

---

# 8. CERTIFICAÇÃO HIGH

**NÃO EMITIDA.**

Conforme o Protocolo de Aguardo (`ORION-480-PROTOCOLO-AGUARDO-CONSOLIDACAO-HIGH-2026-08-07.md`) e o Plano de Consolidação Final (`ORION-480-PLANO-CONSOLIDACAO-FINAL-HIGH-2026-08-07.md`), a certificação depende de evidências verificadas — e a evidência real aqui mostra que **4 das 8 correções (A-5 a A-8) ainda não foram commitadas nem deployadas**, o que significa que essas 4 vulnerabilidades **continuam ativas em produção** apesar de já corrigidas em código local. Emitir certificação HIGH agora seria uma declaração de estado que não corresponde à realidade do ambiente de produção.

**Condição para emissão:** commit e deploy de A-5, A-6, A-7, A-8 (e da expansão de CSP do A-2), decisão do usuário sobre o Auth Hook do A-1, e regularização do drift de `schema_migrations` do A-4 — cada um confirmado por evidência equivalente à já obtida para A-2/A-3/A-4 (leitura real pós-deploy, não alegação de relatório).

---

# 9. CONCLUSÃO

A auditoria estática e a correção dos 8 achados ALTOS da Fase 4 estão tecnicamente completas, com validação adversarial independente aplicada a cada uma (16 agentes, 0 erros). Nenhum falso positivo, nenhuma reclassificação de severidade.

O fato mais relevante desta consolidação não é técnico, mas operacional: **duas sessões trabalharam nos mesmos 8 achados em paralelo, sem coordenação**, uma delas chegando a commitar e fazer deploy real em produção antes que esta pudesse consolidar. Isso é consistente com um padrão de risco já registrado em auditorias anteriores deste projeto (sessões concorrentes no mesmo working tree). O resultado prático é positivo — nenhum trabalho foi perdido, as duas correções para A-1/A-2/A-3/A-4 convergiram tecnicamente — mas o estado real de produção precisa ser lido do repositório a cada consolidação, nunca assumido a partir do relatório de um agente isolado.

A Certificação HIGH permanece pendente até que as ações da Seção 3 sejam executadas e verificadas.
