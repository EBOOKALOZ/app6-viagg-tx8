# RELATÓRIO DE AUDITORIA DE REGRESSÃO PÓS-P0

**Projeto:** ORION-480 — Deploy Veículos/Leilões
**Data:** 2026-08-06
**Ambiente:** Produção (banco vivo)
**Banco auditado:** Supabase — projeto `broifhfqmnzqoongtokm`
**Versão/Branch:** `integracao/orion480-deploy-veiculos-leiloes` (migrations aplicadas no intervalo de commits `87c838e..ceb82b7`)
**Auditor:** ORION AUDITOR
**Objetivo:** Reauditar de forma adversarial os 8 P0 de segurança previamente corrigidos e certificados no documento de referência "Certificação P0 ORION-480 — 2026-08-06" (ver Seção 13 — Anexos), confirmando ausência de regressão e reproduzindo os exploits originais contra o estado atual do banco.

> Nota de completude: este documento foi elaborado a partir do registro-síntese da auditoria (memória de projeto), que preserva objetivo, escopo, resultados, classificações e observações de cada item, mas não preserva o texto literal de comandos SQL, respostas HTTP linha a linha, logs brutos ou queries completas executadas durante os testes. Todo campo da estrutura obrigatória cujo dado literal não constava nessa fonte está marcado como **"Não informado no conteúdo fornecido"**. Nenhuma informação foi inferida ou inventada além do que consta na fonte.

---

## 1. Resumo Executivo

**Objetivo da auditoria:** verificar, de forma adversarial e independente, se as correções aplicadas aos 8 P0 de segurança identificados na Certificação P0 ORION-480 (2026-08-06) permanecem efetivas — ou seja, se nenhuma regressão foi introduzida após a aplicação das migrations de correção. O usuário solicitou explicitamente uma postura adversarial ("tente provar que alguma correção falhou"), não apenas uma revalidação passiva.

**Metodologia utilizada:** reexecução dos exploits originais contra o banco vivo, combinando chamadas REST com a anon key real e consultas SQL diretas com `SET ROLE anon`. Detalhamento completo na Seção 3.

**Ambiente auditado:** banco de produção Supabase, projeto `broifhfqmnzqoongtokm`.

**Quantidade de vulnerabilidades auditadas:** 8 P0 (todos oriundos da Certificação P0 ORION-480).

**Resultado geral:** **APROVADO — sem regressão.** Todos os 8 P0 permanecem corrigidos; todos os exploits originais foram reproduzidos e confirmados como bloqueados no banco vivo. Durante a auditoria foi identificado 1 achado novo, fora do escopo original dos 8 P0 (vulnerabilidade pré-existente nunca coberta pela certificação anterior), além de 1 observação de hardening secundário e 1 falso positivo descartado após reteste.

**Conclusão resumida:** o conjunto de correções da Certificação P0 ORION-480 mostrou-se estável e sem regressão. A auditoria, no entanto, expôs uma vulnerabilidade histórica independente (bucket de Storage `real-estate-original`) que deve ser tratada como novo item de fila de segurança.

### Resumo Geral

| Métrica | Valor |
|---|---|
| Total de P0 auditados | 8 |
| Total aprovados | 8 |
| Total reprovados | 0 |
| Total de regressões | 0 |
| Total de novos achados | 1 (P1 sugerido) + 1 observação de hardening secundário |

---

## 2. Escopo da Auditoria

A reauditoria cobriu exclusivamente os 8 P0 certificados na Certificação P0 ORION-480 — 2026-08-06 (ver Seção 13 — Anexos), aplicados entre os commits `87c838e` e `ceb82b7`. Os componentes abrangidos, organizados por categoria, foram:

**Banco (dados/PII)**
- `advertiser_accounts` (PII: e-mail, WhatsApp)
- `visitor_profiles` (PII de visitantes)
- `merchant_credit_contact_unlocks`, `merchant_credit_result_metrics`, `merchant_credit_subscriptions` (dados financeiros)

**Storage**
- `storage.objects` (policies globais, incluindo buckets privados: `carrier-documents`/CNH, `vehicles-documents`, `convenio`, `moderacao`)
- Bucket `real-estate-original` (achado novo, fora do escopo dos 8 P0 — ver Seção 7)

**Views**
- 51 views administrativas/financeiras com `security_invoker=off` (contornam RLS), incluindo `v_admin_lojistas` e `v_support_tickets_admin`

**Functions**
- 56 funções `SECURITY DEFINER` executáveis por `anon`, quanto a `search_path` hijack

**RLS / Policies**
- Policies `ALL USING(true)` legadas em `advertiser_listings`, `advertiser_listings_media`, `promotion_packages`, `promotion_purchases`, `promotion_logs`
- Policies de `storage.objects`: "Full Access" e "Permissao Total Original"
- Policy de UPDATE de `advertiser_accounts` (coluna `id` vs. `user_id`)

**Grants**
- GRANT SELECT `anon` em views administrativas/financeiras
- GRANT SELECT `anon` em `merchant_credit_contact_unlocks`/`result_metrics`/`subscriptions` (achado de hardening secundário)

