# ORION-480 ENTERPRISE

# PLANO DE VERIFICAÇÃO DE DEPLOY

## FASE 4 — A-1, A-2 E A-3

**Documento:** `DOCS/ORION-480-PLANO-VERIFICACAO-DEPLOY-A1-A2-A3-2026-08-07.md`

**Versão:** 1.2
**Data:** 07/08/2026
**Status:** A-2 E A-3 DEPLOYADOS E VERIFICADOS EM PRODUÇÃO; A-1 SEGUE PENDENTE DE ESCLARECIMENTO

---

# OBJETIVO

Confirmar se as correções dos achados HIGH A-1, A-2 e A-3 foram efetivamente implantadas nos ambientes operacionais correspondentes, distinguindo código versionado de código em execução real.

---

# RESULTADO EXECUTIVO

| Item | Resultado da verificação |
|---|---|
| A-2 (CSP/headers, `vercel.json`) | ✅ **Deployado e confirmado em produção** (ver Etapa 5) |
| A-3 (sanitização DOMPurify) | ✅ **Deployado e confirmado em produção** (ver Etapa 5) |
| A-1 (`send-auth-email`) | ⚠️ **Achado novo, ainda sem resolução**: a função não existe no Supabase remoto sob nenhum nome correspondente ao código local; deploy não realizado até esclarecimento do usuário |

---

# ETAPA 1 — FRONTEND (VERCEL)

**Método:** `curl -sI https://www.viagg-tx8.com.br/` (headers HTTP reais) + `vercel ls` (lista de deploys reais).

**Evidência coletada:**
```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Server: Vercel
Strict-Transport-Security: max-age=63072000
```
Ausentes: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` — exatamente os headers adicionados pela correção de A-2.

`vercel ls tx8-viagg-analise-programador` mostra o deploy de produção mais recente com idade de **1 dia** — anterior a todas as correções desta sessão (feitas hoje).

**Conclusão:** o `vercel.json` corrigido está versionado no git (commit `72acd1b`) mas **não foi publicado**. O próximo deploy da Vercel (automático em push, ou manual) aplicará a correção.

---

# ETAPA 2 — EDGE FUNCTIONS

**Método:** `supabase functions list --project-ref broifhfqmnzqoongtokm` (lista real das functions ativas no projeto).

**Achado crítico:** a lista de 27 funções ativas no Supabase remoto **não contém `send-auth-email`** — nem com esse nome, nem com `updated_at` recente. As únicas funções com timestamp de hoje são `send-ticket-response` (P0-02, deployada corretamente por mim nesta sessão) — nenhuma outra.

Existe uma função chamada `enviar-email` (nome diferente, em português) ativa desde fevereiro/2026, `verify_jwt=true`. Investigação do código-fonte real dessa função (baixado temporariamente via `supabase functions download`, depois removido do working tree) mostra que **não é a mesma função**: `enviar-email` usa Resend API para notificar eventos de negócio (visitante na loja, oferta aceita, compra de pacote) — não é o Auth Hook de e-mail (signup/magic-link/recovery) que `send-auth-email` implementa.

**Isso significa duas coisas possíveis, que não consigo distinguir sem acesso ao Dashboard do Supabase:**
1. `send-auth-email` nunca foi deployada em produção sob nenhum nome — o Auth Hook de e-mail do projeto usa a implementação padrão do GoTrue (sem o SMTP customizado), ou usa código não presente neste repositório.
2. A função de Auth Hook real está deployada sob outro nome não óbvio, que não foi identificado nesta verificação.

Esta CLI não expõe um comando para consultar qual função está configurada como Auth Hook (Auth > Hooks no Dashboard) — essa configuração não é visível via `supabase functions list` nem está documentada em `supabase/config.toml`.

---

# ETAPA 3 — VALIDAÇÃO FUNCIONAL

Não executada para A-1/A-2/A-3 pelos motivos acima: não há sentido em validar funcionalmente uma correção que ainda não está em execução em produção. A validação funcional de A-1 especificamente **não pode ocorrer** até se esclarecer qual função é de fato o Auth Hook ativo.

---

# ETAPA 4 — VALIDAÇÃO DE REGRESSÃO

Não aplicável nesta rodada — sem deploy, não há regressão possível em produção. A validação de regressão do código (adversarial, estática) já foi feita e documentada em `DOCS/ORION-480-VALIDACAO-ADVERSARIAL-HIGH-A1-A4-2026-08-07.md`.

---

# CRITÉRIOS DE ACEITE — RESULTADO

| Critério | A-1 | A-2 | A-3 |
|---|---|---|---|
| Versão correta em execução | ❌ Indeterminado (função-alvo incerta) | ❌ Não | ❌ Não |
| Funcionalidade validada em produção | ❌ Não executável ainda | ❌ Não executável ainda | ❌ Não executável ainda |
| Sem regressões relevantes | N/A (não deployado) | N/A (não deployado) | N/A (não deployado) |

---

# SITUAÇÃO REAL APÓS ESTA ETAPA

| Item | Situação Real |
|---|---|
| P0 | ✅ Encerrado — confirmado aplicado em produção em turnos anteriores |
| HIGH A-4 | ✅ Encerrado — migration confirmada aplicada no banco vivo |
| HIGH A-2 | ✅ Corrigido no código, ❌ **não deployado** (confirmado agora) |
| HIGH A-3 | ✅ Corrigido no código, ❌ **não deployado** (confirmado agora) |
| HIGH A-1 | ✅ Corrigido no código, ⚠️ **status de deploy indeterminado** — função-alvo do Auth Hook em produção não identificada |
| HIGH A-5 a A-8 | 🔄 Em tratamento pela sessão paralela |
| Testes Dinâmicos | ⏳ Pendente de Evidência |
| Certificação Final da Fase 4 | ⏳ Aguardando conclusão dos HIGH remanescentes, deploys pendentes e testes dinâmicos |

---

# ETAPA 5 — DEPLOY REAL DE A-2 E A-3 (executado nesta sessão, após confirmação do usuário)

**Método:** para não publicar mudanças não commitadas de outra sessão (o `vercel.json` do working tree principal já tinha sido estendido por trabalho paralelo em A-5/A-8, com domínios adicionais ainda não commitados), o deploy foi feito a partir de um `git worktree` isolado no commit exato `72acd1b` — garantindo que só o código já commitado e validado adversarialmente fosse publicado.

**Comando:** `vercel --prod --yes` (Vercel CLI 54.14.0, autenticado como `angelozanatta100-7278`, projeto `tx8-viagg-analise-programador`).

**Resultado do deploy:**
```
deploymentId: dpl_6R2H3P61Ad4FkeMuLo4rWnpZo8cW
target: production
readyState: READY
Aliased: https://www.viagg-tx8.com.br
```

**Verificação pós-deploy (headers HTTP reais, `curl -sI https://www.viagg-tx8.com.br/`):**
```
Content-Security-Policy: default-src 'self'; ... media-src 'self' blob: https://broifhfqmnzqoongtokm.supabase.co https://jifnpjnffhzosxrdhvxb.supabase.co; ...
Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(self "https://sdk.mercadopago.com"), ...
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```
Todos os headers da correção de A-2 confirmados presentes na resposta real do domínio de produção.

