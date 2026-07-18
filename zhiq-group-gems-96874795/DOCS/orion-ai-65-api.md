# ORION-AI-65 — API (Background Intelligence)

Namespace `orion_bg_*` · chave `background_intelligence`. Todas as funções são `SECURITY DEFINER` com guarda de admin; funções de dados têm `REVOKE EXECUTE … FROM PUBLIC, anon`.

## Projeto & versões

| Função | Assinatura | Retorno / efeito |
|---|---|---|
| `bg_create_project` | `(p_imagem text, p_ref_tipo text, p_ref_id text, p_categoria text, p_brand_id bigint, p_objeto text)` | cria projeto + **versão v0 = original imutável**; retorna `project_id` |
| `bg_restore_version` | `(p_project bigint, p_versao int)` | promove uma versão anterior a atual (original nunca se perde) |

## Ações (enfileiram — não processam pixel)

| Função | Assinatura | Job enfileirado |
|---|---|---|
| `remove_background` | `(p_project bigint)` | `remove_bg` |
| `replace_background` | `(p_project bigint, p_scene_id bigint)` | `replace_bg` |
| `apply_shadows` | `(p_project bigint)` | `shadows` |
| `apply_reflections` | `(p_project bigint)` | `reflections` |
| `correct_perspective` | `(p_project bigint)` | `perspective` |
| `export_background` | `(p_project bigint, p_formato text)` | `export` |
| `batch_background` | `(p_projects bigint[], p_tipo text)` | N jobs (lote) |
| `bg_enqueue` | `(p_project bigint, p_tipo text, p_params jsonb, p_prioridade int)` | primitivo de fila |

## Contrato Edge (exclusivo `service_role`)

| Função | Assinatura | Semântica |
|---|---|---|
| `bg_next_job` | `(p_worker text)` | reivindica o job pendente mais prioritário com `FOR UPDATE SKIP LOCKED`; marca `processando` |
| `bg_complete_job` | `(p_job bigint, p_resultado_url text, p_metrics jsonb, p_erro text)` | conclui/falha o job; em sucesso cria **nova versão** + grava **métricas** + calcula **Background Score** |

> anon/authenticated recebem negação (`42501` / guarda) nessas duas funções.

## Recomendação & score

| Função | Assinatura | Retorno |
|---|---|---|
| `generate_background` | `(p_categoria text, p_segmento text, p_brand_id bigint)` | cenários ranqueados + **paleta de fundo harmonizada com a marca** (reusa AI-61 `generate_palette` sobre `orion_brand_colors`) |
| `background_score` | `(p_project bigint)` | score consolidado + parcelas (naturalidade/realismo/iluminação/sombras/integração/profundidade) |

## Views / dashboard

| Objeto | Conteúdo |
|---|---|
| `bg_overview()` | contadores (projetos, cenários, jobs por estado, score médio, tempo médio, cenários por categoria) |
| `bg_scenes_view` | catálogo de cenários com paleta e uso |
| `bg_projects_view` | projetos com status, versões e score |
| `bg_jobs_view` | fila (por status, por tipo, recentes) |
| `background_dashboard()` | payload único do painel (`overview` + `cenarios` + `projetos` + `jobs` + `estatisticas_7d` + `config`) |

## Operação

| Função | Assinatura | Efeito |
|---|---|---|
| `orion_bg_tick` | `()` | cron `*/5`: devolve à fila jobs presos > 15 min (≤ 3 tentativas) + rollup |
| `bg_statistics_rollup` | `()` | consolida estatísticas diárias (idempotente) |
| `bg_selftest` | `()` | suíte **8/8**; ver certificação |

## Prompts (via Gateway)

`bg.scene_analysis`, `bg.recommend`, `bg.quality`, `bg.fidelity`, `bg.summary` — modelo preferido `gpt-5-mini`.

## Exemplo (ciclo completo)

```sql
-- 1) cria projeto (v0 = original)
select bg_create_project('https://ex/foto.png','produto','p1','marketplace',42,'tenis');  -- => 1
-- 2) enfileira remoção de fundo
select remove_background(1);
-- 3) a Edge reivindica
select bg_next_job('edge-worker');   -- => { job_id:1, tipo:'remove_bg', imagem_original:... }
-- 4) a Edge devolve resultado + métricas
select bg_complete_job(1,'https://ex/foto_nobg.png',
  '{"naturalidade":92,"realismo":89,"iluminacao":86,"sombras":83,"integracao":88,"profundidade":84}'::jsonb, null);
-- 5) score
select background_score(1);          -- => background_score: 87
```
