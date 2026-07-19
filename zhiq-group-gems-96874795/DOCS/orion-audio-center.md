# ORION-AUDIO-01 — Viagg-TX8 Audio Center v1.0 (powered by ORION)

**Data:** 2026-07-19 · **Chave de módulo:** `audio_center` · **Namespace DB:** `orion_audio_*`
**Migration:** `supabase/migrations/20260719_orion_audio_center.sql` (SQL Editor, broifhfqmnzqoongtokm)
**Painéis:** usuário = painel do player global (todas as páginas) · admin = `/admin/orion-audio` (badge AUDIO)

## O que é

Evolução do equalizador do player global para um **Centro Inteligente de Áudio**: volume,
EQ profissional (5/10 bandas), 14 presets oficiais + presets personalizados, boosters com
guarda anti-distorção, **AI Sound** (equalização automática por análise do conteúdo),
**Sound Experience** (modo mestre), visualizador em tempo real, teste de som guiado,
perfis por dispositivo e **sincronização na conta** do usuário.

## Arquitetura

### Cliente (DSP — resposta instantânea, zero rede)
- `src/lib/orionAudioEngine.ts` — motor Web Audio. Grafo singleton v2 (sobrevive HMR via `window.__viagg_audio_graph__`):
  `elemento → EQ 10 bandas (31…16k Hz) → Smart Bass → Smart Treble → Smart Voice → Volume Boost → Limiter (DynamicsCompressor, SEMPRE ativo) → Analyser (fft 1024) → saída`
- `src/components/orion/OrionAudioCenter.tsx` — painel (UI + orquestração + sync + telemetria).
- `src/components/GlobalAudioPlayer.tsx` — host: botão, portal, música de fundo; o painel renderiza o Audio Center.

**Armadilhas garantidas no código (não regredir):**
1. `crossOrigin='anonymous'` ANTES do `src` — sem CORS o grafo Web Audio sai MUDO.
2. Grafo criado SÓ dentro de gesto do usuário — `AudioContext` fora de gesto nasce `suspended` e silenciaria a música (listener one-shot de click/keydown + clique do botão).
3. `createMediaElementSource` é único por elemento — upgrade v1→v2 REUSA `ctx`+`source` e reconstrói a cadeia.

### Modo Simples ↔ Profissional
10 bandas são a verdade; o modo simples edita 5 grupos de 2 bandas
(Graves 31/62 · Méd. Grave 125/250 · Médios 500/1k · Méd. Agudo 2k/4k · Agudos 8k/16k).
Tudo salvo automaticamente (localStorage sempre; conta com debounce 1,5 s).

### ORION AI SOUND (honesto — sem LLM, sem custo, sem inventar)
Classificador espectral determinístico (a cada 1,5 s, com evidência exibida na UI):
energias por faixa (graves/médios/presença/agudos) + flatness aproximada →
`Voz & Podcast` (realça voz, corta rumble) · `Eletrônica` (reforça graves) · `Rock` (médios/presença)
· `Rádio/Ruído` (atenua extremos/chiado) · `Equilíbrio`. Exige 2 leituras iguais antes de trocar
o alvo e rampa suave (`setTargetAtTime`). Silêncio/sinal insuficiente → **não opina** (declarado).

### ORION SOUND EXPERIENCE
Modo mestre: liga a AI Sound, coloca dispositivo em Auto e gerencia os boosters conforme o
perfil detectado (voz → Smart Voice; eletrônica → Smart Bass). O limiter final garante “sem distorção”.

### Boosters
Smart Bass (+6 dB lowshelf 90 Hz) · Smart Treble (+5 dB highshelf 9 kHz) · Smart Voice (+5 dB peaking 1,8 kHz)
· Volume Boost (ganho 1,55×). O **limiter** (threshold −6 dB, ratio 12) fica sempre na cadeia;
acionamentos fortes (< −6 dB de redução) geram evento `distortion_guard` (proxy de qualidade — declarado).

