# ORION-AI-61 — API (RPCs)

RPCs PostgREST: `POST .../rest/v1/rpc/<funcao>` (apikey + JWT). Guarda: funções de DADOS
= admin/service (anon negado: 42501); motor de cor = utilitário público (matemática pura).

## Motor de cor (público — sem dados)

| RPC | Descrição |
|---|---|
| `generate_palette(p_hex)` | paleta completa por teoria das cores: primária/secundária/terciária/complementar/tríade + gradiente + neutras + contraste WCAG + flags AA |
| `brand_contrast(a,b)` | razão de contraste WCAG entre 2 cores (preto/branco = 21) |
| `brand_rotate_hue(hex, graus)` | rotação de matiz HSL (180 = complementar) |
| `brand_luminance(hex)` | luminância relativa WCAG |
| `generate_typography(segmento, estilo)` | pareamento de fontes por segmento (título/texto/preço/campanha) |
| `brand_infer_style(segmento, categoria)` | estilo visual (premium/tecnológico/jovem/corporativo/moderno) |

## Dados / gestão (admin/service — anon 42501)

| RPC | Descrição |
|---|---|
| `brand_dashboard()` | payload do painel (overview + marcas + recomendações + série + config); ingere se vazio |
| `brand_overview()` | contadores + scores médios + por estilo |
| `brand_list()` | marcas com paleta (swatches) + fontes + scores |
| `brand_ingest()` | cria/atualiza perfis de marca dos dados reais + gera identidade (paleta/tipografia) |
| `brand_score(brand_id)` | Brand/Identity/Consistency Score da marca |
| `brand_consistency(brand_id, arte)` | valida uma arte (cores/fontes declaradas) → aprovado + violações |
| `brand_book(brand_id)` | Brand Book (JSON: marca/paleta/tipografia/logos/guidelines/aplicações) |
| `brand_snapshot_version(brand_id, motivo?)` | versiona o brand book (imutável) |
| `brand_export(brand_id, tipo?)` | solicita export (Brand Book PDF = Edge, registra pendente) |
| `brand_recommendations_view()` | recomendações abertas (Brand Advisor) |
| `brand_selftest()` | suíte de 9 testes (COMANDO TESTE) |
| `orion_brand_tick()` | cron `*/15` |

## Exemplo — `generate_palette` (motor real)

```json
POST /rest/v1/rpc/generate_palette  {"p_hex":"#2563EB"}
→ {"primaria":{"hex":"#2563EB","hsl":"hsl(221, 83%, 53%)","contraste_branco":5.17,"contraste_preto":4.06},
   "complementar":{"hex":"#EBAD25"}, "triade":["#EB2563","#63EB25"],
   "gradiente":"linear-gradient(135deg, #2563EB 0%, #EBAD25 100%)",
   "acessibilidade":{"primaria_texto_branco_AA":true,"primaria_texto_preto_AA":false}}
```

## Exemplo — `brand_consistency`

```json
POST /rest/v1/rpc/brand_consistency  {"p_brand": 1, "p_arte": {"cores":["#123456"], "fontes":["Comic Sans"]}}
→ {"aprovado": false, "cores_ok": false, "fontes_ok": false,
   "violacoes":[{"tipo":"cor_fora_da_paleta","valor":"#123456"},{"tipo":"fonte_fora_do_manual","valor":"Comic Sans"}]}
```