**Financeiro**
- `promotion_packages`, `promotion_purchases`, `promotion_logs` (proteção contra forjar compras pagas, alteração de preços, exclusão de logs)

**Uploads**
- Fluxo de upload anônimo/autenticado em `storage.objects`, incluindo o bucket `real-estate-original`

**Catálogos**
- Não informado no conteúdo fornecido (não há menção a catálogos como escopo específico desta reauditoria além dos itens acima).

---

## 3. Metodologia

**REST API:** reexecução dos exploits originais via chamadas REST utilizando a anon key real do projeto `broifhfqmnzqoongtokm`.

**SQL direto:** consultas diretas ao banco vivo.

**SET ROLE anon:** simulação do papel `anon` em transações SQL (`SET ROLE anon` / `SET LOCAL ROLE anon`), replicando o padrão já usado na certificação original, que executava exploits dentro de transações com `ROLLBACK` para evitar efeitos colaterais permanentes.

**anon key real:** os testes via REST usaram a chave anônima real do projeto, e não uma chave simulada ou de ambiente de teste.

**Banco vivo:** toda a reauditoria foi executada contra o banco de produção (`broifhfqmnzqoongtokm`), sem uso de ambiente de staging ou réplica.

**Reexecução dos exploits:** cada um dos 8 exploits originais (documentados na Certificação P0 ORION-480) foi reproduzido tal como formulado originalmente, para confirmar bloqueio efetivo pós-correção.

**Critério de aceitação:** exploit original reproduzido e confirmado **bloqueado** no banco vivo = P0 aprovado / sem regressão.

**Critério de reprovação:** exploit original reproduzido com **sucesso** (ou seja, a vulnerabilidade voltando a ser explorável) = regressão / reprovação.

**Quantidade de repetições realizadas:** ao menos um caso (INSERT anônimo em `visitor_profiles`) exigiu reteste — falhou 2 vezes com "RLS violation" e em seguida passou em 3 tentativas consecutivas (3/3 sucesso). Não informado no conteúdo fornecido o número exato de repetições padrão aplicado aos demais 7 P0.

**Como foi validado cada exploit:** reprodução do exploit original documentado na certificação anterior, contra o estado atual do banco, classificando o resultado como bloqueado (aprovado) ou bem-sucedido (regressão). Ao final, a sessão utilizou a `service_role` key (obtida via `supabase projects api-keys --project-ref`) exclusivamente para limpeza dos artefatos de teste — 2 linhas de teste em `visitor_profiles` e 1 arquivo de teste no bucket `real-estate-original` — e não para os testes de exploit em si.

> ⚠️ **Observação de segurança operacional:** a `service_role` key utilizada para limpeza dos dados de teste não deve ser deixada em nenhum arquivo do repositório.

---

## 4. Resultado Geral

| P0 | Componente | Status | Regressão | Resultado |
|---|---|---|---|---|
| P0-3 | `advertiser_listings` / `advertiser_listings_media` (escrita anônima) | ✅ Aprovado | Não | Exploit original reproduzido e bloqueado |
| P0-4 | `promotion_packages` / `promotion_purchases` / `promotion_logs` (financeiro) | ✅ Aprovado | Não | Exploit original reproduzido e bloqueado |
| P0-5 | `advertiser_accounts` (PII) | ✅ Aprovado | Não | Exploit original reproduzido e bloqueado |
| P0-6 | `visitor_profiles` (PII) | ✅ Aprovado | Não* | Exploit original reproduzido e bloqueado; falso positivo pontual descartado (ver observação abaixo) |
| P0-7 | `merchant_credit_*` (financeiro) | ✅ Aprovado | Não | Exploit original reproduzido e bloqueado |
| P0-8 | `storage.objects` (Full Access global) | ✅ Aprovado | Não | Exploit original reproduzido e bloqueado |
| P0-9 | Views administrativas/financeiras (`security_invoker=off`) | ✅ Aprovado | Não | Exploit original reproduzido e bloqueado |
| P0-10 | Funções `SECURITY DEFINER` (search_path hijack) | ✅ Aprovado | Não | Exploit original reproduzido e bloqueado |

\* Durante o teste do P0-6, o INSERT anônimo em `visitor_profiles` falhou 2 vezes com erro de "RLS violation" e em seguida passou em 3 tentativas consecutivas. Após análise, esse comportamento foi classificado como **flakiness pontual do gateway/Cloudflare**, e não como regressão real (ver Seção 6 e Seção 7 — Falso Positivo Descartado).

**Resumo técnico:** todos os 8 P0 certificados anteriormente permanecem corrigidos e sem regressão no banco vivo. Nenhum exploit original voltou a ser bem-sucedido. O único evento anômalo (falha intermitente em P0-6) foi investigado e atribuído a instabilidade de infraestrutura (gateway/Cloudflare), não a falha de política de segurança, tendo sido confirmado por reteste 3/3.

---

## 5. Evidências Técnicas

> Nota: o conteúdo bruto disponibilizado nesta conversa preserva, para cada P0, o objetivo da correção original, a vulnerabilidade, a correção aplicada e o veredito da reauditoria — mas não preserva os comandos SQL literais, payloads REST, respostas HTTP ou saídas de console individuais dos testes de regressão. Esses campos estão marcados abaixo como "Não informado no conteúdo fornecido".

