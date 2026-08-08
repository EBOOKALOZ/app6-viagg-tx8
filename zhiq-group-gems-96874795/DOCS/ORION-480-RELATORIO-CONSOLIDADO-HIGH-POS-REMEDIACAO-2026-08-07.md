# ORION-480 ENTERPRISE

# RELATÓRIO DE CONSOLIDAÇÃO

## AUDITORIA HIGH — PÓS-REMEDIAÇÃO

**Documento:** `DOCS/ORION-480-RELATORIO-CONSOLIDADO-HIGH-POS-REMEDIACAO-2026-08-07.md`

**Versão:** 1.0
**Data:** 07/08/2026
**Status:** WORKFLOW CONCLUÍDO — consolidação com dados reais desta execução

---

# OBJETIVO

Consolidar os resultados reais da remediação dos 8 achados classificados como Alta Criticidade (HIGH) na Auditoria da Fase 4 do ORION-480, com base exclusivamente nas evidências produzidas pelo workflow de correção + validação adversarial independente executado nesta sessão (Task ID `wwsmpcp7u`, 16 agentes, 0 erros, ~1.19M tokens, 464 chamadas de ferramenta).

Nenhum resultado abaixo é estimado ou inferido sem evidência de código/commit correspondente.

---

# METODOLOGIA APLICADA

Cada um dos 8 achados percorreu:

```
Confirmação no código atual
        ↓
Reprodução do vetor original
        ↓
Correção implementada
        ↓
Typecheck/Build (quando aplicável)
        ↓
Auto-verificação adversarial (pelo agente que corrigiu)
        ↓
Verificação adversarial INDEPENDENTE (agente separado, cético por padrão)
        ↓
Revisão final desta sessão (build/tsc próprio + correção de gaps reais)
```

A verificação adversarial de cada achado foi feita por um agente diferente do que implementou a correção, instruído a não confiar no relato e reler o código real. Além disso, esta sessão rodou uma checagem final própria (não delegada) de build/typecheck e corrigiu 1 gap real identificado pela verificação adversarial (ver A-2 abaixo).

---

# MATRIZ DOS ACHADOS HIGH

| ID | Achado | Veredito Adversarial | Situação Final |
|----|--------|----------------------|-----------------|
| A-1 | `send-auth-email` sem verificação de assinatura/secret | ✅ CONFIRMADO | Corrigido |
| A-2 | Ausência de headers HTTP de segurança (CSP/HSTS/X-Frame-Options) | ⚠️ PARCIAL → corrigido nesta sessão | Corrigido |
| A-3 | `dangerouslySetInnerHTML` sem sanitização (6 pontos) | ⚠️ PARCIAL (código correto, relato impreciso) | Corrigido |
| A-4 | `accept_arremate_offer_advertiser` sem `FOR UPDATE` (débito duplicado) | ⚠️ PARCIAL (código correto, status de commit relatado errado) | Corrigido (commitado) |
| A-5 | Cliente Supabase sem timeout configurado | ✅ CONFIRMADO | Corrigido |
| A-6 | Hooks de realtime não tratam `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` | ✅ CONFIRMADO | Corrigido |
| A-7 | CORS aberto (`"*"`) em edge functions | ✅ CONFIRMADO | Corrigido |
| A-8 | Login por senha sem anti-brute-force | ✅ CONFIRMADO | Corrigido |

**Nenhum achado foi refutado.** Todos os 8 tinham vetor real confirmado por leitura direta de código, tanto pelo agente de correção quanto pela verificação adversarial independente. 4 vieram com veredito PARCIAL — em 3 desses (A-3, A-4, e parte do A-8), a lacuna era o **relato do agente estar desatualizado ou impreciso sobre o que já tinha sido feito** (ex.: dizendo "não commitado" quando já estava commitado, ou descrevendo uma implementação diferente da que está no arquivo real), não um defeito na correção em si. Em 1 caso (A-2), a lacuna era real — CSP faltando domínios que quebrariam produção — e foi corrigida nesta sessão antes deste relatório.

