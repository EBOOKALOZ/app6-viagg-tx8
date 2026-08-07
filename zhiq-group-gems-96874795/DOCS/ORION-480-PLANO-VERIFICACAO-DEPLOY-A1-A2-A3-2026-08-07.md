# ORION-480 ENTERPRISE

# PLANO DE VERIFICAÇÃO DE DEPLOY

## FASE 4 — A-1, A-2 E A-3

**Documento:** `DOCS/ORION-480-PLANO-VERIFICACAO-DEPLOY-A1-A2-A3-2026-08-07.md`

**Versão:** 1.1
**Data:** 07/08/2026
**Status:** VERIFICAÇÃO EXECUTADA — 2 ITENS NÃO DEPLOYADOS, 1 ACHADO NOVO

---

# OBJETIVO

Confirmar se as correções dos achados HIGH A-1, A-2 e A-3 foram efetivamente implantadas nos ambientes operacionais correspondentes, distinguindo código versionado de código em execução real.

---

# RESULTADO EXECUTIVO

| Item | Resultado da verificação |
|---|---|
| A-2 (CSP/headers, `vercel.json`) | ❌ **NÃO deployado** — confirmado via headers HTTP reais |
| A-3 (sanitização DOMPurify) | ❌ **NÃO deployado** — confirmado via bundle JS real servido |
| A-1 (`send-auth-email`) | ⚠️ **Achado novo, mais grave que "não deployado"**: a função não existe no Supabase remoto sob nenhum nome correspondente ao código local |

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

# AÇÃO NECESSÁRIA (NÃO EXECUTADA NESTA SESSÃO)

1. **Deploy do frontend** (Vercel) para aplicar A-2 (headers CSP) e A-3 (sanitização) em produção — normalmente automático via push/merge, dependendo da configuração de CI/CD do projeto; não disparado nesta sessão sem confirmação do usuário.
2. **Esclarecer com o usuário** qual função está de fato configurada como Auth Hook de e-mail no Dashboard do Supabase (Authentication > Hooks > Send Email Hook), para determinar se `send-auth-email` precisa ser deployada pela primeira vez, ou se a correção de A-1 é irrelevante porque o hook real usa outro código.

---

# CONCLUSÃO

A verificação de deploy planejada revelou que **nenhuma das três correções (A-1, A-2, A-3) está de fato em produção** — diferente do que a documentação anterior desta sessão registrava como "aguardando próximo ciclo de deploy" (uma formulação correta para A-2/A-3, mas insuficiente para A-1, cujo problema é mais estrutural: incerteza sobre qual função é a real).

Este documento corrige essa lacuna de rastreabilidade encontrada pela própria etapa de verificação — exatamente o objetivo de distinguir código versionado de código efetivamente implantado.