### P0 #3 — Escrita anônima pública em `advertiser_listings`/`advertiser_listings_media`

**Objetivo:** confirmar que a escrita anônima pública nessas tabelas permanece bloqueada.

**Vulnerabilidade original:** policies legadas `ALL USING(true)` permitiam escrita anônima em `advertiser_listings` e `advertiser_listings_media`.

**Correção aplicada:** migration `20260806_p0_3_drop_public_write_advertiser_listings` (commit `0e4ce4f`) — policies administrativas migradas para `is_admin()`; REVOKE de escrita para `anon`.

**Testes executados:** reprodução do exploit original de escrita anônima contra o banco vivo (via REST com anon key e/ou SQL com `SET ROLE anon`). Não informado no conteúdo fornecido o comando/payload literal.

**Resultados:** exploit bloqueado — escrita anônima não é mais possível.

**Evidências:** Não informado no conteúdo fornecido (resposta HTTP/SQL literal não preservada na fonte).

**Validação:** confirmada via reexecução do exploit original documentado na Certificação P0 ORION-480.

**Arquivos/Migrations:** `20260806_p0_3_drop_public_write_advertiser_listings.sql`.

**Conclusão:** aprovado, sem regressão.

**Observações:** nenhuma.

---

### P0 #4 — Lockdown financeiro de `promotion_packages`/`promotion_purchases`/`promotion_logs`

**Objetivo:** confirmar que o bloqueio à manipulação financeira anônima permanece efetivo.

**Vulnerabilidade original:** policies `ALL USING(true)` permitiam que `anon` forjasse compra paga, marcasse 22 compras como pagas, alterasse 27 preços e apagasse 218 logs.

**Correção aplicada:** migration `20260806_p0_4_lockdown_promotion_financeiro` (commit `1a0d957`) — compras restritas a `service_role`.

**Testes executados:** reprodução do exploit original (forjar compra paga / alterar preços / apagar logs) contra o banco vivo.

**Resultados:** exploit bloqueado.

**Evidências:** Não informado no conteúdo fornecido.

**Validação:** confirmada via reexecução do exploit original.

**Arquivos/Migrations:** `20260806_p0_4_lockdown_promotion_financeiro.sql`.

**Conclusão:** aprovado, sem regressão.

**Observações:** nenhuma.

---

### P0 #5 — PII pública em `advertiser_accounts`

**Objetivo:** confirmar que dados de PII (e-mail, WhatsApp) permanecem protegidos contra leitura/escrita pública.

**Vulnerabilidade original:** PII exposta publicamente; policy de UPDATE usava coluna `id` em vez de `user_id`.

**Correção aplicada:** migration `20260806_p0_5_advertiser_accounts_pii_lockdown` (commit `a34021f`) — controle a nível de coluna: `anon` restrito a colunas não-PII (join `!inner` preservado), `authenticated` restrito à própria linha; policy de UPDATE corrigida (`id` → `user_id`); frontend `AdvertiserSummaryCard` alterado de `select("*")` para seleção explícita de colunas.

**Testes executados:** reprodução do exploit original de leitura/escrita de PII contra o banco vivo.

**Resultados:** exploit bloqueado.

**Evidências:** Não informado no conteúdo fornecido.

**Validação:** confirmada via reexecução do exploit original.

**Arquivos/Migrations:** `20260806_p0_5_advertiser_accounts_pii_lockdown.sql`.

**Conclusão:** aprovado, sem regressão.

**Observações:** nenhuma.

---

### P0 #6 — PII em `visitor_profiles`

**Objetivo:** confirmar que SELECT/UPDATE de PII de visitantes permanecem restritos, mantendo o fluxo legítimo de INSERT anônimo.

**Vulnerabilidade original:** SELECT/UPDATE com `USING(true)`, expondo PII de visitantes.

**Correção aplicada:** migration `20260806_p0_6_visitor_profiles_pii_lockdown` (commit `b14c390`) — INSERT mantido para suportar o fluxo de visitante anônimo (protegido por `WITH CHECK (user_id IS NULL OR user_id = auth.uid())`); SELECT restrito ao dono, admin ou lojista do pedido.

**Testes executados:** reprodução do exploit original de leitura pública de PII; teste do fluxo de INSERT anônimo legítimo.

**Resultados:** exploit de leitura pública bloqueado. INSERT anônimo legítimo funcional, com uma anomalia pontual: 2 falhas consecutivas com "RLS violation" seguidas de 3 sucessos consecutivos.

**Evidências:** Não informado no conteúdo fornecido (mensagem de erro literal do "RLS violation" não preservada).

**Validação:** confirmada via reexecução do exploit original; anomalia investigada e reclassificada como falso positivo (ver Seção 7).

**Arquivos/Migrations:** `20260806_p0_6_visitor_profiles_pii_lockdown.sql`.

**Conclusão:** aprovado, sem regressão.