---

# EVIDÊNCIAS POR ACHADO

## A-1 — `send-auth-email` sem verificação de assinatura/secret

**Causa raiz:** `API_CLIENT_SECRET` era lido só na inicialização do módulo (existência + log), nunca comparado contra header algum dentro do handler — qualquer requisição bem formada disparava e-mail de recovery/magic-link/invite com `redirect_to` arbitrário.

**Correção:** `supabase/functions/send-auth-email/index.ts` — implementa o contrato oficial Standard Webhooks do GoTrue (`webhook-id`/`webhook-timestamp`/`webhook-signature`, HMAC-SHA256 via `crypto.subtle`, janela de replay de 5 min) com fallback para header simples `x-client-secret`/`Authorization`. Guard roda antes de qualquer parse de payload ou envio SMTP; retorna 401 em caso de falha.

**Validação adversarial:** CONFIRMADO. Verificador releu o histórico git (`git show 72acd1b^`) confirmando a vulnerabilidade original, e o código atual confirmando a correção — nenhum branch default-true, exceções caem em 500 (não em bypass), `verify_jwt=false` mantido corretamente (não é o mecanismo de auth do GoTrue Hook).

**Pendência operacional (fora do escopo de código):** confirmar no Supabase Dashboard se o hook secret está configurado como Standard Webhooks — sem isso, e-mails legítimos de auth param de ser enviados até a configuração ser feita (postura fail-closed correta, mas requer ação do usuário).

---

## A-2 — Ausência de headers HTTP de segurança

**Causa raiz:** `vercel.json` não tinha nenhum header de segurança; `index.html` sem CSP.

**Correção:** `vercel.json` — adicionados `Content-Security-Policy`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, aplicados a `/(.*)`.

**Validação adversarial:** PARCIAL. O verificador confirmou que a mudança fecha o vetor original (zero headers → 6 headers reais), mas identificou que a CSP entregue pelo agente de correção **faltava 7 domínios com `fetch()`/embed ativo em produção**: `viacep.com.br` e `brasilapi.com.br` (autocomplete de CEP em 3 telas de cadastro), `api.openweathermap.org` e `api.open-meteo.com` (previsão do tempo em 8+ componentes, incl. landing pública), `itunes.apple.com`/`musicbrainz.org` (now-playing da rádio), `api.x.ai` (provider ativo de IA quando `ACTIVE_PROVIDER=grok`), e `player.twitch.tv` (embed do media center, precisava estar em `frame-src`). Sem esses domínios, a CSP quebraria esses fluxos silenciosamente em produção.

**Ação desta sessão:** todos os 7 domínios foram confirmados por grep direto no código-fonte (não assumidos) e adicionados ao `connect-src`/`frame-src` de `vercel.json`. `node -e "require('./vercel.json')"` confirma JSON válido; `npm run build` verde após a correção.

**Risco residual documentado (não fechável nesta sessão):** ausência de `'unsafe-eval'` no `script-src` não foi testada contra o bundle real em browser (Mapbox GL/recharts/xlsx/jspdf/html2canvas/heic2any podem ou não precisar) — recomenda-se smoke test em preview deploy antes de produção. `.env`/`.env.staging` têm uma chave de API que parece ser uma secret viva da OpenAI exposta no bundle frontend (`VITE_GLM_API_KEY`) — achado de exposição de secret pré-existente, fora do escopo desta correção de CSP, sinalizado para follow-up separado.

---

## A-3 — `dangerouslySetInnerHTML` sem sanitização (6 pontos)

**Causa raiz:** 6 pontos reais no repo (`FloatingAIChat.tsx`, `LgpdContent.tsx`, `Support.tsx`, `AdminLegalDocuments.tsx`, `NewVersionModal.tsx` + o hook compartilhado) sem nenhuma dependência de sanitização.

**Correção:** `dompurify@^3.4.13` adicionado como dependência real; todos os 6 pontos agora sanitizam via DOMPurify (config inline no chat de IA, util compartilhado `src/lib/sanitizeHtml.ts` nos 4 pontos administrativos/legais).

