# ANÁLISE OWASP ASVS — AUDITORIA DE REGRESSÃO PÓS-P0 (ORION-480)

**Documento analisado:** `DOCS/ORION-480-RELATORIO-AUDITORIA-REGRESSAO-POS-P0-2026-08-06.md`
**Framework de referência:** OWASP ASVS 4.0.3 (numeração de controles) + mapeamento de capítulo para ASVS 5.0
**Data da análise:** 2026-08-06
**Escopo:** classificação taxonômica dos 8 P0 reauditados + 2 achados novos, e cobertura ASVS resultante
**Natureza:** análise documental. Não houve reexecução de testes nem acesso ao banco nesta sessão — a análise vale sobre o que o relatório afirma, não sobre o estado real do banco.

---

## 0. Definições usadas (para desambiguar as categorias pedidas)

As três primeiras categorias solicitadas se sobrepõem no uso comum. Aqui elas são aplicadas com fronteira estrita:

| Categoria | Definição aplicada |
|---|---|
| **Authentication** | Provar *quem* é o requisitante (credencial, sessão, MFA, chave). |
| **Authorization** | A *regra/decisão* sobre o que aquela identidade pode fazer (policy, predicado, ownership). |
| **Access Control** | O *enforcement* efetivo da decisão no ponto de execução (RLS ativo, GRANT/REVOKE, DROP de policy, coluna). |

Consequência direta desta separação, e é o achado estrutural mais importante da análise:
**nenhum dos 8 P0 é uma falha de Authentication.** Todos são falhas de **Authorization** (regra ausente, permissiva ou escrita contra a coluna errada) materializadas na camada de **Access Control** do Postgres/Supabase. O papel `anon` estava se autenticando corretamente — ele *era* anônimo, e recebia privilégios que não deveria ter.

Legenda das matrizes: **●** categoria primária · **○** categoria secundária/contribuinte · **–** não aplicável.

---

## 1. Matriz de classificação — 8 P0

| P0 | Auth­entication | Auth­orization | Access Control | Crypto­graphy | Business Logic | Config­uration | Storage | Functions | RLS | Views |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **P0-3** `advertiser_listings` (escrita anônima) | – | ● | ● | – | ○ | ○ | – | – | ● | – |
| **P0-4** `promotion_*` (financeiro) | – | ● | ○ | – | ● | ○ | – | – | ● | – |
| **P0-5** `advertiser_accounts` (PII) | – | ● | ● | ○ᵍ | – | ○ | – | – | ● | – |
| **P0-6** `visitor_profiles` (PII) | – | ● | ● | ○ᵍ | ○ | – | – | – | ● | – |
| **P0-7** `merchant_credit_*` (financeiro) | – | ● | ● | – | ○ | ● | – | – | ● | – |
| **P0-8** `storage.objects` (Full Access) — CRÍTICO | – | ● | ● | ○ᵍ | – | ○ | ● | – | ● | – |
| **P0-9** 51 views `security_invoker=off` | – | ● | ● | – | ○ | ● | – | – | ●ᵇ | ● |
| **P0-10** 56 funções `SECURITY DEFINER` sem `search_path` | – | ○ | ○ | – | – | ● | – | ● | ○ᵇ | – |

ᵍ = **lacuna, não achado**: o dado é PII/documento sensível, portanto criptografia em repouso (ASVS 6.1.1) é um controle *aplicável*, mas o relatório não o testou nem o menciona. Marcado para não deixar a coluna Cryptography parecer "não aplicável" quando na verdade é "não verificada".
ᵇ = RLS entra como **mecanismo contornado**, não como mecanismo defeituoso: em P0-9 a view com `security_invoker=off` executa como owner e ignora o RLS da tabela base; em P0-10 o `SECURITY DEFINER` faz o mesmo pela via da função.

### 1.1 Justificativa por P0

**P0-3 — Escrita anônima em `advertiser_listings`/`advertiser_listings_media`**
Policy `ALL USING(true)` = ausência de regra de autorização, não falha de enforcement (o RLS estava ligado e obedecendo uma regra que dizia "sim para todos"). Primário: Authorization + Access Control + RLS. Business Logic entra como secundário porque a consequência é adulteração de anúncio de terceiro — integridade de conteúdo de outro titular, não apenas leitura indevida. Configuration entra pelo REVOKE de escrita a `anon` e pela migração das policies administrativas para `is_admin()` (consolidação em mecanismo único de decisão).

