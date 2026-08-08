# ORION-480 ENTERPRISE

# TERMO DE VERIFICAÇÃO PENDENTE DO AUTH HOOK

## ACHADO HIGH A-1 — VALIDAÇÃO ARQUITETURAL

**Documento:** `DOCS/ORION-480-TERMO-VERIFICACAO-PENDENTE-AUTH-HOOK-A1-2026-08-07.md`

**Versão:** 1.0
**Data:** 07/08/2026
**Status:** AGUARDANDO EVIDÊNCIA

---

# OBJETIVO

Registrar oficialmente que o encerramento operacional do achado HIGH A-1 depende exclusivamente da confirmação da arquitetura atualmente utilizada pelo mecanismo de **Authentication Hooks** do ambiente Supabase.

---

# CONTEXTO

Durante a validação operacional da Fase 4 foi constatado que:

* a correção correspondente ao A-1 encontra-se implementada no código auditado;
* não foi possível confirmar, utilizando apenas os recursos disponíveis na sessão, qual Edge Function está efetivamente configurada como Auth Hook;
* por esse motivo, nenhuma implantação adicional foi realizada sem evidência da arquitetura em produção.

Essa decisão foi adotada para evitar implantações especulativas que pudessem gerar falsa percepção de conformidade.

---

# EVIDÊNCIA NECESSÁRIA

A conclusão do A-1 depende da verificação, no **Supabase Dashboard**, da seção:

**Authentication → Hooks**

A coleta deverá identificar:

* existência ou não de Auth Hook personalizado;
* nome exato da Edge Function configurada;
* eventos associados ao hook;
* configuração de assinatura (*hook secret*), quando aplicável.

---

# CENÁRIOS POSSÍVEIS

## Cenário A

Existe um Auth Hook personalizado utilizando a função `send-auth-email`.

**Ação esperada:**

* confirmar a configuração;
* implantar a versão auditada, caso necessário;
* validar o funcionamento.

---

## Cenário B

Existe outra Edge Function exercendo a função de Auth Hook.

**Ação esperada:**

* aplicar a mesma correção de verificação de assinatura nessa função;
* realizar nova validação;
* atualizar a documentação correspondente.

---

## Cenário C

Não existe Auth Hook personalizado configurado.

**Ação esperada:**

* registrar a arquitetura efetivamente utilizada;
* revisar a aplicabilidade do achado A-1 à luz da configuração observada;
* atualizar a documentação com base nas evidências coletadas.

---

# CRITÉRIO DE ENCERRAMENTO

O A-1 somente poderá ser considerado operacionalmente encerrado após a existência de evidências documentadas demonstrando:

* qual arquitetura está efetivamente em uso;
* qual função atende ao mecanismo de autenticação;
* que a implementação correspondente encontra-se corretamente implantada e validada.

---

# IMPACTO

Até a obtenção dessa evidência:

* nenhuma nova classificação de risco deverá ser emitida;
* nenhuma conclusão operacional deverá ser antecipada;
* a Certificação Final da Fase 4 permanece inalterada.

---

# CONCLUSÃO

Fica registrado que o único bloqueio remanescente específico do achado HIGH A-1 é a confirmação da configuração do **Authentication Hook** no ambiente Supabase.

A próxima decisão técnica será tomada exclusivamente com base nas evidências coletadas no Dashboard, preservando a rastreabilidade, a integridade metodológica e a correspondência entre arquitetura, implementação e implantação.

---

# ADENDO — EVIDÊNCIAS COLETADAS VIA CLI/MANAGEMENT API (2026-08-07)

Nesta sessão houve acesso funcional ao Supabase CLI autenticado e linkado ao projeto `broifhfqmnzqoongtokm` (`supabase projects list` retornou `linked: true`), algo não disponível nas sessões anteriores. As evidências abaixo são novas e reduzem — mas não eliminam — o bloqueio.

## E1. Funções realmente implantadas em produção

`supabase functions list --project-ref broifhfqmnzqoongtokm` retornou 27 funções ACTIVE. **`send-auth-email` não está entre elas.** Não existe nenhuma função deployada com nome equivalente a Auth Hook.

## E2. Código local de `send-auth-email` não está em produção

O arquivo local `supabase/functions/send-auth-email/index.ts` implementa o contrato correto de Auth Hook (Standard Webhooks: headers `webhook-id`/`webhook-timestamp`/`webhook-signature`, payload `{ user, email_data }`, fallback `x-client-secret`). Ele exige a env var `API_CLIENT_SECRET` — com `throw` no top-level se ausente, ou seja, a função derruba o boot inteiro sem esse secret.

## E3. Secrets em produção não contêm o que `send-auth-email` exige

`supabase secrets list --project-ref broifhfqmnzqoongtokm` retornou 12 secrets. **Não há `API_CLIENT_SECRET`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` nem `SMTP_FROM`** — as 5 variáveis que `send-auth-email/index.ts` requer. Há, em vez disso, `RESEND_API_KEY` e `EMAIL_FROM`.

## E4. `enviar-email` (deployada) não é um Auth Hook

Download do código-fonte real em produção (`supabase functions download enviar-email`) confirma que essa função trata notificações transacionais de negócio (venda/lead/crédito via `advertiser_account_id`), usa Resend, e não verifica assinatura de webhook GoTrue nem consome o payload `{ user, email_data }`. **Não é candidata a Send Email Hook.**

## Causa raiz agora estabelecida com evidência direta

Nenhuma função atualmente implantada no projeto tem o contrato de Auth Hook do GoTrue. `send-auth-email` existe apenas como código local não implantado, e mesmo se implantado hoje sem configurar `API_CLIENT_SECRET` nos Secrets, falharia no boot. Isso é consistente com (embora não prove sozinho) o Cenário C do termo original: **Auth Hook custom provavelmente não está ativo no Dashboard**, e o Supabase está usando o mailer SMTP nativo (built-in) para os e-mails de auth — não a função `send-auth-email`.

## Limite real desta sessão — o que continua exigindo o Dashboard

A CLI do Supabase (`v2.108.0`) **não expõe nenhum comando** que leia a configuração de `Authentication → Hooks` (não há `supabase config dump`, nem subcomando `auth`, nem endpoint wrapper para `GET /v1/projects/{ref}/config/auth`). Essa tela só é legível via Management API REST direta (exigiria extrair o token de acesso da CLI do cofre de credenciais do SO, o que não foi feito por não ser proporcional ao escopo desta verificação) ou visualmente no Dashboard.

**Ação pendente do usuário (única real):** abrir `Authentication → Hooks → Send Email Hook` no Dashboard do projeto `broifhfqmnzqoongtokm` e reportar: (a) se o hook customizado está habilitado; (b) se sim, qual função está selecionada no dropdown. Isso confirma ou refuta a hipótese do Cenário C acima com certeza total, fechando o A-1 definitivamente.
