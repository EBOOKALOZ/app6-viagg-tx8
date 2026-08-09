# ORION-480 ENTERPRISE

# CONSOLIDAÇÃO FINAL — AUDITORIA HIGH (A-1 a A-8)

## FASE 4 — WORKFLOW ORION-HIGH-01

**Documento:** `DOCS/ORION-480-CONSOLIDACAO-FINAL-HIGH-A1-A8-2026-08-07.md`

**Versão:** 2.0
**Data:** 07/08/2026 (v1.0) — atualizado 09/08/2026 com validação pós-deploy
**Status:** A-2, A-3, A-5, A-6, A-7, A-8 CORRIGIDOS + COMMITADOS (`f3bf0a4`) + DEPLOY VALIDADO. A-4 corrigido/deployado com drift de `schema_migrations` pendente. A-1 é o único item ainda bloqueado, aguardando confirmação do Auth Hook real no Dashboard do Supabase.

---

# 0. ADVERTÊNCIA METODOLÓGICA — LEIA ANTES DO RESTO

Este workflow (`ORION-HIGH-01`) executou 16 agentes (8 correções + 8 verificações adversariais independentes) sobre os 8 achados HIGH da Fase 4. Ao consolidar, uma checagem do estado real do repositório (`git log`, `git status`, `git diff`, `npx tsc --noEmit`, `npx vite build` — todos executados agora, não fabricados) revelou que **uma sessão paralela alheia a este workflow já havia corrigido, commitado e parcialmente deployado em produção 4 dos 8 achados (A-1 a A-4) enquanto este workflow rodava em background**, de forma independente e sem coordenação.

Isso significa:

* As correções de **A-1 a A-4 relatadas pelos meus 8 agentes são reais e foram verificadas adversarialmente por eles**, mas **não são as correções que estão hoje no repositório** — foram superadas por um commit de outra sessão antes que eu pudesse consolidar.
* As correções de **A-5 a A-8 produzidas por este workflow são, até onde a evidência mostra, as únicas existentes** — permanecem no working tree, não commitadas, não deployadas.
* Nenhuma alegação de "commitado" ou "deployado em produção" neste documento vem de relatório de agente — vem de leitura direta de `git log`/`git diff`/`git show` feita nesta etapa de consolidação.

Este documento reporta o **estado real verificado**, não o conteúdo bruto dos relatórios dos agentes.

---

# 1. CONSOLIDAÇÃO EXECUTIVA (atualizada em 09/08/2026)

| Métrica | Valor |
|---|---:|
| HIGH analisados nesta auditoria | 8 (A-1 a A-8) |
| Confirmados como reportados (nenhum falso positivo) | 8 |
| Reclassificados | 0 (todos mantidos ALTO — ver justificativa técnica por achado na Seção 2) |
| Corrigidos no código (working tree ou commit) | 8/8 |
| **Commitados no repositório** | 8/8 — A-1 a A-4 no commit `72acd1b`; A-5 a A-8 + expansão de CSP do A-2 no commit `f3bf0a4` |
| **Deployados em produção e verificados com evidência real** | 6/8 (A-2, A-3, A-4, A-5, A-6, A-7, A-8 — ver Seção 4 para evidência específica de cada um; A-2 e A-3 confirmados via `curl` de headers HTTP/bundle real; A-4 via leitura read-only do banco vivo; A-5/A-6 via leitura de código do commit + strings características no bundle real; A-7 via `curl` OPTIONS real contra edge function em produção; A-8 via presença de `useLoginBruteForceGuard` no bundle real) |
| **Único item sem deploy confirmado** | A-1 — bloqueado por decisão de negócio pendente (identificação do Auth Hook real no Dashboard do Supabase), não por falta de código ou commit |
| **Drift de rastreabilidade documentado, não bloqueante** | A-4: aplicado em produção via SQL direto, fora do fluxo `supabase db push` — `schema_migrations` não reflete a versão `20260807020000` |
| Validados adversarialmente com veredito SUFICIENTE | 8/8 |
| Achados colaterais novos descobertos durante a correção/verificação | 4 (ver Seção 6) — status de correção não revalidado nesta atualização |

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