**P0-4 — `promotion_packages`/`promotion_purchases`/`promotion_logs`**
Único P0 do conjunto em que **Business Logic é primária junto com Authorization**. Marcar 22 compras como pagas e alterar 27 preços não é só leitura/escrita indevida: é subverter a máquina de estados de pagamento e o preço de referência da transação — o atacante altera o *resultado comercial*, não só o dado. Apagar 218 logs adiciona um vetor de destruição de trilha de auditoria, que em ASVS cai em V7 (Logging), fora das 10 categorias pedidas mas relevante para o veredito.

**P0-5 — PII em `advertiser_accounts`**
Duas falhas distintas embaladas em um P0. (a) Exposição pública de e-mail/WhatsApp → Authorization/Access Control clássico, corrigido com granularidade **de coluna** (privilégio mínimo real, não só de linha). (b) A policy de UPDATE comparando `id` em vez de `user_id` é um **IDOR canônico**: o objeto era autorizado pela chave errada, permitindo escrita na linha de outro titular. O ajuste de frontend (`select("*")` → colunas explícitas) é mitigação de *excessive data exposure*, defesa em profundidade — não substitui o controle no banco, e o relatório trata corretamente como complementar.

**P0-6 — PII em `visitor_profiles`**
Caso mais interessante do ponto de vista de desenho: SELECT/UPDATE fechados, mas **INSERT anônimo deliberadamente preservado** com `WITH CHECK (user_id IS NULL OR user_id = auth.uid())`. Isso é o padrão ASVS correto — deny-by-default com exceção explícita e estreitamente qualificada, em vez de manter `USING(true)` por conveniência do fluxo de visitante. Business Logic entra como secundário justamente por isso: a correção teve de preservar um fluxo de negócio legítimo. Contrapartida não endereçada: um INSERT aberto a `anon` sem limite de taxa é superfície de abuso automatizado (ASVS 11.1.4), e o relatório não testa isso.