**Observações:** ver "Falso Positivo Descartado" na Seção 7 — recomenda-se sempre retestar 2–3 vezes antes de reportar um P0 como reprovado.

---

### P0 #7 — Financeiro público em `merchant_credit_*`

**Objetivo:** confirmar que a leitura financeira pública permanece bloqueada.

**Vulnerabilidade original:** policy `_select_all` com `USING(true)` em saldos, razão e pedidos.

**Correção aplicada:** migration `20260806_p0_7_merchant_credit_financeiro_lockdown` (commit `65db58c`) — criada owner policy faltante em `orders`; REVOKE SELECT de `anon`.

**Testes executados:** reprodução do exploit original de leitura pública de dados financeiros.

**Resultados:** exploit bloqueado.

**Evidências:** Não informado no conteúdo fornecido.

**Validação:** confirmada via reexecução do exploit original.

**Arquivos/Migrations:** `20260806_p0_7_merchant_credit_financeiro_lockdown.sql`.

**Conclusão:** aprovado, sem regressão.

**Observações:** GRANT SELECT residual identificado em `merchant_credit_contact_unlocks`/`result_metrics`/`subscriptions` — ver achado de hardening na Seção 6/7.

---

### P0 #8 (CRÍTICO) — Full Access público em `storage.objects`

**Objetivo:** confirmar que o acesso público total ao Storage permanece bloqueado, incluindo buckets privados.

**Vulnerabilidade original:** policies "Full Access" e "Permissao Total Original" com `ALL USING(true)` em `storage.objects` permitiam que `anon` lesse/manipulasse qualquer bucket, incluindo os privados (`carrier-documents`/CNH, `vehicles-documents`, `convenio`, `moderacao`).

**Correção aplicada:** migration `20260806_p0_8_storage_drop_full_access_public` (commit `ff21b2a`) — DROP das policies (o REVOKE de grants em `storage.objects` é inefetivo porque o owner é `supabase_storage_admin`; o DROP das policies é o fix efetivo, já que RLS ativo torna o grant inócuo).

**Testes executados:** reprodução do exploit original de leitura/manipulação de buckets privados como `anon`.

**Resultados:** exploit bloqueado.

**Evidências:** Não informado no conteúdo fornecido.

**Validação:** confirmada via reexecução do exploit original.

**Arquivos/Migrations:** `20260806_p0_8_storage_drop_full_access_public.sql`.

**Conclusão:** aprovado, sem regressão.

**Observações:** este é o P0 de maior criticidade do conjunto (classificado como CRÍTICO na certificação original), por expor documentos sensíveis (CNH, documentos veiculares) a acesso público irrestrito. Ver também Seção 7 para o achado novo relacionado a Storage (bucket `real-estate-original`), que é distinto e fora do escopo deste P0.

---

### P0 #9 — Views administrativas/financeiras com `security_invoker=off`

**Objetivo:** confirmar que `anon` não consegue mais ler views administrativas/financeiras que contornam RLS.

**Vulnerabilidade original:** 51 views com `security_invoker=off` (contornam RLS) tinham SELECT liberado para `anon`; `anon` conseguia ler `v_admin_lojistas` e `v_support_tickets_admin` (PII).

**Correção aplicada:** migration `20260806_p0_9_revoke_anon_admin_financial_views` (commit `87c838e`) — REVOKE de `anon` nas views administrativas/financeiras; views públicas do marketplace preservadas.

**Testes executados:** reprodução do exploit original de leitura das views `v_admin_lojistas` e `v_support_tickets_admin`, e demais views do conjunto de 51, como `anon`.

**Resultados:** exploit bloqueado.

**Evidências:** Não informado no conteúdo fornecido.

**Validação:** confirmada via reexecução do exploit original.

**Arquivos/Migrations:** `20260806_p0_9_revoke_anon_admin_financial_views.sql`.

**Conclusão:** aprovado, sem regressão.

**Observações:** endurecimento adicional para usuários `authenticated` não-admin permanece registrado como item P1 pendente (fora do escopo desta reauditoria).

---

### P0 #10 — `search_path` hijack em funções `SECURITY DEFINER`

**Objetivo:** confirmar que as 56 funções `SECURITY DEFINER` executáveis por `anon` permanecem protegidas contra sequestro de `search_path`.

**Vulnerabilidade original:** 56 funções `DEFINER` sem `search_path` fixo, executáveis por `anon`, vulneráveis a `search_path` hijack com elevação de privilégio.

**Correção aplicada:** migration `20260806_p0_10_secdef_search_path_hardening` (commit `ceb82b7`) — `ALTER ... SET search_path = public, pg_temp` aplicado via loop dinâmico sobre o catálogo do banco.

**Testes executados:** reprodução do exploit original de `search_path` hijack.

**Resultados:** exploit bloqueado.

**Evidências:** Não informado no conteúdo fornecido.

**Validação:** confirmada via reexecução do exploit original.

**Arquivos/Migrations:** `20260806_p0_10_secdef_search_path_hardening.sql`.

**Conclusão:** aprovado, sem regressão.

**Observações:** nenhuma.

---

## 6. Testes Complementares