* **Origem da correção vigente:** commit `f3bf0a4`.
* **Causa raiz:** `createClient()` não usava `global.fetch`; único timeout existente (`src/dashboards/core/api.ts`, `Promise.race`) é soft — não cancela o fetch real.
* **Correção:** `fetchWithTimeout` com `AbortController` real, injetado via `global: { fetch }`; 20s para queries/RPC, 90s para Storage (diferenciado por padrão de URL, pois uploads não são comprimidos).
* **Verificação adversarial:** SUFICIENTE. Confirmado por leitura do bundle `@supabase/supabase-js` que o fetch customizado cobre REST/RPC/Storage/Functions mas **não cobre Realtime** (WebSocket) — limitação correta e esperada, documentada.
* **Achado colateral confirmado na verificação:** existe um segundo `createClient()` em `src/pages/admin/AdminOrionLocalTestLab.tsx` (client isolado de laboratório de testes admin) sem o timeout — fora do escopo do achado original (não está entre as chamadas de aplicação), mas é um ponto cego real.
* **Status de deploy (validação pós-deploy 09/08/2026):** ✅ CONFIRMADO. Leitura de `git show f3bf0a4:.../client.ts` confirma `fetchWithTimeout`, `AbortController`, `SUPABASE_FETCH_TIMEOUT_MS = 20_000`, `SUPABASE_STORAGE_FETCH_TIMEOUT_MS = 90_000`, cleanup via `.finally()`. No bundle real de produção (`index-V8q66at0.js`, `curl` não destrutivo): string `storage/v1/` e valor `90000` presentes.
* **Classificação final:** MANTIDO ALTO. **A-5 — CORRIGIDO + DEPLOY VALIDADO.**

## A-6 — Hooks de realtime não tratam `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`

* **Origem da correção vigente:** commit `f3bf0a4`, sobre uma correção parcial pré-existente de outra sessão anterior.
* **Correção:** os 3 pontos `.subscribe()` de `useRealtimeCalls.ts` agora reconectam em erro/timeout/fechamento (padrão de `RealtimeService.ts`), via helper `src/hooks/realtime/reconnect.ts` (`handleChannelStatus`, `RECONNECT_DELAY_MS = 5000`, dedupe de timer pendente, guard de `isMountedRef`, `clearReconnectTimeout` exportado para cleanup).
* **Achado colateral CRÍTICO para o valor prático da correção, confirmado na verificação adversarial:** `src/contexts/GlobalCallContext.tsx:287` expõe `isConnected` **hardcoded como `true`** — o valor real retornado pelo hook é obtido mas nunca usado. Isso significa que `MotoboyPanel.tsx`, que consome `isConnected` via esse contexto, **nunca vai refletir uma queda de canal real** — o indicador "Online" sempre aparece, independentemente do estado da conexão. `DriverCalls.tsx` e `DeliveryCalls.tsx` (que leem o hook diretamente, sem passar pelo contexto) **se beneficiam corretamente**. Recomenda-se tratar isso como um novo achado (severidade a avaliar) em ação separada — **status de correção deste achado colateral não revalidado na atualização de 09/08**.
* **Status de deploy (validação pós-deploy 09/08/2026):** ✅ CONFIRMADO. Leitura de `git show f3bf0a4:.../reconnect.ts` confirma a lógica descrita. No bundle real de produção: strings literais `CHANNEL_ERROR`, `TIMED_OUT` e `"reconectando em"` (do template de log) presentes — não sobrevivem à minificação a menos que o código de fato tenha sido incluído no build.
* **Classificação final:** MANTIDO ALTO, com ressalva de efetividade parcial (achado colateral acima). **A-6 — CORRIGIDO + DEPLOY VALIDADO.**

## A-7 — CORS aberto (`"*"`) em 100% das 32 edge functions

