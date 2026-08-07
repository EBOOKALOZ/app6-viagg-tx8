# ORION-480 ENTERPRISE

# RELATÓRIO DE VALIDAÇÃO ADVERSARIAL

## LOTE HIGH A-1 A A-4

**Documento:** `DOCS/ORION-480-VALIDACAO-ADVERSARIAL-HIGH-A1-A4-2026-08-07.md`

**Versão:** 1.1
**Data:** 07/08/2026
**Status:** LOTE CONCLUÍDO — 4/4 SUFICIENTE

---

# OBJETIVO

Registrar o resultado consolidado da validação adversarial dos quatro primeiros achados classificados como Alta Criticidade (HIGH), incluindo a rodada complementar de A-2.

---

# RESUMO EXECUTIVO

A validação adversarial do lote A-1 a A-4 foi concluída.

Resultado final:

* 3 achados (A-1, A-3, A-4) considerados **SUFICIENTE** já na primeira rodada.
* 1 achado (A-2) considerado **INSUFICIENTE** na primeira rodada, com falha real identificada.
* Correção complementar aplicada imediatamente após o achado.
* Revalidação adversarial dedicada de A-2 executada — resultado: **SUFICIENTE**.

**O lote A-1 a A-4 está encerrado, com 4/4 achados validados.**

---

# RESULTADO POR ACHADO

| Achado | Primeira Validação | Revalidação | Situação Final |
| ------ | ------------------- | ------------ | --------------- |
| A-1    | ✅ SUFICIENTE        | —            | ✅ Encerrado     |
| A-2    | ❌ INSUFICIENTE      | ✅ SUFICIENTE | ✅ Encerrado     |
| A-3    | ✅ SUFICIENTE        | —            | ✅ Encerrado     |
| A-4    | ✅ SUFICIENTE        | —            | ✅ Encerrado     |

---

# DETALHAMENTO

## A-1 — `send-auth-email` (verificação de assinatura)

**SUFICIENTE.** Verificação confirmou: guarda de autenticação (`verifyCallerAuthenticity`) é chamada antes de qualquer parse de payload ou envio de e-mail, em todos os caminhos incluindo exceções (fail-closed); `crypto.subtle.verify` é constant-time; janela de replay de 5 minutos é o padrão recomendado pelo Standard Webhooks; fallback `x-client-secret`/`Authorization` é criptograficamente mais fraco que a assinatura HMAC-por-requisição mas estritamente mais forte que o baseline vulnerável (sem validação nenhuma).

**Observação não bloqueante:** `base64ToBytes()` usa `atob()`, que pode decodificar silenciosamente uma string que não é base64 real, impedindo o fallback para UTF-8 raw. Efeito possível é a verificação falhar sempre num cenário específico (fail-closed — nega e-mails legítimos), não um bypass de segurança. Recomenda-se validar em produção que a verificação aceita a assinatura real do GoTrue.

---

## A-2 — Headers de segurança (CSP)

### Primeira validação: INSUFICIENTE

**Motivo:** a CSP não incluía a diretiva `media-src`. Como resultado, `<audio>`/`<video src>` apontando para o domínio `jifnpjnffhzosxrdhvxb.supabase.co` (áudio de fundo global em `GlobalAudioPlayer.tsx` e os 3 vídeos de marketing da home pública em `PublicHome.tsx`/`ProfileVideoModal.tsx`) caíam no fallback `default-src 'self'` e eram bloqueados pelo navegador — quebra real de funcionalidade em produção, não teórica.

### Correção complementar aplicada

Adicionada a diretiva `media-src 'self' blob: https://broifhfqmnzqoongtokm.supabase.co https://jifnpjnffhzosxrdhvxb.supabase.co;` em `vercel.json`, cobrindo os dois domínios Supabase usados por áudio/vídeo no projeto (principal e bucket de mídia secundário) e `blob:` como cobertura preventiva.

### Revalidação adversarial: SUFICIENTE

Confirmado: diretiva sintaticamente válida, sem duplicação, cobre 100% dos usos reais de mídia encontrados no código (áudio de fundo, 3 vídeos de marketing, bips de chamada em `GlobalCallContext.tsx`/`MotoboyPublicCalls.tsx`/`useDeliveryOfferListener.ts`). Nenhuma regressão introduzida.

**Observação não bloqueante (não corrigida nesta rodada, fora do escopo do bloqueio funcional):** `script-src` inclui `unsafe-inline` sem necessidade técnica comprovada — o stack é React/Vite puro sem `<script>` inline executável em `index.html`. Reduz defesa em profundidade contra XSS nos pontos que dependem de DOMPurify (A-3) como única barreira. Recomendado remover em iteração futura, com teste real em browser antes de aplicar (mudança de CSP é sensível a quebrar funcionalidade sem aviso em typecheck/build).

---

## A-3 — Sanitização `dangerouslySetInnerHTML`

**SUFICIENTE.** Todos os 6 pontos confirmados chamando `sanitizeHtml()`/`DOMPurify.sanitize()` de fato antes do `dangerouslySetInnerHTML` (não apenas import não utilizado). Allowlist sem `script`/`iframe`/`style`/`img`, sem atributos `on*`, hrefs restritos a `http(s)`/`mailto`. Teste mental de payload `<img onerror=...>**bold**` contra a ordem replace-depois-sanitiza confirmou que a sanitização (parser DOM real, não regex) neutraliza o payload independente da ordem das operações. Suíte de testes automatizados (`sanitizeHtml.test.ts`, 9 casos) cobre os vetores clássicos.

---

## A-4 — `accept_arremate_offer_advertiser` (débito duplicado)

**SUFICIENTE.** `FOR UPDATE` na leitura da oferta serializa chamadas concorrentes para a mesma `p_offer_id`; `UPDATE` final condicional (`WHERE status='pending'`) com checagem de `ROW_COUNT` força rollback do débito se o status mudou por qualquer via não coberta pelo lock. Fluxo legítimo (aceite único) inalterado — mesma assinatura, mesmas validações, mesmo retorno JSON. Único caller (`useAdvertiserCredits.ts:180`) não quebra.

---

# BUILD E INTEGRIDADE (após correção complementar de A-2)

* `npm run build`: ✅ sucesso.
* `tsc --noEmit`: ✅ sem erros.
* Nenhum erro estrutural introduzido pelas alterações desta fase, incluindo a correção complementar de A-2.

---

# VERSIONAMENTO

O lote A-1 a A-4 está tecnicamente pronto para commit: todos os 4 achados validados como SUFICIENTE, build e typecheck verdes.

Aplicação em produção (migration A-4 + eventual redeploy de `vercel.json`/edge function `send-auth-email`) e o commit em si permanecem como decisão do usuário, não executados automaticamente por esta sessão.

---

# CONCLUSÃO

A validação adversarial do lote A-1 a A-4 está encerrada com resultado 4/4 SUFICIENTE.

O processo de validação cumpriu sua função ao identificar uma lacuna real em A-2 (bloqueio de mídia por CSP incompleta) antes que a correção fosse considerada definitiva — a falha foi corrigida e revalidada dentro do mesmo ciclo, sem necessidade de nova rodada completa do lote.

Restam pendentes na Fase 4: os achados HIGH A-5 a A-8, e os testes dinâmicos de carga/concorrência/resiliência/defesa em ambiente de homologação.