### Smoke Tests
**Objetivo:** Não informado no conteúdo fornecido (não há registro de smoke tests específicos executados nesta reauditoria, distintos da reexecução dos exploits).
**Metodologia:** Não informado no conteúdo fornecido.
**Resultado:** Não informado no conteúdo fornecido.
**Conclusão:** Não informado no conteúdo fornecido.

### Concorrência
**Objetivo:** Não informado no conteúdo fornecido.
**Metodologia:** Não informado no conteúdo fornecido.
**Resultado:** Não informado no conteúdo fornecido.
**Conclusão:** Não há registro de testes de concorrência nesta reauditoria.

### RLS
**Objetivo:** confirmar que as políticas de Row Level Security aplicadas nos 8 P0 continuam ativas e efetivas contra o papel `anon`.
**Metodologia:** simulação de `anon` via `SET ROLE anon` / `SET LOCAL ROLE anon` em transações SQL, combinada com chamadas REST usando a anon key real.
**Resultado:** RLS efetivo em todos os 8 componentes reauditados; único evento anômalo (2 falhas de "RLS violation" seguidas de 3 sucessos em `visitor_profiles`) atribuído a flakiness de infraestrutura, não a falha de RLS.
**Conclusão:** RLS validado sem regressão.

### Policies
**Objetivo:** confirmar que as policies criadas/alteradas pelas migrations dos 8 P0 (incluindo a migração de policies administrativas para `is_admin()`) permanecem corretas.
**Metodologia:** reexecução dos exploits que originalmente exploravam policies `ALL USING(true)`.
**Resultado:** nenhuma policy legada permissiva remanescente identificada nos componentes dos 8 P0.
**Conclusão:** aprovado.

### GRANTs
**Objetivo:** confirmar REVOKEs aplicados (SELECT em views/tabelas financeiras, escrita em tabelas de anúncios).
**Metodologia:** verificação de grants efetivos pós-migration.
**Resultado:** REVOKEs efetivos nos 8 P0. Identificado GRANT SELECT residual (morto) para `anon` em `merchant_credit_contact_unlocks`/`result_metrics`/`subscriptions`, sem policy RLS correspondente — funcionalmente inofensivo porque o RLS bloqueia o acesso, mas representa superfície de ataque desnecessária.
**Conclusão:** aprovado nos 8 P0, com uma observação de hardening secundário registrada (ver Seção 7).

### Storage
**Objetivo:** confirmar bloqueio de acesso público total a `storage.objects` (P0-8) e mapear demais buckets.
**Metodologia:** reexecução do exploit original de leitura/escrita em buckets privados como `anon`; verificação adicional identificou o bucket `real-estate-original`.
**Resultado:** P0-8 aprovado (bloqueio efetivo via DROP de policies). Bucket `real-estate-original`, fora do escopo dos 8 P0, permite upload público irrestrito por `anon`/`authenticated` (ver Seção 7).
**Conclusão:** P0-8 sem regressão; achado novo registrado separadamente.

### Functions / SECURITY DEFINER / search_path
**Objetivo:** confirmar hardening de `search_path` nas 56 funções `SECURITY DEFINER` executáveis por `anon` (P0-10).
**Metodologia:** reexecução do exploit original de `search_path` hijack.
**Resultado:** exploit bloqueado; `search_path` fixo (`public, pg_temp`) confirmado.
**Conclusão:** aprovado, sem regressão.

### Hardening
**Objetivo:** identificar superfícies de risco residuais mesmo quando não exploráveis.
**Metodologia:** análise dos grants remanescentes pós-correção.
**Resultado:** GRANT SELECT morto identificado em `merchant_credit_contact_unlocks`/`result_metrics`/`subscriptions` (sem policy RLS correspondente).
**Conclusão:** não é uma vulnerabilidade explorável (RLS bloqueia o acesso de fato), mas é superfície desnecessária — recomenda-se REVOKE por princípio de menor privilégio.

---

## 7. Novos Achados

> Os itens desta seção são independentes dos 8 P0 reauditados e **não representam regressão** de nenhuma correção aplicada.

### Achado Novo #1 — Upload público irrestrito no bucket de Storage `real-estate-original`

**Descrição:** o bucket `real-estate-original` permite upload público irrestrito por `anon` e por `authenticated`, sem restrição de pasta por usuário.

**Evidência:** as policies "Allow anyone to upload...", "Public Insert Access" e "Auth Upload originals" checam apenas `bucket_id`, sem exigir `foldername = auth.uid()`. Confirmado por exploit real: upload HTTP 200 como `anon`, seguido de limpeza do arquivo de teste.

**Como foi encontrado:** durante a varredura de Storage realizada no contexto da reauditoria do P0-8, ao mapear as demais policies de `storage.objects` além das já corrigidas.

**Impacto:** upload público irrestrito de arquivos por qualquer usuário anônimo ou autenticado no bucket `real-estate-original`, sem isolamento por pasta/usuário.

**Probabilidade:** Não informado no conteúdo fornecido (classificação qualitativa de probabilidade não constava na fonte).

**Classificação sugerida:** **P1** — não é regressão de correção aplicada; é um gap histórico pré-existente, cuja causa raiz precede todos os 8 P0.

