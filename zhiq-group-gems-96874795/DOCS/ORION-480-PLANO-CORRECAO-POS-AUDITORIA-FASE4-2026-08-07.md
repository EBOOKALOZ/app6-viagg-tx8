# ORION-480 ENTERPRISE

# PLANO OFICIAL DE CORREÇÃO

## FASE 4 — AÇÕES PRIORITÁRIAS PÓS-AUDITORIA

**Documento:** `DOCS/ORION-480-PLANO-CORRECAO-POS-AUDITORIA-FASE4-2026-08-07.md`

**Versão:** 1.0
**Data:** 07/08/2026
**Status:** APROVADO PARA EXECUÇÃO

---

# OBJETIVO

Definir oficialmente a ordem de implementação das correções identificadas na Auditoria de Usuários Simultâneos do ORION-480, priorizando os riscos de maior impacto antes da retomada da certificação.

---

# RESUMO EXECUTIVO

A auditoria identificou:

* 36 achados totais
* 2 vulnerabilidades CRÍTICAS confirmadas
* 8 vulnerabilidades ALTAS confirmadas
* 1 falso positivo descartado após validação adversarial

Enquanto os dois achados críticos permanecerem sem correção, a Certificação Final da Fase 4 permanece suspensa.

---

# PRIORIDADE P0 — EXECUÇÃO IMEDIATA

## P0-01 — `pay_release_ride_payment`

**Criticidade:** CRÍTICA

### Objetivo

Garantir que apenas usuários autorizados possam liberar pagamentos em escrow.

### Escopo mínimo da correção

* Validar autenticação.
* Validar autorização.
* Confirmar vínculo entre usuário, corrida e pagamento.
* Bloquear chamadas diretas não autorizadas.
* Registrar logs de auditoria.
* Garantir idempotência.
* Reexecutar validação adversarial.

### Critério de aceite

* Nenhum pagamento pode ser liberado por usuário sem autorização.
* Todos os cenários de teste aprovados.
* Nenhuma regressão funcional.

**Status:** ✅ CORRIGIDO, VALIDADO ADVERSARIALMENTE (veredito SUFICIENTE) E **APLICADO EM PRODUÇÃO** em 07/08/2026

**Evidência:** nova migration `supabase/migrations/20260807010000_p0_fix_pay_release_ride_payment_ownership.sql`, adiciona checagem `IF v_prof IS NOT NULL AND v_uid <> v_prof AND NOT public.is_admin() THEN RAISE EXCEPTION ...`. Verificação adversarial confirmou: (1) única mudança de lógica é essa checagem, resto idêntico à versão vigente; (2) exploit original agora falha com ERRCODE 42501 antes de qualquer efeito financeiro; (3) fluxo legítimo do motoboy real não é afetado (v_uid = v_prof no caminho normal); (4) branch `v_prof IS NULL` continua seguro (retorna 'skipped' sem mover dinheiro).

**Aplicado via** `supabase db query --linked --file` (mesmo projeto `broifhfqmnzqoongtokm`). **Confirmado no banco vivo**: `pg_get_functiondef` da função vigente contém a string de erro da checagem nova. **Exploit reproduzido e bloqueado**: simulação de um `auth.uid()` sem vínculo com uma `service_order` real chamando `pay_release_ride_payment` diretamente retornou `ERROR: 42501: não autorizado a liquidar esta corrida` — a vulnerabilidade original não é mais explorável em produção.

**Achado colateral não bloqueante:** existe um trigger `tg_service_order_release_payment` em produção (referenciado só em comentário) que chama `release_delivery_payment` → `pay_release_ride_payment`, mas não está versionado em nenhuma migration do repositório — recomendado versionar em ação futura separada, fora do escopo deste P0.

---

## P0-02 — `send-ticket-response`

**Criticidade:** CRÍTICA

### Objetivo

Eliminar a possibilidade de utilização indevida do endpoint para envio de mensagens utilizando o domínio institucional.

### Escopo mínimo da correção

* Exigir autenticação.
* Validar permissões.
* Restringir destinatários conforme regra de negócio.
* Implementar rate limiting.
* Registrar logs completos.
* Validar origem da requisição.
* Reexecutar validação adversarial.

### Critério de aceite

* Endpoint inacessível para usuários não autorizados.
* Tentativas indevidas bloqueadas.
* Auditoria de logs aprovada.