### Teste de Som
Sequência automática: graves (31–120 Hz) → médios (400–1,2 kHz) → agudos (5,5–11 kHz) → estéreo (L→R)
→ voz masculina → voz feminina (SpeechSynthesis pt-BR; pitch 0.65/1.35 — declarado: depende das vozes do aparelho).
Ao final: “Qual perfil de som você prefere?” → cria e salva o preset **“Meu Som · <escolha>”** (origem `teste_som`).

### Perfis de dispositivo
Manual: Auto · Fone · Bluetooth · Caixa de Som · Carro (cada um aplica preset mapeado).
Detecção automática = **melhor esforço declarado** (`enumerateDevices`; labels exigem permissão de mídia).
Android Auto/CarPlay: preparado via perfil "Carro" — integração nativa é app móvel (fora do escopo web, declarado).

## Banco (RLS por usuário — isolamento total)

| Objeto | Papel |
|---|---|
| `orion_audio_settings` | 1 linha/usuário (`config` jsonb) — sincronização entre aparelhos (volume/mute ficam locais) |
| `orion_audio_presets` | presets personalizados (`origem`: manual/teste_som/ai/importado; UNIQUE user+nome) |
| `orion_audio_events` | telemetria leve (preset_apply, ai_on/off, uso 5 min, teste_som, distortion_guard, panel_open) |
| `orion_audio_admin_stats()` | agregados p/ admin — SECURITY DEFINER **gated `mp_is_admin()`**, `REVOKE FROM PUBLIC,anon` |

Backup automático = as tabelas entram no backup padrão do projeto (walg). Sem PII além do user_id.

## Sincronização
Login → carrega config + presets da conta (server vence p/ EQ/IA/dispositivo; volume é local por aparelho,
preservando o padrão 3% do player). Alterações → upsert com debounce. Sem conta → 100% funcional em localStorage.

## Configurações
Resetar (volta ao padrão) · Exportar (.json) · Importar (.json ou código `ORIONEQ:` base64) · Compartilhar (copia código).

## Performance
Todo o DSP é nativo (BiquadFilter/Compressor) — custo ~zero, sem travamentos; UI a 60 fps via rAF só com painel aberto;
análise da IA 1 leitura/1,5 s; telemetria fire-and-forget; saves com debounce.

## Compatibilidade
Web Audio API: Chrome/Edge/Firefox/Safari (desktop e mobile), inclusive WebView Android/iOS.
`StereoPanner` e `SpeechSynthesis` têm fallback silencioso onde faltarem.

## Homologação (critérios de aceitação)
- [x] Interface premium (tema do app, logo oficial pulsando com o áudio, responsiva ≤94vw)
- [x] EQ profissional 5/10 bandas com auto-save
- [x] 14 presets + personalizados (criar/excluir/exportar/importar/compartilhar)
- [x] IA de otimização (AI Sound com evidência; nunca inventa; declara silêncio)
- [x] Visualizador em tempo real (LED 20×10, peak-hold, sincronizado)
- [x] Teste de som completo + preset automático da preferência
- [x] Perfis por dispositivo (manual sempre; detecção best-effort declarada)
- [x] Sincronização por conta + isolamento RLS + fallback local
- [x] Painel administrativo `/admin/orion-audio` com `_auditoria` e lacunas declaradas
- [x] Sem distorção (limiter permanente + telemetria de guarda)
- [ ] Migration aplicada no banco vivo (usuário → SQL Editor)
- [ ] Teste e2e no navegador (música + painel + sync com login)

## Lacunas declaradas (v1)
- Qualidade do áudio no admin = proxy (guarda anti-distorção), sem medição acústica real.
- Detecção de dispositivo depende de labels do navegador (permissão de mídia).
- Vozes do teste dependem do SpeechSynthesis do aparelho.
- Preset "ai" por aprendizado de longo prazo (perfil que aprende gosto do usuário) — v2: hoje o aprendizado
  é imediato (teste de som → preset; AI Sound → adaptação em tempo real), sem modelo persistente por usuário.