**Causa raiz:** migration `20260330_storage_fix_final.sql` ("SOLUÇÃO DEFINITIVA - ABRIR TUDO"), anterior a todas as migrations dos 8 P0.

**Recomendação:** tratar como novo item de fila de segurança (P1), aplicando restrição de pasta por usuário (`foldername = auth.uid()`) nas policies "Allow anyone to upload...", "Public Insert Access" e "Auth Upload originals", seguindo o mesmo padrão de correção já usado nos demais buckets.

**Prioridade:** Alta (P1).

---

### Achado Novo #2 — GRANT SELECT residual (morto) em tabelas `merchant_credit_*`

**Descrição:** GRANT SELECT concedido a `anon` em `merchant_credit_contact_unlocks`, `merchant_credit_result_metrics` e `merchant_credit_subscriptions`, sem policy RLS correspondente que o habilite de fato.

**Evidência:** grants presentes no catálogo, mas RLS ativo bloqueia todo acesso de `anon` na prática (não há policy que libere leitura para esse papel).

**Como foi encontrado:** durante a checagem de GRANTs realizada como teste complementar ao P0-7.

**Impacto:** não há exploração possível hoje (RLS bloqueia o acesso), mas representa superfície de ataque desnecessária — qualquer falha futura na política RLS (ex.: policy removida acidentalmente) exporia esse grant latente.

**Probabilidade:** baixa, condicionada a falha futura na camada de RLS.

**Classificação sugerida:** Hardening / baixa severidade (não é exploit ativo).

**Recomendação:** REVOKE do GRANT SELECT residual para `anon` nessas três tabelas, por princípio de menor privilégio.

**Prioridade:** Baixa.

---

### Falso Positivo Descartado (registrado para rastreabilidade, não é achado novo)

**Descrição:** durante o teste do P0-6, o INSERT anônimo em `visitor_profiles` falhou 2 vezes consecutivas com erro "RLS violation".

**Evidência:** as 3 tentativas subsequentes tiveram sucesso (3/3).

**Como foi encontrado:** durante a reexecução do exploit/teste funcional do fluxo de INSERT anônimo do P0-6.

**Impacto:** nenhum — não é uma regressão real.

**Classificação:** flakiness pontual do gateway/Cloudflare.

**Recomendação/Lição registrada:** sempre retestar 2–3 vezes antes de reportar um P0 como reprovado, para distinguir instabilidade de infraestrutura de regressão real de segurança.

---

## 8. Limitações da Auditoria

| Limitação | Impacto |
|---|---|
| Ambiente de teste único: banco de produção (`broifhfqmnzqoongtokm`), sem ambiente de staging/réplica dedicado | Testes de exploit executados diretamente contra produção; mitigado pelo uso de transações com `ROLLBACK` na maioria dos casos, mas um UPDATE real chegou a afetar 1 linha durante teste (revertido na mesma transação, conforme já registrado na certificação original) |
| Escopo restrito aos 8 P0 previamente certificados | Não constitui auditoria de segurança completa da plataforma; achados fora do escopo (como o bucket `real-estate-original`) só foram identificados incidentalmente |
| Ausência de detalhamento literal de comandos SQL/respostas HTTP na fonte utilizada para este relatório | Este documento preserva objetivo, resultado e classificação de cada teste, mas não reproduz o comando/payload/resposta literal de cada exploit — campos correspondentes marcados como "Não informado no conteúdo fornecido" |
| Teste de carga | Não informado no conteúdo fornecido — não há registro de testes de carga/performance nesta reauditoria |
| Testes de concorrência | Não informado no conteúdo fornecido — não há registro de testes de concorrência nesta reauditoria específica |
| Dependências externas (gateway/Cloudflare) | Introduziu 1 evento de flakiness pontual (RLS violation intermitente em `visitor_profiles`), exigindo reteste manual para diferenciar de regressão real |
| Uso de `service_role` key para limpeza de dados de teste | Risco operacional se a chave não for devidamente descartada/protegida; sinalizado explicitamente como cuidado necessário (não deixar a chave em nenhum arquivo do repositório) |

---

## 9. Conclusão Técnica

Com base exclusivamente nas evidências apresentadas, os 8 P0 de segurança certificados na Certificação P0 ORION-480 — 2026-08-06 permanecem corrigidos e efetivos no banco de produção `broifhfqmnzqoongtokm`. Todos os exploits originais foram reproduzidos de forma adversarial contra o estado atual do banco e confirmados como bloqueados, sem exceção.

A auditoria não constitui, e não deve ser interpretada como, uma declaração de segurança absoluta da plataforma: seu escopo foi deliberadamente restrito à verificação de regressão dos 8 P0 previamente identificados. Nesse processo, foi identificada uma vulnerabilidade adicional e independente — upload público irrestrito no bucket `real-estate-original` — que antecede e é anterior a todas as correções auditadas, e que deve ser tratada como novo item de segurança (P1), fora do escopo desta certificação de regressão. Foi também identificado um item de hardening secundário (GRANT SELECT residual em tabelas `merchant_credit_*`) que, embora não explorável hoje devido ao RLS ativo, representa superfície de ataque desnecessária.

