# ORION-AI-63 — Creative Layout AI · API

> Superfície pública (admin). Todas exigem `mp_is_admin()` (ou postgres/service_role).
> `REVOKE EXECUTE FROM PUBLIC,anon` aplicado a todas as `clay_*` (lição AI-61).
> Spec pedia `create_layout/...` → expostas com prefixo `clay_*`.

## Mapa spec → RPC do AI-63

| RPC da spec | RPC do AI-63 | Retorno |
|---|---|---|
| `create_layout()`     | `clay_create(p_brief jsonb, p_formato text, p_brand_id bigint, p_objetivo text, p_template_id bigint)` | cria + gera + preview |
| `generate_layout()`   | `clay_regenerate(p_layout bigint)` | regenera composição |
| `optimize_layout()`   | `clay_optimize(p_layout bigint)`   | reforça núcleos de conversão + regenera |
| `layout_preview()`    | `clay_preview(p_layout bigint)`    | render spec (canvas + elementos) + score + validação |
| `layout_score()`      | `clay_score(p_layout bigint)`      | Layout Score + breakdown |
| `layout_dashboard()`  | `clay_dashboard()`                 | **fonte única do painel** |
| `layout_history()`    | `clay_history(p_layout bigint)`    | trilha/eventos |
| `layout_export()`     | `clay_export(p_layout bigint, p_formato_saida text)` | registra export (PNG/PDF = Edge) |
| `layout_validation()` | `clay_validate(p_layout bigint)`   | acessibilidade (WCAG/fonte/toque/sobreposição) |
| `layout_components()` | `clay_components()`                | catálogo de componentes/roles |
| `responsive_layout()` | `clay_responsive(p_layout bigint, p_formatos text[])` | variantes por formato |

## Internos (service_role; render/motor)

`clay_generate` (motor) · `clay_slots(familia)` · `clay_familia(aspecto)` · `clay_place(...)` ·
`clay_pick_template(segmento,objetivo,formato)` (reusa AI-62) · `clay_score_compute` ·
`clay_validate_compute` · `clay_preview_build` · `clay_metrics_rollup` · `clay_learn` ·
`orion_creative_layout_tick()` (cron `*/30`) · `clay_selftest()` (COMANDO TESTE).

## Exemplos

```sql
-- COMANDO TESTE (14 provas)
SELECT public.clay_selftest();

-- Criar um layout (template escolhido automaticamente pela AI-62)
SELECT public.clay_create(
  jsonb_build_object('produto','Pacote Serra 5 dias','preco','1.499','descricao','Hotel + passeios',
                     'oferta','-25%','whatsapp','(65) 99999-0000','empresa','Viagg Turismo',
                     'segmento','turismo','logo','logo.png','imagem','serra.jpg'),
  'ig_feed', NULL, 'promocao', NULL);

-- Preview / score / validação de um layout
SELECT public.clay_preview(3);
SELECT public.clay_score(3);
SELECT public.clay_validate(3);

-- Variantes responsivas
SELECT public.clay_responsive(3, ARRAY['ig_story','fb_feed']);

-- Otimizar (reforça CTA/selo) + exportar spec (PNG via Edge)
SELECT public.clay_optimize(3);
SELECT public.clay_export(3, 'png');
```

## Brief (campos reconhecidos)

`produto|titulo`, `subtitulo|descricao`, `preco`, `desconto|oferta`, `selo`, `cta`,
`whatsapp`, `telefone`, `social`, `estoque`, `localizacao|cidade`, `rodape|empresa`,
`logo`, `imagem`, `link|qrcode`, `segmento|categoria`, `campanha`. Campos ausentes:
núcleos (título/preço/CTA) recebem default; demais são omitidos (sem inventar dado).

## Render spec (saída de `clay_preview`)

```json
{ "layout": 3, "score": 100,
  "canvas": {"w":1080,"h":1350,"formato":"ig_feed","rede":"instagram","familia":"boxy"},
  "elementos": [ {"componente":"titulo","tipo":"texto","x":54,"y":810,"w":972,"h":101,"z":2,
                  "texto":"...","cor":"#111827","tipografia":{"font":"Montserrat","size":74,"fg":"#111827"}} ],
  "score_breakdown": {...}, "validacao": {...} }
```