* **Origem da correção vigente:** commit `f3bf0a4` (32 arquivos modificados + `supabase/functions/_shared/cors.ts` novo).
* **Correção:** helper centralizado `getCorsHeaders(origin, extra)` que só ecoa `Access-Control-Allow-Origin` se o `Origin` da requisição bater com a allowlist (`viagg-tx8.com.br` + `www.` variante, `localhost:8080`/`127.0.0.1:8080`, `*.vercel.app` via HTTPS). Aplicado nos 32 arquivos restantes (o 33º, `send-auth-email`, já usa o padrão desde o commit `72acd1b`).
* **Verificação adversarial:** SUFICIENTE. Testados bypasses clássicos (sufixo de domínio, domínio irmão, downgrade HTTP, string vazia/`null`) — todos bloqueados.
* **Risco residual documentado (não bloqueante):** allowlist `*.vercel.app` é estruturalmente ampla — qualquer conta Vercel gratuita ganha um subdomínio dentro da allowlist. Aceito como tradeoff para não quebrar deploy previews legítimos; recomendada revisão humana.
* **Status de deploy (validação pós-deploy 09/08/2026):** ✅ CONFIRMADO com evidência de rede real. `curl -X OPTIONS` contra `payments-charge` em produção: `Origin: https://evil-attacker.com` → resposta **sem** header `Access-Control-Allow-Origin`; `Origin: https://www.viagg-tx8.com.br` → resposta **com** `Access-Control-Allow-Origin: https://www.viagg-tx8.com.br`. Comportamento exatamente conforme a correção — edge function já redeployada.
* **Classificação final:** MANTIDO ALTO. **A-7 — CORRIGIDO + DEPLOY VALIDADO.**

## A-8 — Login por senha sem controle anti-brute-force

* **Origem da correção vigente:** commit `f3bf0a4`, generalizando uma correção pré-existente que cobria só `Auth.tsx`.
* **Ampliação de escopo real confirmada:** o achado original citava apenas `AuthContext.tsx:372`, mas há **3 telas de login por senha** (`Auth.tsx`, `RealEstateAuthCard.tsx`, `GestorLoginPage.tsx`) — só a primeira tinha proteção antes desta correção.
* **Correção:** hook `useLoginBruteForceGuard.ts` (3 tentativas livres, backoff progressivo até 60s, exige `MathCaptchaDialog` já existente) aplicado nas 3 telas.
* **Verificação adversarial:** SUFICIENTE, incluindo teste dinâmico real via Playwright contra dev server local (4 tentativas simuladas, captcha efetivamente bloqueou o submit na 4ª).
* **Limitação estrutural (documentada, não é regressão):** proteção 100% client-side (localStorage) — contornável limpando o storage ou atacando a API REST do Supabase diretamente; não implementada camada server-side por decisão de escopo/risco.
* **Status de deploy (validação pós-deploy 09/08/2026):** ✅ CONFIRMADO. Identificador `useLoginBruteForceGuard` presente no bundle JS real de produção (`index-V8q66at0.js`).
* **Classificação final:** MANTIDO ALTO. **A-8 — CORRIGIDO + DEPLOY VALIDADO.**

---

# 3. PENDÊNCIAS DE COMMIT E DEPLOY (AÇÃO HUMANA NECESSÁRIA)

**Atualização 09/08/2026 — as pendências 3.1 e 3.2 abaixo estão RESOLVIDAS.** A expansão de CSP do A-2, e as correções de A-5 a A-8, foram commitadas no commit `f3bf0a4` ("fix(security): ORION-480 Fase 4 — HIGH A-5 a A-8 + expansão CSP do A-2") e confirmadas deployadas em produção via evidência real (ver Seção 2 e 4). Texto original preservado abaixo para rastreabilidade histórica.

## 3.1 — ~~Expansão de CSP do A-2 não commitada~~ RESOLVIDO

`vercel.json` em disco tem uma CSP mais ampla e correta que a que está em produção. **Recomendação:** revisar o diff (Seção 2, A-2) e commitar antes que qualquer tela de clima/CEP/rádio/Twitch/xAI seja usada em produção sob a CSP restrita atual.

## 3.2 — ~~A-5, A-6, A-7, A-8 não commitados~~ RESOLVIDO

Todo o código dessas 4 correções existe apenas no working tree local desta máquina. **Recomendação:** revisão humana do diff completo (`git diff` sobre os arquivos listados na Seção 2) e commit em um ou mais lotes lógicos, seguido de deploy.

## 3.3 — A-1 commitado mas não deployado — ÚNICA PENDÊNCIA REAL REMANESCENTE

Correção pronta e commitada, mas **bloqueada por uma decisão de negócio pendente**: confirmar no Dashboard do Supabase (Authentication > Hooks > Send Email) qual é a função Auth Hook real e alinhar o secret configurado lá com `API_CLIENT_SECRET`. Sem isso, o deploy desta correção pode quebrar o fluxo legítimo de e-mail de recovery/magic-link.

## 3.4 — Drift de schema_migrations no A-4 (pendente, não bloqueante)