**Verificação do bundle JS real** (`curl` do arquivo `index-*.js` referenciado pela página servida): string `sanitizeHtml` presente no bundle publicado — confirma que a correção de A-3 está no código executado em produção.

**Conclusão desta etapa:** A-2 e A-3 estão **confirmados deployados e ativos em produção**, com evidência de rede real (não apenas leitura de código/config local).

---

# AÇÃO AINDA NECESSÁRIA

1. ~~Deploy do frontend (Vercel) para A-2/A-3~~ — **concluído nesta sessão, ver Etapa 5.**
2. **Esclarecer com o usuário** qual função está de fato configurada como Auth Hook de e-mail no Dashboard do Supabase (Authentication > Hooks > Send Email Hook), para determinar se `send-auth-email` precisa ser deployada pela primeira vez, ou se a correção de A-1 é irrelevante porque o hook real usa outro código. **Ainda pendente** — usuário indicou que vai checar o Dashboard.

---

# CONCLUSÃO

A verificação de deploy planejada revelou inicialmente que nenhuma das três correções estava em produção. Após confirmação do usuário, **A-2 e A-3 foram deployados nesta mesma sessão e reverificados com evidência real de rede** (headers HTTP e bundle JS servidos pelo domínio de produção) — ambos confirmados ativos.

**A-1 permanece em aberto**: o problema não é falta de deploy, é incerteza sobre qual função é de fato o Auth Hook em produção. Não deployar `send-auth-email` "no escuro" foi a decisão correta — publicar uma função sob um nome que talvez nunca seja invocada pelo GoTrue não fecharia a vulnerabilidade original, e poderia criar falsa sensação de segurança resolvida.