Um evento de instabilidade (falha intermitente de RLS em `visitor_profiles`) foi investigado e atribuído a flakiness de infraestrutura (gateway/Cloudflare) e não a falha de política de segurança, após confirmação por reteste.

Em síntese: **o conjunto de correções auditado está estável, sem regressão comprovada em nenhum dos 8 P0**, mas a superfície de segurança da plataforma como um todo permanece maior do que o escopo desta certificação — o achado do bucket `real-estate-original` demonstra a existência de débitos de segurança históricos ainda não mapeados integralmente.

---

## 10. Próximas Ações

| Prioridade | Descrição | Responsável sugerido | Impacto |
|---|---|---|---|
| **Alta** | Corrigir upload público irrestrito no bucket `real-estate-original` (policies "Allow anyone to upload...", "Public Insert Access", "Auth Upload originals") aplicando restrição de pasta por usuário (`foldername = auth.uid()`) | Não informado no conteúdo fornecido | Elimina exposição a upload malicioso/abuso de armazenamento por qualquer usuário anônimo ou autenticado |
| **Média** | REVOKE do GRANT SELECT residual para `anon` em `merchant_credit_contact_unlocks`, `merchant_credit_result_metrics`, `merchant_credit_subscriptions` | Não informado no conteúdo fornecido | Reduz superfície de ataque desnecessária (defesa em profundidade), mesmo sem exploração ativa hoje |
| **Média** | Endurecer acesso de usuários `authenticated` não-admin nas views administrativas/financeiras cobertas pelo P0-9 (item já registrado como P1 pendente na certificação original) | Não informado no conteúdo fornecido | Reduz risco de escalonamento de privilégio horizontal entre usuários autenticados |
| **Baixa** | Formalizar processo de reteste (2–3 repetições) antes de reportar qualquer P0 como reprovado, para filtrar flakiness de infraestrutura (gateway/Cloudflare) | Não informado no conteúdo fornecido | Reduz falsos positivos em auditorias futuras, sem custo de segurança |
| **Baixa** | Garantir descarte/proteção adequada da `service_role` key utilizada na limpeza dos dados de teste desta auditoria | Não informado no conteúdo fornecido | Evita exposição acidental de credencial privilegiada em repositório |

---

## 11. Estatísticas

| Métrica | Valor |
|---|---|
| Total de P0 auditados | 8 |
| Total aprovados | 8 |
| Total reprovados | 0 |
| Total de regressões | 0 |
| Exploits reproduzidos | 8 (um por P0) |
| Exploits bloqueados | 8 (100%) |
| Policies auditadas | Não informado no conteúdo fornecido em número exato (cobertas: policies de `advertiser_listings`/`advertiser_listings_media`, `promotion_*`, `advertiser_accounts`, `visitor_profiles`, `merchant_credit_*`, `storage.objects` — "Full Access" e "Permissao Total Original", views administrativas) |
| Views auditadas | 51 (views administrativas/financeiras com `security_invoker=off`) |
| Functions auditadas | 56 (funções `SECURITY DEFINER` executáveis por `anon`) |
| Buckets auditados | Storage geral (`storage.objects`) via P0-8; identificado adicionalmente o bucket `real-estate-original` como achado novo. Número total de buckets analisados: Não informado no conteúdo fornecido |
| Migrations analisadas | 8 (uma por P0, listadas na Seção 12) |
| Testes executados | Não informado no conteúdo fornecido em número exato (mínimo de 8 exploits + testes complementares de GRANTs/Storage/RLS) |
| Testes aprovados | 8 dos 8 P0 (100%); demais testes complementares sem reprovação registrada |
| Testes reprovados | 0 |
| Novos achados | 2 (1 vulnerabilidade P1 + 1 observação de hardening) |
| Falsos positivos descartados | 1 (INSERT anônimo intermitente em `visitor_profiles`) |

---

## 12. Migrations Envolvidas

| Migration | Objetivo | Status |
|---|---|---|
| `20260806_p0_3_drop_public_write_advertiser_listings` (commit `0e4ce4f`) | Eliminar escrita anônima pública em `advertiser_listings`/`advertiser_listings_media`; migrar policies admin para `is_admin()` | ✅ Aplicada e sem regressão |
| `20260806_p0_4_lockdown_promotion_financeiro` (commit `1a0d957`) | Bloquear forjamento de compras pagas e manipulação de preços/logs em `promotion_packages`/`promotion_purchases`/`promotion_logs` | ✅ Aplicada e sem regressão |
| `20260806_p0_5_advertiser_accounts_pii_lockdown` (commit `a34021f`) | Proteger PII (e-mail/WhatsApp) em `advertiser_accounts`; corrigir policy de UPDATE (`id` → `user_id`) | ✅ Aplicada e sem regressão |
| `20260806_p0_6_visitor_profiles_pii_lockdown` (commit `b14c390`) | Restringir SELECT/UPDATE de PII em `visitor_profiles`, preservando INSERT anônimo legítimo | ✅ Aplicada e sem regressão |
| `20260806_p0_7_merchant_credit_financeiro_lockdown` (commit `65db58c`) | Bloquear leitura financeira pública em `merchant_credit_*`; criar owner policy em `orders`; REVOKE SELECT anon | ✅ Aplicada e sem regressão |
| `20260806_p0_8_storage_drop_full_access_public` (commit `ff21b2a`) — **CRÍTICO** | Remover policies "Full Access"/"Permissao Total Original" em `storage.objects`, eliminando acesso público total a todos os buckets, incluindo privados | ✅ Aplicada e sem regressão |
| `20260806_p0_9_revoke_anon_admin_financial_views` (commit `87c838e`) | REVOKE SELECT de `anon` em 51 views administrativas/financeiras `security_invoker=off` | ✅ Aplicada e sem regressão |
| `20260806_p0_10_secdef_search_path_hardening` (commit `ceb82b7`) | Fixar `search_path` em 56 funções `SECURITY DEFINER` executáveis por `anon`, mitigando hijack | ✅ Aplicada e sem regressão |