**Validação adversarial:** PARCIAL — mas a lacuna é apenas de relato, não de segurança. O verificador confirmou, lendo o código real e rodando a suíte `src/lib/__tests__/sanitizeHtml.test.ts` (9 payloads XSS, 9/9 passando) e `tsc --noEmit` (limpo), que a sanitização está correta e efetiva nos 6 pontos. A única lacuna: o `diff_summary` do agente de correção descrevia `NewVersionModal.tsx` como tendo uma implementação local própria (`DOMPurify` direto + config customizada) — **verificado nesta sessão que isso é falso**: o arquivo usa a mesma `sanitizeHtml()` compartilhada dos outros 3 pontos (linha 34). Nenhuma ação de código foi necessária — só a correção deste relato.

---

## A-4 — `accept_arremate_offer_advertiser` sem `FOR UPDATE` (débito duplicado)

**Causa raiz:** função lia a oferta sem lock e fazia `UPDATE` incondicional — duplo-clique/duas abas/retry podiam debitar créditos do anunciante mais de uma vez pela mesma oferta.

**Correção:** `supabase/migrations/20260807020000_p1_fix_accept_arremate_offer_advertiser_lock.sql` — replica o padrão já aprovado em `LOTE-C_consumo_idempotencia_lock.sql` (`accept_offer_with_credits`): `SELECT ... FOR UPDATE` na linha da oferta + `UPDATE ... WHERE status='pending'` com `GET DIAGNOSTICS`/`RAISE` em `ROW_COUNT=0` como camada extra de defesa em profundidade.

**Validação adversarial:** PARCIAL — código correto, status de entrega relatado errado. O agente de correção reportou "não commitado, apenas no working tree". O verificador confirmou via `git log --all` que o arquivo **já está commitado** desde o commit `72acd1b`, ancestral do HEAD atual, sem drift entre working tree e commit. Cenário de concorrência (duas transações simultâneas na mesma oferta) foi analisado estaticamente e confirmado correto: a segunda transação bloqueia no `FOR UPDATE`, recebe o estado pós-commit já `accepted`, e retorna idempotente sem segundo débito.

**Pendência:** migration commitada no git, mas **não aplicada no banco vivo** — sem credenciais/DB nesta sessão. Precisa ser aplicada via SQL Editor/CLI do Supabase antes de valer em produção.

---

## A-5 — Cliente Supabase sem timeout configurado

**Causa raiz:** `src/integrations/supabase/client.ts` sem timeout algum; o único timeout do projeto (`src/dashboards/core/api.ts`) era "soft" (`Promise.race`, não cancelava o fetch real).

**Correção:** `fetchWithTimeout` com `AbortController` real, injetado via `global.fetch` do `createClient` — 20s para chamadas comuns, 90s para Storage (justificado por uploads não comprimidos de até 5MB em `DocumentUpload.tsx` e ~10 outros call sites).

**Validação adversarial:** CONFIRMADO. Verificador leu o bundle real de `@supabase/supabase-js@2.89.0` instalado e confirmou que Realtime (`_initRealtimeClient`) nunca recebe `this.fetch` — só REST/Storage/Auth são afetados, exatamente como exigido. `tsc --noEmit` limpo, confirmado de forma independente.

**Risco residual documentado:** segundo cliente Supabase em `AdminOrionLocalTestLab.tsx` (ferramenta admin isolada) não recebe o timeout — risco baixo, fora do escopo do cliente compartilhado.

---

## A-6 — Hooks de realtime não tratam `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`

**Causa raiz:** `useRealtimeCalls.ts` (3 pontos) e 4 hooks irmãos (`usePassengerRide`, `useMotoboyRides`, `useMotoTaxiRides`, `useDeliveryOrder`) não reconectavam em falha de canal — painéis de motoboy/motorista paravam de receber notificações silenciosamente.

**Correção:** novo helper compartilhado `src/hooks/realtime/reconnect.ts` replicando o padrão já aprovado em `RealtimeService.ts` (backoff de 5s), aplicado nos 5 hooks (8 pontos de `.subscribe()` no total).