**P0-7 — `merchant_credit_*`**
Authorization/Access Control/RLS no núcleo, mas **Configuration é primária** aqui por causa do desfecho: o RLS foi corrigido e o **GRANT SELECT a `anon` permaneceu no catálogo** (Achado Novo #2). Grant vivo sem policy que o habilite é privilégio latente — hoje inofensivo, amanhã explorável se qualquer policy for removida. Isso é exatamente a violação de 4.1.3 (privilégio mínimo) que o ASVS pede que se elimine mesmo quando não explorável.

**P0-8 — Full Access em `storage.objects` (CRÍTICO)**
**Storage é primária** e a criticidade não vem da tabela, vem do conteúdo: CNH (`carrier-documents`), documentos veiculares, `convenio`, `moderacao`. É a combinação de dado regulado com acesso anônimo irrestrito. Nota técnica do relatório que merece registro: o REVOKE de grants em `storage.objects` é **inefetivo** porque o owner é `supabase_storage_admin`; o fix efetivo é o DROP das policies, já que com RLS ativo o grant fica inócuo. Esse raciocínio está correto e é o tipo de detalhe que distingue correção real de correção aparente.

**P0-9 — 51 views com `security_invoker=off`**
**Views é primária** porque a view *é* o vetor: executando com privilégios do owner, ela é um caminho paralelo que contorna o enforcement point (o RLS da tabela base). Em termos ASVS isso viola 1.4.4 — a aplicação deve ter **um único** mecanismo de controle de acesso bem verificado, e uma view `security_invoker=off` cria um segundo mecanismo tácito que ninguém revisa. Configuration é primária junto, pois o fix é REVOKE de `anon` no catálogo, não reescrita de lógica. **Ressalva grave:** o REVOKE resolveu `anon`; o eixo `authenticated` não-admin segue aberto e está registrado como P1 pendente — ou seja, para as 51 views o controle está verificado contra atacante *não autenticado* e **não verificado** contra atacante *autenticado*.

**P0-10 — `search_path` hijack em 56 funções `SECURITY DEFINER`**
O único P0 que não é uma policy errada. É defeito de **codificação/configuração de função** com consequência de elevação de privilégio: sem `search_path` fixo, um objeto plantado em schema sob controle do atacante é resolvido primeiro e executa com privilégios do definer. Por isso Functions + Configuration primárias, e Authorization/Access Control apenas como *consequência*. Classificar isso como "falha de RLS" seria erro de diagnóstico — o RLS estava correto; o caminho de execução privilegiado é que era sequestrável. É também o item de encaixe mais fraco no ASVS 4.0.3 (ver §2.2).

### 1.2 Matriz de classificação — achados novos

| Achado | Auth­entication | Auth­orization | Access Control | Crypto­graphy | Business Logic | Config­uration | Storage | Functions | RLS | Views |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **#1** Upload público irrestrito em `real-estate-original` (P1) | – | ● | ● | – | ○ | ● | ● | – | ● | – |
| **#2** GRANT SELECT residual em `merchant_credit_*` (hardening) | – | ○ | ○ | – | – | ● | – | – | ○ | – |
| Falso positivo `visitor_profiles` (flakiness de gateway) | – | – | – | – | – | – | – | – | – | – |

**Achado #1** é a falha de maior alcance ASVS de todo o relatório, porque abre uma frente inteira que os 8 P0 não tocavam: policies que checam só `bucket_id` sem exigir `foldername = auth.uid()` significam ausência de isolamento por titular *e* ausência de qualquer controle de arquivo — sem quota, sem limite de tamanho, sem validação de tipo por conteúdo, sem varredura antimalware. O relatório atribui corretamente a causa raiz à migration `20260330_storage_fix_final.sql` ("SOLUÇÃO DEFINITIVA - ABRIR TUDO"), anterior a todos os P0, e classifica como item de fila nova, não regressão. Concordo com a classificação de não-regressão; discordo do rótulo **P1** — ver §4.1.

**Falso positivo:** o evento intermitente de "RLS violation" em `visitor_profiles` (2 falhas → 3 sucessos) está fora da taxonomia de segurança por construção: se a hipótese de flakiness de gateway está certa, é disponibilidade, não controle de acesso. Registro uma ressalva metodológica: a hipótese não foi *provada*, foi inferida do padrão de reteste. Falha que se resolve sozinha em política de segurança merece, no mínimo, correlação com log do gateway antes de ser arquivada.

---

## 2. Mapeamento para controles ASVS

### 2.1 Controles exercitados e aprovados

| Controle ASVS 4.0.3 | Nível | Enunciado (resumido) | P0 que o exercitam | Veredito |
|---|:--:|---|---|---|
| **4.1.1** | L1 | Controle de acesso imposto em camada de serviço confiável, não no cliente | 3, 4, 5, 6, 7, 8, 9 | Aprovado (enforcement no banco via RLS/GRANT, não no frontend) |
| **4.1.2** | L1 | Atributos e dados de política usados pelo controle de acesso não manipuláveis pelo usuário | 4, 5, 6 | Aprovado (status `paid`/preço e `user_id` deixaram de ser escrevíveis por `anon`) |
| **4.1.3** | L1 | Privilégio mínimo; proteção contra elevação de privilégio | **todos os 8** | Aprovado para `anon`; parcial em P0-7 (grant residual) |
| **4.1.5** | L1 | Controles de acesso falham de forma segura (deny by default) | 3, 4, 6, 7, 8, 9 | Aprovado (`USING(true)` substituído por predicado explícito) |
| **4.2.1** | L1 | Proteção contra IDOR em create/read/update/delete | 3, 4, 5, 6, 8 | Aprovado; P0-5 é o caso textual (`id` → `user_id`) |
| **1.4.4** | L2 | Mecanismo de controle de acesso único e bem verificado | 3, 9 | Aprovado parcialmente (policies admin consolidadas em `is_admin()`; views deixam de ser via paralela para `anon`) |
| **7.3.3** | L2 | Logs de segurança protegidos contra modificação/remoção não autorizada | 4 | Aprovado (DELETE de `promotion_logs` bloqueado) |
| **8.3.4** | L2 | Dados sensíveis identificados e com política de tratamento | 5, 6, 8 | Parcial — a PII foi *identificada* (e-mail, WhatsApp, CNH); política formal de tratamento não evidenciada |
| **11.1.5** | L1 | Limites/validação de lógica de negócio contra riscos de negócio prováveis | 4 | Aprovado no eixo de autorização; limites de negócio propriamente ditos não testados |
| **12.4.1** | L1 | Arquivos de origem não confiável armazenados com permissões limitadas | 8 | Aprovado para os buckets privados; **reprovado** no bucket do Achado #1 |
| **14.2.2** | L1 | Recursos, features e configurações desnecessárias removidos | 7, 9, 10 | Parcial (grant residual sobrevive) |
| **13.1.4** | L1 | Decisões de autorização tomadas no nível de URI **e** de recurso | 3, 4, 5, 6, 7, 9 | Aprovado implicitamente (testes via REST/PostgREST atingiram o nível de recurso) |

### 2.2 Controles tocados sem encaixe limpo

**P0-10 (`search_path` hijack) não tem controle dedicado no ASVS 4.0.3.** É honesto dizer isso em vez de forçar um número. Os encaixes possíveis são todos aproximados: 4.1.3 (pelo efeito — elevação de privilégio), 1.2.1 (contas de baixo privilégio para componentes), 14.2.2 (configuração insegura remanescente). Em **ASVS 5.0** o item cai com mais naturalidade em **V15 — Secure Coding and Architecture**, que passou a tratar explicitamente padrões inseguros de código privilegiado. Registrar como lacuna do próprio padrão, não da auditoria.

O mesmo vale, em menor grau, para P0-9: "view que contorna RLS" é um antipadrão de arquitetura de dados que o ASVS só alcança obliquamente por 1.4.4.

### 2.3 Mapeamento de capítulo para ASVS 5.0

| ASVS 4.0.3 | ASVS 5.0 | Relevância neste relatório |
|---|---|---|
| V4 Access Control | **V8 Authorization** | Núcleo — 7 dos 8 P0 |
| V8 Data Protection | **V14 Data Protection** | PII de `advertiser_accounts`, `visitor_profiles`, documentos do Storage |
| V12 Files and Resources | **V5 File Handling** | P0-8 e Achado #1 |
| V14 Configuration | **V13 Configuration** | Grants, policies, `search_path` |
| V11 Business Logic | **V2 Validation and Business Logic** | P0-4 |
| V7 Error Handling / Logging | **V16 Security Logging and Error Handling** | Integridade de `promotion_logs` |
| — | **V15 Secure Coding and Architecture** | Melhor lar para P0-10 |

---

## 3. Cobertura ASVS resultante

### 3.1 Por capítulo (ASVS 4.0.3 — 14 capítulos)

| Capítulo | Cobertura | Observação |
|---|:--:|---|
| **V4 — Access Control** | ●●● Substancial | Único capítulo com cobertura real. 5 requisitos L1 exercitados adversarialmente (4.1.1, 4.1.2, 4.1.3, 4.1.5, 4.2.1) |
| V7 — Error Handling / Logging | ◐ Fragmentária | Só 7.3.3, e só como efeito colateral do P0-4 |
| V8 — Data Protection | ◐ Parcial | Dados sensíveis identificados; classificação, retenção e cache não verificados |
| V11 — Business Logic | ◐ Parcial | Só P0-4. Sem teste de concorrência/TOCTOU (11.1.6) e sem anti-automação (11.1.4) — o próprio relatório admite |
| V12 — Files and Resources | ◐ Parcial | Só o eixo de controle de acesso. Quota, tipo, tamanho, antimalware: nada |
| V13 — API / Web Service | ◐ Parcial | REST/PostgREST exercitado como transporte de exploit, não auditado como superfície |
| V14 — Configuration | ◐ Parcial | Grants/policies/`search_path`. Sem headers, debug mode, versões |
| V1 — Architecture / Threat Modeling | ✗ | Nenhuma modelagem de ameaça formal; escopo herdado da certificação anterior |
| V2 — Authentication | ✗ | **Zero.** Nenhum teste de login, política de senha, MFA ou bloqueio de força bruta |
| V3 — Session Management | ✗ | Anon key e JWT usados como ferramenta, nunca auditados |
| V5 — Validation / Sanitization | ✗ | Nenhum teste de injeção, encoding ou validação de entrada |
| V6 — Stored Cryptography | ✗ | **Nenhuma verificação de criptografia em repouso**, apesar de CNH e PII no escopo (6.1.1) |
| V9 — Communication | ✗ | TLS/cifras não verificados |
| V10 — Malicious Code | ✗ | Fora de escopo |

**Placar: 1 capítulo substancial, 6 parciais, 7 não cobertos.**

### 3.2 O que isso significa em termos de nível ASVS

Os controles que os 8 P0 violavam — 4.1.1, 4.1.3, 4.1.5, 4.2.1 — são requisitos de **Nível 1**, o piso do ASVS, aplicável a qualquer aplicação. Duas leituras decorrem daí, e as duas importam:

1. **Antes das correções, a plataforma estava abaixo de ASVS L1** no capítulo de controle de acesso. Não era um débito de maturidade avançada; era o mínimo. O P0-8 (CNH pública) sozinho reprova L1.
2. **Depois das correções, o que se pode afirmar é estreito:** os requisitos L1 de V4 estão satisfeitos *contra o papel `anon`*. Isso não é conformidade L1 da aplicação — L1 exige o capítulo inteiro e todos os papéis.

### 3.3 Três limites que impedem tratar isto como certificação ASVS

**(a) Um só eixo de atacante.** Sete dos oito P0 foram testados apenas como `anon`. O eixo `authenticated` não-admin — escalonamento horizontal entre usuários legítimos, que é o cenário de ataque mais provável em marketplace com contas gratuitas — está explicitamente registrado como P1 pendente em P0-9 e não foi exercitado nos demais. Para ASVS, 4.2.1 verificado só contra não autenticado é 4.2.1 **não verificado**.

**(b) Evidência não rastreável.** O relatório declara 60–65% de completude e marca comandos SQL, payloads REST e respostas HTTP como "Não informado no conteúdo fornecido". A honestidade da declaração é um ponto a favor do documento, mas o efeito técnico é objetivo: **um veredito "Aprovado" sem o artefato do teste não é reproduzível por terceiro** e não sustenta certificação L2+, que exige verificação documentada. Os 8 "Aprovado" devem ser lidos como *atestados de auditor*, não como evidência.

**(c) Escopo por regressão, não por superfície.** A auditoria pergunta "as 8 correções continuam de pé?" — pergunta legítima e bem respondida. O ASVS pergunta "a superfície está coberta?". O Achado #1 é a prova empírica da diferença: apareceu por acidente, ao varrer policies vizinhas às já corrigidas. Uma varredura orientada por V12/V5-ASVS-5.0 o teria encontrado por desenho, e teria encontrado em março.

---

## 4. Divergências e ressalvas em relação ao relatório

### 4.1 O Achado #1 está subclassificado como P1

O relatório propõe P1. Pelos critérios que ele mesmo aplicou ao P0-8, a classificação deveria ser mais alta. Fundamentos:

- **Explorável hoje, sem credencial, comprovado.** Não é hipótese: houve upload HTTP 200 como `anon`.
- **Sem isolamento por titular.** Ausência de `foldername = auth.uid()` significa que o atacante escolhe o caminho do arquivo — incluindo caminhos que colidem com objetos de outros usuários.
- **Nenhum controle compensatório de arquivo.** Sem quota (12.1.3), sem limite de tamanho (12.1.1), sem validação de tipo por conteúdo (12.2.1), sem antimalware (12.4.2). O vetor não é só armazenamento: é hospedagem de conteúdo arbitrário sob um domínio da plataforma.
- **Vive em produção desde março de 2026** e sobreviveu a duas rodadas de auditoria de segurança.

O argumento de que "não é regressão" está correto e é irrelevante para a severidade. Origem histórica não reduz impacto. Recomendação: reclassificar como **P0 de fila nova**, com o mesmo tratamento dado ao P0-8, ao qual é tecnicamente irmão.

### 4.2 O falso positivo foi arquivado por inferência

Ver §1.2. A conclusão de flakiness é plausível e provavelmente certa, mas foi obtida por padrão de reteste, não por correlação com log de gateway. Fica registrado como pendência de baixo custo: 2 falhas de RLS que desaparecem sem alteração de policy merecem confirmação na origem antes do arquivamento definitivo.

### 4.3 Higiene de credencial é item ASVS, não nota de rodapé

O uso da `service_role` key para limpeza dos artefatos de teste aparece como "Baixa" prioridade. Em ASVS isso é **2.10.4** (segredos de integração e API keys geridos com segurança e fora do repositório) e **6.4.1** (solução de gestão de segredos). Uma chave `service_role` do Supabase ignora RLS por completo — é equivalente funcional de credencial de superusuário da aplicação. Manter como Baixa é subestimar; o correto é confirmar explicitamente o descarte e, se houve qualquer exposição em histórico de shell ou arquivo, **rotacionar**.

### 4.4 Testar exploit de escrita em produção precisa de controle formal

O próprio relatório registra, em Limitações, que um UPDATE real chegou a afetar 1 linha em auditoria anterior. `ROLLBACK` é mitigação boa e foi bem usada, mas não é garantia: nem todo caminho de exploit é transacional (upload de Storage, notavelmente, não é — e de fato deixou artefato que precisou de limpeza com `service_role`). Recomendação estrutural: réplica de staging com dados sintéticos para os exploits de escrita, mantendo produção para exploits de leitura.

---

## 5. Fila de trabalho derivada da análise ASVS

Priorizada por controle ASVS violado × explorabilidade comprovada:

| # | Ação | Controle ASVS | Prioridade |
|---|---|---|---|
| 1 | Corrigir `real-estate-original`: `foldername = auth.uid()` nas 3 policies + quota + limite de tamanho + validação de tipo por conteúdo | 12.1.1, 12.1.3, 12.2.1, 12.4.1, 4.1.3 | **P0** (elevada de P1) |
| 2 | Reauditar os 8 P0 pelo eixo `authenticated` não-admin (escalonamento horizontal), começando pelas 51 views do P0-9 | 4.2.1, 4.3.3, 1.4.4 | **P0** |
| 3 | Confirmar descarte / rotacionar a `service_role` key usada na limpeza | 2.10.4, 6.4.1 | **P1** |
| 4 | REVOKE do GRANT SELECT residual em `merchant_credit_contact_unlocks`/`result_metrics`/`subscriptions` | 4.1.3, 14.2.2 | P1 |
| 5 | Varredura completa de `storage.objects`: inventário de todo bucket × policy, buscando outros resíduos de `20260330_storage_fix_final.sql` | 12.4.1, 14.2.2 | P1 |
| 6 | Verificar criptografia em repouso de PII e documentos regulados (CNH, RENAVAM, documentos veiculares) | 6.1.1, 1.8.1, 1.8.2 | P1 |
| 7 | Instituir preservação de evidência literal (SQL + resposta HTTP) por teste, como requisito de certificação | Assessment & Certification | P1 |
| 8 | Rate limiting / anti-automação no INSERT anônimo de `visitor_profiles` | 11.1.4 | P2 |
| 9 | Cobrir os 7 capítulos ASVS em zero (V2, V3, V5, V6, V9, V10, V1) em auditoria orientada por superfície, não por regressão | ASVS L1 completo | P2 |
| 10 | Correlacionar o falso positivo de `visitor_profiles` com log do gateway antes do arquivamento definitivo | 11.1.6, 7.2.2 | P3 |

---

## 6. Veredito da análise ASVS

O relatório é **metodologicamente sólido no que se propôs** — reprodução adversarial de exploit contra banco vivo, com critério de aceitação declarado antes do teste, é o padrão correto, e a postura de tentar provar a própria falha é o que separa auditoria de revalidação. A conclusão de "sem regressão nos 8 P0" é defensável nos termos em que foi formulada.

Sob a lente ASVS, porém, três reposicionamentos se impõem:

1. **A cobertura é de um capítulo, não da norma.** V4 (Access Control) foi exercitado com profundidade real; 7 dos 14 capítulos ficaram em zero. O documento não pode ser lido como conformidade ASVS de nenhum nível — e, para seu crédito, ele não faz essa afirmação.
2. **Os controles restaurados são de Nível 1.** O que foi corrigido é o piso da norma, não maturidade avançada. Isso reenquadra a certificação: não é "plataforma endurecida", é "plataforma que voltou ao mínimo exigível no capítulo de controle de acesso, contra atacante não autenticado".
3. **O achado incidental é o dado mais informativo do relatório.** Um bucket com upload anônimo irrestrito, vivo desde março, encontrado por acidente ao olhar policies vizinhas, mede o tamanho do que ainda não foi mapeado melhor do que os 8/8 aprovados. Auditoria por regressão fecha o que já se conhece; ela não descobre. O próximo ciclo deveria ser orientado por superfície ASVS, não por lista de P0 anterior.

---

*Análise documental. Nenhum teste foi reexecutado e nenhuma consulta ao banco `broifhfqmnzqoongtokm` foi feita nesta sessão — as afirmações sobre o estado do banco são as do relatório analisado, não verificação independente.*