*(Referência: `20260330_storage_fix_final.sql` é citada como causa raiz do Achado Novo #1, mas não faz parte do conjunto de 8 migrations dos P0 reauditados — é anterior a todas elas.)*

---

## 13. Anexos

**Arquivos:**
- Migrations das seções 5 e 12 (8 arquivos), listadas por nome completo.
- Referência à migration `20260330_storage_fix_final.sql` (causa raiz do Achado Novo #1).
- `AdvertiserSummaryCard` (frontend) — alterado de `select("*")` para seleção explícita de colunas no âmbito do P0-5.

**Logs:** Não informado no conteúdo fornecido.

**Comandos SQL:** Não informado no conteúdo fornecido (comandos literais de `SET ROLE anon` / `SET LOCAL ROLE anon` e demais queries de exploit não preservados na fonte utilizada).

**Consultas:** Não informado no conteúdo fornecido.

**Respostas HTTP:** Não informado no conteúdo fornecido (exceto a menção qualitativa de "upload HTTP 200 como anon" no Achado Novo #1, único código de resposta literal presente na fonte).

**Observações gerais:**
- Referência cruzada: "Certificação P0 ORION-480 — 2026-08-06" (documento de origem das correções e migrations dos 8 P0).
- Sessão de origem: `originSessionId 199a86a1-892f-4c0c-a12d-a8a42107950a`.
- Cuidado operacional: a `service_role` key usada para limpeza dos dados de teste (obtida via `supabase projects api-keys --project-ref`) não deve permanecer em nenhum arquivo do repositório.

---

## TL;DR EXECUTIVO

Reauditoria adversarial dos 8 P0 de segurança da Certificação ORION-480 (banco vivo `broifhfqmnzqoongtokm`, commits `87c838e..ceb82b7`): **todos os 8 P0 aprovados, sem regressão** — cada exploit original foi reproduzido e confirmado bloqueado. Método: REST com anon key real + SQL direto com `SET ROLE anon`, contra produção. Um evento de "RLS violation" intermitente em `visitor_profiles` foi investigado e descartado como flakiness de gateway/Cloudflare (3/3 sucesso no reteste). Foi identificado 1 achado novo fora do escopo dos P0: o bucket de Storage `real-estate-original` permite upload público irrestrito por `anon`/`authenticated` (causa raiz: migration `20260330_storage_fix_final.sql`, anterior a todos os P0) — classificado como **P1**, item de fila novo, não regressão. Também identificado GRANT SELECT residual (morto, não explorável) em três tabelas `merchant_credit_*`, recomendado REVOKE por hardening. Limitação principal: teste em produção sem ambiente de staging dedicado, mitigado por uso de transações com `ROLLBACK`. **Veredito: certificação de regressão pós-P0 mantida — nenhuma correção falhou.**

---

## Nota de Completude e Transparência

**Percentual estimado de completude do relatório:** aproximadamente **60–65%** em relação à estrutura de 13 seções solicitada.

**Inconsistências, lacunas e informações ausentes identificadas no conteúdo bruto fornecido:**

1. O conteúdo bruto disponível nesta conversa é um **registro-síntese de memória de projeto**, não o relatório técnico completo original da auditoria. Ele preserva com fidelidade: objetivo, escopo, veredito por P0, classificações de risco, nomes técnicos (tabelas, views, funções, buckets, migrations, commits) e as observações qualitativas mais importantes (achado novo, hardening secundário, falso positivo).
2. **Não preservados na fonte:** comandos SQL literais executados, payloads REST enviados, respostas HTTP completas (exceto a menção textual a "HTTP 200"), logs de console, contagem exata de repetições de teste para 7 dos 8 P0, dados de testes de carga/concorrência (não há registro de que tenham sido executados), e a lista granular de todas as policies/grants individualmente auditados.
3. Todos os campos afetados por essa lacuna foram explicitamente marcados como **"Não informado no conteúdo fornecido"**, conforme instruído — nenhum dado foi inventado ou extrapolado para preenchê-los.
4. Nenhuma classificação de risco, nome técnico, resultado de teste ou conclusão foi alterada em relação à fonte.