**Validação adversarial:** CONFIRMADO. Verificador leu os 5 arquivos completos, confirmou 201 inserções/11 deleções reais via `git diff`, `tsc --noEmit` limpo, e validou o cenário de desmontagem durante reconexão pendente: `clearReconnectTimeout()` cancela o timer no cleanup e `isMountedRef` bloqueia qualquer callback tardio — sem memory leak, sem `setState` pós-unmount.

**Cobertura não incluída (fora do escopo estrito do achado):** `useSHCRealtime.ts`, `useMotoboyExpansion.ts` (x2), `useAdminStoresRealtime.ts` — hooks de dashboard/cache administrativo, não de notificação de corrida ao vivo; risco menor, sinalizado para triagem separada se desejado.

---

## A-7 — CORS aberto (`"*"`) em edge functions

**Causa raiz:** 33 edge functions (não 32 como estimado originalmente) com `Access-Control-Allow-Origin: "*"` hardcoded.

**Correção:** helper central `supabase/functions/_shared/cors.ts` (`getCorsHeaders`) — valida o header `Origin` contra allowlist (`www.viagg-tx8.com.br`, `viagg-tx8.com.br`, `localhost:8080`, `127.0.0.1:8080`, sufixo `.vercel.app` só em HTTPS) e ecoa a origem real ou omite o header, nunca `"*"`. Aplicado nas 33 functions.

**Validação adversarial:** CONFIRMADO. Verificador rodou grep exaustivo confirmando zero ocorrências residuais de `"*"` hardcoded, e testou a lógica real (copiada literalmente do arquivo) contra 19 casos adversariais — incluindo domain-suffix-spoofing (`viagg-tx8.com.br.evil.com`), protocol-downgrade, e `Origin: null` — 19/19 corretos.

**Pendências de confirmação antes de deploy:** (1) domínio de produção inferido com alta confiança de `supabase/config.toml`, mas não há confirmação absoluta de DNS/domínio custom no Vercel; (2) `campaign-share/index.ts` referencia um domínio legado Lovable (`*.lovable.app`) fora da allowlist — confirmar se ainda está em uso; (3) nenhuma das 33 functions foi deployada (só edição local, conforme instruído); (4) Deno CLI indisponível nesta sessão para `deno check` — recomenda-se validar compilação antes do deploy real.

---

## A-8 — Login por senha sem anti-brute-force

**Causa raiz:** `signInWithPassword` sem nenhum controle; único cooldown existente (magic link) não se aplicava a senha.

**Correção:** hook compartilhado `useLoginBruteForceGuard` aplicado nos 3 pontos reais de login por senha do repo (`Auth.tsx`, `GestorLoginPage.tsx`, `RealEstateAuthCard.tsx`) — backoff progressivo client-side (0/0/2/5/15/30/60s) a partir da 2ª falha, e captcha matemático (`MathCaptchaDialog`, componente já existente reaproveitado) a partir da 3ª falha seguida.

**Validação adversarial:** CONFIRMADO, e mais completo do que o relatado. O agente de correção afirmou ter corrigido só `Auth.tsx` e listou `GestorLoginPage.tsx`/`RealEstateAuthCard.tsx` como gaps residuais fora de escopo. O verificador confirmou via `git status` que **os 3 arquivos foram de fato corrigidos** com paridade completa — o relato do próprio agente estava desatualizado sobre o alcance do seu trabalho.

**Limitação estrutural explícita (não escondida em nenhum momento):** ambas as camadas são client-side (localStorage/React state). Um atacante que fala diretamente com a API REST do Supabase Auth (curl, script, Burp Intruder) não é afetado — brute-force real contra o endpoint `/token` continua tecnicamente possível até que rate limiting/CAPTCHA seja configurado no lado do servidor (Supabase Dashboard → Authentication → Rate Limits / Attack Protection), ação operacional fora do escopo de código.

---