**Status:** ✅ CORRIGIDO, VALIDADO ADVERSARIALMENTE (veredito SUFICIENTE) E **DEPLOYADO EM PRODUÇÃO** em 07/08/2026

**Evidência:** `supabase/functions/send-ticket-response/index.ts` reescrita — exige `Authorization` + `auth.getUser()` + checagem `user_roles.role='admin'` (mesmo padrão de `payments-gateway-test`) antes de qualquer processamento; `client_email`/`assunto` não são mais aceitos do payload, são resolvidos de `support_tickets`/`profiles` no banco; `escapeHtml()` aplicada em `assunto`/`resposta`. Caller em `src/pages/admin/AdminSupport.tsx` atualizado para enviar só `{ticket_number, resposta}`. Verificação adversarial confirmou guarda fora do try/catch (nenhum caminho de exceção contorna a checagem de admin), escaping correto na ordem certa, e único caller do repo já ajustado.

**Deploy confirmado** via `supabase functions deploy send-ticket-response --project-ref broifhfqmnzqoongtokm`. **Exploit original reproduzido via HTTP real e bloqueado**: `curl -X POST` sem header `Authorization` contra o endpoint em produção agora retorna `HTTP 401 {"ok":false,"error":"Authorization obrigatório"}` — antes desta correção, a mesma requisição disparava e-mail arbitrário sem qualquer checagem.

**Observação não bloqueante:** `verify_jwt=false` permanece no `config.toml` (mesmo padrão de `payments-gateway-test`); a segurança depende inteiramente da guarda manual no handler — uma refatoração futura que remova essa guarda por engano reabriria o endpoint. Sem segunda camada de proteção de plataforma como rede de segurança.

---

# PRIORIDADE P1

Após o encerramento dos P0, executar:

1. Implementar cabeçalhos HTTP de segurança recomendados.
2. Sanitizar todo uso de `dangerouslySetInnerHTML`.
3. Sanitizar respostas renderizadas pela IA no chat.
4. Adicionar controle transacional para impedir débitos duplicados em ofertas de leilão.
5. Configurar timeout consistente para clientes Supabase.
6. Revisar e restringir políticas de CORS das Edge Functions conforme necessidade operacional.
7. Implementar proteção contra tentativas repetidas de autenticação.
8. Corrigir os demais achados classificados como Alta criticidade.

---

# PLANO DE VALIDAÇÃO

Após cada correção:

1. Executar testes unitários.
2. Executar testes de integração.
3. Executar validação adversarial específica.
4. Confirmar ausência de regressões.
5. Registrar evidências.
6. Atualizar a documentação técnica.

---

# AUDITORIA DE REGRESSÃO

Ao término das correções P0 e P1 será emitido um novo relatório contendo:

* Evidências da implementação.
* Resultado da validação adversarial.
* Comparação entre estado anterior e atual.
* Confirmação de ausência de regressões.
* Atualização da matriz de riscos.

---

# CRITÉRIOS PARA RETOMADA DA CERTIFICAÇÃO

A Certificação Final da Fase 4 somente poderá ser retomada quando todos os itens abaixo forem atendidos:

* Dois achados críticos corrigidos.
* Oito achados de alta criticidade tratados ou formalmente aceitos conforme política do projeto.
* Auditoria de regressão aprovada.
* Evidências técnicas registradas.
* Testes dinâmicos de carga, concorrência, resiliência e defesa executados em ambiente de homologação isolado.
* Atualização da matriz de riscos e da matriz de cobertura.

---

# CRONOGRAMA DE EXECUÇÃO

| Ordem | Atividade                                     | Prioridade |
| ----: | --------------------------------------------- | ---------- |
|     1 | Correção do `pay_release_ride_payment`        | P0         |
|     2 | Correção do `send-ticket-response`            | P0         |
|     3 | Validação adversarial dos P0                  | P0         |
|     4 | Correção dos oito achados de Alta criticidade | P1         |
|     5 | Auditoria de regressão                        | P1         |
|     6 | Testes dinâmicos em ambiente de homologação   | P2         |
|     7 | Emissão da Certificação Final                 | P2         |

---

# CONCLUSÃO

Este plano estabelece a sequência oficial de tratamento dos achados identificados na Auditoria da Fase 4.

A prioridade absoluta é a eliminação das vulnerabilidades críticas, seguida da mitigação dos riscos de alta criticidade. Somente após a validação das correções e a execução dos testes pendentes em ambiente apropriado será possível emitir a Certificação Final da Auditoria de Usuários Simultâneos do ORION-480.
