# ORION Sound System — Plano de Segurança (Criptografia · Autenticação · Teste)

> **Data:** 2026-07-19 · **Natureza:** PLANO (auditoria + desenho das 3 fases). **Nada implementado.**
> **Escopo:** módulo de rádios (`orion_audio_*`). Auditoria feita ao vivo em `broifhfqmnzqoongtokm`.

---

## Estado atual (auditado, com evidência)

**Tabelas (RLS ligado em todas as 8):**
| Tabela | Isolamento | Grants |
|---|---|---|
| `orion_audio_settings` / `_presets` / `_events` | ✅ RLS por usuário (`user_id = auth.uid()`) | ⚠ authenticated tem DML total **+ TRUNCATE** |
| `orion_audio_radio_curated` (1.564) | leitura pública (`ativo=true`) | anon/auth só SELECT ✅ |
| `orion_audio_radio_queue` / `_sync_log` / `_stations` / `_plays` | SELECT só admin | service_role escreve ✅ |

**Funções (23):** escrita do catálogo (`upsert`/`delete`/`set_active`/`ingest`/`queue_*`/`merge`/`reclassify`) **exige admin** (`mp_is_admin`) ✅. Leitura (`search_v2`/`curated_search`/`popular`/`log`) é pública ✅.

**PII:** o módulo **não guarda dado pessoal** além de `criado_por` (uuid) — baixo risco de exposição.

### Problemas encontrados (o que motiva as fases)

1. 🔴 **`addMyRadio` (botão "adicionar minha rádio") está QUEBRADO:** chama `audio_radio_curated_upsert`, que **exige admin**. Um ouvinte comum **não consegue** adicionar rádio — a chamada é negada (introduzido no commit `cf8f9d2`). Além disso, se passasse, **grava direto no catálogo público** sem revisão.
2. 🟠 **Nenhuma validação/sanitização da `stream_url`:** o upsert aceita qualquer texto como URL. Um link malicioso (javascript:, data:, http de phishing) entraria no catálogo compartilhado de todos. **Sem criptografia/validação de entrada.**
3. 🟠 **`orion_audio_settings/presets/events` com TRUNCATE p/ authenticated:** um usuário logado poderia truncar (RLS não barra TRUNCATE) — mesmo padrão do ORION-HARDENING.
4. 🟡 **Zero testes:** não há selftest/health do módulo (todos os outros ORION têm). Nada prova que RLS/gates continuam corretos após mudanças.
5. 🟡 **Sem criptografia dos dados sensíveis do usuário:** `orion_audio_settings.config` (preferências) e favoritos ficam em claro — baixo risco (não é PII), mas sem política definida.

---

## FASE 1 — Criptografia & Validação de Entrada

**Objetivo:** nenhum dado inválido/perigoso entra no catálogo; dados sensíveis protegidos.

1. **Validar `stream_url` no banco** (função `audio_url_valida(text)` IMMUTABLE): aceitar só `http(s)://` com host válido; **rejeitar** `javascript:`, `data:`, `file:`, vazios. Aplicar no `upsert`/`ingest`/na fila (RAISE se inválido).
2. **Sanitizar campos de texto** (nome/cidade/tags) contra injeção de HTML/script antes de gravar (o front já exibe como texto, mas defesa em profundidade).
3. **Criptografia de trânsito:** garantir que o app **prefira sempre o stream `https://`** quando existir (já iniciado); documentar que `http://` puro é limitação do navegador, não do app.
4. **Dados do usuário:** manter `settings/presets` como estão (não é PII), mas **remover o grant TRUNCATE** de authenticated (defesa em profundidade). Avaliar hash/assinatura do `config` para detectar adulteração (opcional).
- **Entrega:** migration aditiva `audio_url_valida` + REVOKE TRUNCATE. Sem quebrar leitura pública.

## FASE 2 — Autenticação & Autorização

**Objetivo:** cada ação tem o dono certo; ouvinte pode contribuir sem virar admin.

1. **Corrigir o fluxo "adicionar minha rádio"** (o bug atual): criar RPC `audio_radio_sugerir(nome, stream_url, cidade, uf)` que **qualquer autenticado** pode chamar, mas que **NÃO publica direto** — insere na **fila de aprovação** (`orion_audio_radio_queue`, status `pending`) com a validação da FASE 1 + classificador de confiança. Admin aprova (fluxo já existe). O ouvinte pode **ouvir na hora** (localStorage/custom station), mas o catálogo público só recebe após aprovação.
2. **Gate por papel explícito:** confirmar que `upsert/delete/merge/reclassify` continuam **admin-only**; `sugerir/log/search` = authenticated/anon.
3. **Rate limit** de sugestões por usuário (ex.: máx N/dia) para evitar flood do catálogo — via contagem na fila.
4. **Autoria auditável:** toda sugestão/aprovação registra `user_id` + timestamp (a fila já tem `revisado_por`; adicionar `sugerido_por`).
- **Entrega:** migration com `audio_radio_sugerir` + ajuste do front (`addMyRadio` → sugerir, com mensagem "enviada para aprovação"; tocar continua imediato).

## FASE 3 — Teste & Homologação

**Objetivo:** provar que segurança e fluxo funcionam, e que nada regrediu.

1. **Selftest do módulo** `audio_radio_selftest()` (admin/service, padrão ORION): verifica RLS em todas as tabelas, EXECUTE de anon = 0 nas funções de escrita, upsert rejeita URL inválida, sugerir vai para fila (não publica), aprovar publica, dedup funciona, e leitura pública responde.
2. **Testes de segurança (sonda REST anon):** anon não faz upsert/delete/ingest/approve (42501); anon lê catálogo (200); authenticated não trunca settings.
3. **Teste de validação:** URLs maliciosas rejeitadas; URLs válidas aceitas.
4. **Regressão:** busca por nome/cidade/frequência intacta; `vite build` verde; player toca; catálogo mantém 1.564.
- **Entrega:** função selftest + relatório de homologação com evidências.

---

## Ordem recomendada (sem retrabalho)

**FASE 1 primeiro** (validação é pré-requisito de tudo) → **FASE 2** (fluxo de sugestão usa a validação da 1) → **FASE 3** (testa 1+2). Cada fase é uma migration aditiva + ajuste de front, commitada e testada isoladamente.

## Riscos / cuidados

- **Sessões paralelas ativas** no mesmo banco/arquivo (RadioMundial é editado por outra sessão) → reler antes de cada edição; commit por pathspec.
- **Não quebrar a leitura pública** do catálogo (o player depende dela).
- Mudanças são **aditivas**; o único comportamento que muda é o "adicionar rádio" (que hoje está quebrado de qualquer forma) → passa a ir para a fila.

## Decisões que preciso de você

1. **"Adicionar minha rádio" vai para APROVAÇÃO** (admin revisa antes de entrar no catálogo público) ou o ouvinte **publica direto**? (recomendo: aprovação — protege o catálogo compartilhado; o ouvinte ouve na hora de qualquer forma).
2. **Criptografar as preferências** (`orion_audio_settings`)? (recomendo: não agora — não é PII, custo > benefício; só remover o TRUNCATE).
3. Manter o escopo **só no módulo de rádios**, sem tocar no Auth global do app? (recomendo: sim).