# AÇÕES DESTA SESSÃO ALÉM DA VERIFICAÇÃO

1. Corrigido o gap real do A-2: 7 domínios adicionados à CSP em `vercel.json` (`viacep.com.br`, `brasilapi.com.br`, `api.openweathermap.org`, `api.open-meteo.com`, `itunes.apple.com`, `musicbrainz.org`, `api.x.ai` em `connect-src`; `player.twitch.tv` em `frame-src`), cada um confirmado por grep direto no código antes de adicionar.
2. Rodado `npx tsc --noEmit` (limpo) e `npm run build` (verde, warnings de chunk size pré-existentes e não relacionados) de forma independente nesta sessão, cobrindo o estado final de todas as mudanças combinadas.
3. Identificados, mas não copiados como instrução, múltiplos arquivos `DOCS/` novos e não rastreados criados por sessão(ões) paralela(s) no mesmo working tree durante a janela 13:50–14:39 de hoje — consistente com o padrão de risco já documentado na memória deste projeto.

---

# MATRIZ DE RISCO ATUALIZADA

| Criticidade | Situação |
|---|---|
| Crítico | ✅ Nenhum pendente |
| Alto | ✅ 8/8 corrigidos e validados adversarialmente (0 refutados) |
| Médio/Baixo/Informativo | Não fazia parte do escopo desta remediação (36 achados totais da Fase 4; só CRÍTICO+ALTO foram tratados até aqui) |

---

# STATUS GERAL

| Item | Situação |
|---|---|
| P0 (2) | ✅ Corrigidos (sessão anterior, commit `993ed64`) |
| HIGH (8) | ✅ 8/8 corrigidos, validados adversarialmente, gap real do A-2 fechado nesta sessão |
| Build/typecheck (independente desta sessão) | ✅ Verde |
| Commit/aplicação em produção | ⚠️ Parcial — ver pendências por achado acima (A-2/A-3/A-5/A-6/A-7 não commitados; A-4 commitado mas migration não aplicada no banco; A-1 depende de config no Supabase Dashboard) |
| Testes Dinâmicos (carga/concorrência/resiliência/defesa) | ⏳ Pendente de Evidência (sem ambiente de homologação isolado) |
| Certificação Final da Fase 4 | ⏳ Aguardando: commit/deploy das correções HIGH + testes dinâmicos |

---

# PRÓXIMA ETAPA

Antes da Auditoria Dinâmica (carga/concorrência/resiliência/defesa), recomenda-se:

1. Revisar `git status` e decidir o que commitar (múltiplas correções HIGH estão no working tree, não commitadas — ver pendências por achado).
2. Aplicar a migration do A-4 no banco vivo via SQL Editor/CLI Supabase.
3. Confirmar/configurar o hook secret do A-1 no Supabase Dashboard.
4. Deploy das 33 edge functions do A-7 (após validar compilação, já que Deno CLI não estava disponível nesta sessão).
5. Smoke test da CSP do A-2 em preview deploy (mapas, export PDF/Excel, upload HEIC, rádio, captura de cartão) antes de produção.
6. Só então iniciar os testes dinâmicos em ambiente de homologação autorizado.

---

# CONCLUSÃO

Os 8 achados HIGH da Fase 4 foram corrigidos e validados por verificação adversarial independente (agente distinto do que implementou cada correção). Nenhum achado foi refutado. Das 4 verificações com veredito PARCIAL, 3 apontavam apenas imprecisões no relato do agente de correção sobre o que já tinha sido feito (código já estava certo); 1 (A-2) apontava uma lacuna real de cobertura de domínios na CSP, fechada nesta sessão com evidência direta de código antes deste relatório ser escrito.

Nenhuma métrica foi estimada. Nenhuma correção foi declarada aplicada em produção sem evidência — as pendências de commit/deploy/aplicação de migration estão listadas explicitamente por achado, não omitidas.

A Certificação Final da Fase 4 permanece condicionada à consolidação dessas pendências operacionais e à execução dos testes dinâmicos em ambiente de homologação autorizado.
