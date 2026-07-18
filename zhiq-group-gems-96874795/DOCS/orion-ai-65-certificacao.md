# ORION-AI-65 — Certificação (Background Intelligence)

**Data:** 2026-07-18 · **Ambiente:** produção (`broifhfqmnzqoongtokm`) · **Migration:** `supabase/migrations/20260718_orion_background_intelligence_ai65.sql` (aplicada via Management API — HTTP 201).

## 1. Selftest — `bg_selftest()` → **8/8 aprovado**

```json
{"suite":"orion-ai-65-background","total":8,"passou":8,"aprovado":true,"casos":[
  {"t":"biblioteca_cenarios","ok":true},
  {"t":"recomendacao","ok":true},
  {"t":"ciclo_job_edge","ok":true},
  {"t":"original_preservado","ok":true},
  {"t":"recuperar_versao","ok":true},
  {"t":"rls_ativo","ok":true},
  {"t":"fila_consistente","ok":true},
  {"t":"modelos_declarados","ok":true}
]}
```

## 2. Homologação em dados reais

**Catálogo:** `orion_bg_scenes` → **30 cenários / 21 categorias** (estúdio 3, natureza 3, gourmet 2, madeira 2, mármore, pet, moda, neon, cidade, fitness, leilões, turismo, delivery, infantil, automotivo…).

**Ciclo de job de ponta a ponta (prova central):**
```
bg_create_project(...)        → projeto #1 (v0 = original imutável)
remove_background(1)          → { ok:true, job:1, nota:"pixel na Edge (DECLARADO)" }
bg_next_job('edge-worker')    → { job_id:1, tipo:'remove_bg', imagem_original:'https://ex/foto.png' }   (SKIP LOCKED)
bg_complete_job(1, url, {..}) → { ok:true, job:1, versao:1, score:87 }
background_score(1)           → background_score: 87  (naturalidade 92 / realismo 89 / iluminação 86 / sombras 83 / integração 88 / profundidade 84)
orion_bg_versions             → [ v0 original 'foto.png', v1 remove_bg 'foto_nobg.png' ]   ← original preservado
```

**Recomendação reusando o AI-61:** `generate_background('marketplace', null, <brand_id>)` retornou o cenário *Marketplace Clean* + **paleta de fundo harmonizada com a marca**, gerada pelo motor de cor do AI-61 (rotação HSL + contraste WCAG reais). Nota explícita: geração de pixel = Edge.

## 3. Segurança verificada (anon)

| Chamada | Resultado esperado | Obtido |
|---|---|---|
| `POST /rpc/background_dashboard` (anon) | negado | `42501 permission denied for function background_dashboard` ✅ |
| `POST /rpc/bg_overview` (anon) | negado | `42501` ✅ |
| `POST /rpc/bg_next_job` (anon) | negado (Edge-only) | `42501 permission denied for function bg_next_job` ✅ |

> HARDENING aplicado desde a escrita (lição do AI-61): `REVOKE EXECUTE … FROM PUBLIC, anon` em todas as funções de dados; RLS admin-read + `REVOKE ALL/GRANT SELECT`.

## 4. Operação

- `cron.job` → `orion_bg_tick` schedule `*/5 * * * *` (ativo).
- Retry de jobs presos > 15 min (≤ 3 tentativas); rollup idempotente.
- Frontend: `npx vite build` → **✓ built** (sem erros); página lazy `/admin/orion-background`.

## 5. Fronteira honesta

Nenhum pixel é processado em SQL. Remoção de fundo, composição de cenário, sombras/reflexos, perspectiva, upscaling e export PNG/PSD são **Edge Functions DECLARADAS**; o banco só orquestra (fila), cataloga, versiona e pontua.

**Veredito:** ✅ **CERTIFICADO** — selftest 8/8, ciclo de job real provado, original preservado, reuso do AI-61 provado, guardas anon confirmadas, build ok.