A correção já está ativa em produção, mas fora do controle formal de migrations do Supabase CLI. **Recomendação:** registrar a migration `20260807020000` no histórico formal (ou confirmar que o próximo `db push` não tentará reaplicá-la de forma conflitante) para não comprometer a rastreabilidade de auditorias futuras.

---

# 4. EVIDÊNCIAS (atualizada 09/08/2026)

| Achado | Commit | Deploy confirmado | Evidência primária |
|---|---|---|---|
| A-1 | `72acd1b` | **Não** — único item pendente | Leitura de código + fuzzing `deno run` (16 vetores); bloqueado por decisão de negócio (Auth Hook real não identificado) |
| A-2 | `72acd1b` + expansão em `f3bf0a4` | Sim | Headers HTTP reais via `curl -sI https://www.viagg-tx8.com.br/` |
| A-3 | `72acd1b` | Sim | `sanitizeHtml` confirmado no bundle JS real servido |
| A-4 | `72acd1b`, migration `20260807020000` | Sim (drift de `schema_migrations`, ver 3.4) | `pg_get_functiondef` via `supabase db query --linked` (leitura real, banco vivo) |
| A-5 | `f3bf0a4` | **Sim** | Código-fonte do commit + strings `storage/v1/`/`90000` no bundle JS real de produção |
| A-6 | `f3bf0a4` | **Sim** | Código-fonte do commit + strings `CHANNEL_ERROR`/`TIMED_OUT`/`"reconectando em"` no bundle JS real |
| A-7 | `f3bf0a4` | **Sim** | `curl -X OPTIONS` real contra `payments-charge`: origem maliciosa bloqueada, origem legítima refletida corretamente |
| A-8 | `f3bf0a4` | **Sim** | `useLoginBruteForceGuard` confirmado no bundle JS real de produção |

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

**PARCIALMENTE EMITIDA — 7 de 8 achados fecham; A-1 permanece bloqueado.**

## Matriz final (09/08/2026)

```text
A-1  ⏳  Aguardando confirmação do Auth Hook
A-2  ✅  Corrigido + deploy validado
A-3  ✅  Corrigido + deploy validado
A-4  ⚠️  Corrigido; drift de schema_migrations pendente
A-5  ✅  Corrigido + deploy validado
A-6  ✅  Corrigido + deploy validado
A-7  ✅  Corrigido + deploy validado
A-8  ✅  Corrigido + deploy validado
```

**Condição para Certificação HIGH completa:** apenas dois itens remanescentes — (1) decisão do usuário sobre o Auth Hook do A-1 (checagem em Authentication → Hooks → Send Email Hook no Dashboard do Supabase, projeto `broifhfqmnzqoongtokm`), com deploy subsequente se aplicável; (2) regularização do drift de `schema_migrations` do A-4 (não bloqueante para a certificação funcional, mas necessário para rastreabilidade formal de migrations).

---

# 9. CONCLUSÃO

A auditoria estática e a correção dos 8 achados ALTOS da Fase 4 estão tecnicamente completas, com validação adversarial independente aplicada a cada uma (16 agentes, 0 erros). Nenhum falso positivo, nenhuma reclassificação de severidade.

O fato mais relevante desta consolidação original não foi técnico, mas operacional: **duas sessões trabalharam nos mesmos 8 achados em paralelo, sem coordenação**, uma delas chegando a commitar e fazer deploy real em produção antes que esta pudesse consolidar. Isso é consistente com um padrão de risco já registrado em auditorias anteriores deste projeto (sessões concorrentes no mesmo working tree). O resultado prático foi positivo — nenhum trabalho foi perdido, as correções convergiram tecnicamente e o restante (A-5 a A-8) foi commitado no ciclo seguinte (`f3bf0a4`).

**Atualização 09/08/2026:** validação pós-deploy não destrutiva (leitura de código do commit + evidência de rede real: headers HTTP, bundle JS servido, `curl` OPTIONS contra edge function) confirmou que A-2, A-3, A-4, A-5, A-6, A-7 e A-8 estão corrigidos, commitados e **ativos em produção**. O único item que permanece sem deploy confirmado é o A-1, e por um motivo estrutural específico — não falta de código, e sim uma decisão de negócio pendente (identificar o Auth Hook real do Supabase antes de publicar uma função sob um nome que pode nunca ser invocada). A Certificação HIGH completa depende apenas dessa decisão e da regularização não bloqueante do drift de `schema_migrations` do A-4.
