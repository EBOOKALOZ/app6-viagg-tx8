# ORION Sound System — Fases 1, 2 e 3 · Relatório Final

> **Data:** 2026-07-19 · **Escopo:** só o módulo de rádios (`orion_audio_*`). **Nenhuma alteração no Auth global.**
> Cada fase: implementada → testada → commitada, antes da seguinte.

---

## Arquivos modificados / criados

| Arquivo | Fase | Papel |
|---|---|---|
| `migrations/20260719_orion_sound_fase1_hardening.sql` | 1 | validação URL + sanitização + menor privilégio |
| `migrations/20260719_orion_sound_fase2_sugerir.sql` | 2 | RPC `audio_radio_sugerir` + coluna `sugerido_por`/`origem` + policy |
| `migrations/20260719_orion_sound_fase3_selftest.sql` | 3 | `orion_sound_system_selftest()` |
| `src/components/orion/RadioMundial.tsx` | 2 | `addMyRadio` → sugerir (toca já, envia p/ aprovação) |
| `src/pages/admin/AdminOrionAudio.tsx` | 2 | fila de revisão: botão **▶ Ouvir** + selo "sugestão de ouvinte" |

**Commits:** FASE 1 `7de7b56` · FASE 2 `babcc2e` · FASE 3 `c466716`.

---

## FASE 1 — Hardening de segurança

**Funções criadas:**
- `audio_url_valida(text)`: aceita só `http(s)://` válido; **bloqueia** `javascript:`, `data:`, `file:`, `blob:`, `vbscript:`, `ftp:`, espaços/aspas/tags, tamanho 8–2048.
- `audio_sanitize_txt(text,max)`: remove `<...>` (tags/script), caracteres de controle, corta tamanho.

**Integração:** `audio_radio_curated_upsert` agora valida a URL e sanitiza todos os campos (gate admin **preservado**).

**Menor privilégio:** REVOKE `TRUNCATE/REFERENCES/TRIGGER` de anon+authenticated em **todas** as 8 tabelas; catálogo/queue/stations/plays/sync_log = **0 DML direto** de cliente (só via RPC DEFINER); settings/presets/events mantêm DML (RLS por `user_id` filtra) mas sem TRUNCATE.

**Evidências:** https/http ✅ aceitos; javascript/data/file/ftp/vazio ✅ rejeitados; `<script>` ✅ removido; TRUNCATE cliente = **0**; DML cliente no catálogo = **0**.

## FASE 2 — Novo fluxo "Sugerir Rádio"

**Regra cumprida:** rádio de usuário **NUNCA** entra direto no catálogo público.

**Fluxo:** usuário preenche → `audio_radio_sugerir` valida (FASE 1) → grava na **fila** (`orion_audio_radio_queue`, `status='pending'`, `origem='ouvinte'`, `sugerido_por`) → **usuário ouve na hora** (custom station local) → admin vê pendência → **admin aprova** (`audio_queue_approve` move para catálogo) ou rejeita.

**Anti-flood:** (1) já-no-catálogo → não sugere; (2) duplicada na fila → não duplica; (3) máx **5 pendentes** por usuário + **15/dia**.

**Banco:** `sugerido_por uuid` + `origem text`; policy `audio_queue_own_or_admin` (usuário vê as próprias sugestões, admin vê todas).

**Painel admin:** fila com **▶ Ouvir** (testar stream antes de aprovar), Aprovar, Rejeitar, selo "SUGESTÃO DE OUVINTE", confiança, cobertura por região.

**Evidências:** sugerir → fila `pending` (categoria/UF classificadas); **NÃO** no catálogo (0); URL maliciosa rejeitada; duplicada detectada; anon 42501; approve → catálogo (+1); depois limpo.

## FASE 3 — Selftest & testes de segurança

**`orion_sound_system_selftest()`** (admin/service; anon negado) — **14/14 APROVADO**:
1 RLS nas 8 tabelas · 2 cliente sem DML no catálogo · 3 TRUNCATE bloqueado · 4 escrita/sugestão negada a anon · 5 validação URL · 6 sanitização · 7 classificador · 8 sugestão→pending · 9 **NÃO publica automático** · 10 approve publica · 11 reject · 12 busca pública · 13 sem duplicata · 14 limpeza (produção intacta).

**Testes REST (anon/auth/admin):**
| Ação | anon | resultado |
|---|---|---|
| publicar direto (upsert) | ❌ | 42501 BLOQUEADO |
| sugerir | ❌ | 42501 BLOQUEADO |
| aprovar | ❌ | 42501 BLOQUEADO |
| ler catálogo (search) | ✅ | PERMITIDO |
| selftest | ❌ | 42501 BLOQUEADO |

Confirma: **somente admin publica**; usuário comum **sugere** (via fila); anon **só lê**.

---

## Critérios obrigatórios — atendidos

- ✅ Nenhuma rádio sugerida entra direto no catálogo público.
- ✅ Toda sugestão passa por aprovação administrativa.
- ✅ Usuário ouve imediatamente, mas fica privada até aprovação.
- ✅ Sem regressão (busca/player/leitura pública intactos; `vite build` verde).
- ✅ Compatível com o ecossistema ORION (padrão selftest, RLS, menor privilégio, gate admin).

## Pendências / observações

- 🟡 **Uma rádio "Navegantes Fm" foi cadastrada com a URL do SITE** (`https://www.navegantesfm.com.br/`), não do stream de áudio — por isso não toca. É preciso o link do stream real (o "ouça ao vivo"). Não removida (dado do usuário); recomenda-se corrigir a `stream_url` ou remover.
- 🟢 Validação da URL agora **rejeita** cadastro de site sem áudio? Parcial: aceita qualquer `http(s)://` válido (não dá para saber pelo URL se é stream ou página). O teste real é tocar — o front já avisa "parece o site, não o stream" quando o play falha.

---

# ORION Sound System — Fases 1, 2 e 3 implementadas, auditadas, testadas e prontas para produção.
