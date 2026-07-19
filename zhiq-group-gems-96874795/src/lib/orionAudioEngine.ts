/**
 * ORION-AUDIO-01 — Motor de áudio do ORION Audio Center.
 *
 * DSP 100% no cliente (Web Audio API), nativo → resposta instantânea.
 * Grafo singleton v2 (sobrevive HMR via window):
 *   elemento → EQ 10 bandas → Smart Bass → Smart Treble → Smart Voice
 *            → Volume Boost → Limiter (guarda anti-distorção, SEMPRE ativo)
 *            → Analyser → saída
 * O "ORION AI SOUND" é análise espectral determinística (evidência real:
 * energia por faixa), NUNCA inventa — segue a convenção ORION. Não usa LLM.
 */

// ── Bandas ───────────────────────────────────────────────────────────────────
export const EQ10_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ10_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
// Modo simples: 5 grupos de 2 bandas
export const EQ5_GROUPS: { label: string; idx: number[] }[] = [
  { label: 'Graves',       idx: [0, 1] },
  { label: 'Méd. Grave',   idx: [2, 3] },
  { label: 'Médios',       idx: [4, 5] },
  { label: 'Méd. Agudo',   idx: [6, 7] },
  { label: 'Agudos',       idx: [8, 9] },
];
export const EQ_MIN = -12;
export const EQ_MAX = 12;

// ── Presets oficiais (10 bandas, dB) ─────────────────────────────────────────
export const ORION_PRESETS: Record<string, number[]> = {
  'Flat':         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Pop':          [-1, 1, 3, 4, 2, 0, 1, 2, 3, 2],
  'Rock':         [4, 3, 1, -1, -2, 1, 3, 4, 3, 3],
  'Hip Hop':      [6, 5, 3, 1, -1, 0, 1, 2, 2, 1],
  'Dance':        [6, 5, 2, 0, -1, 0, 2, 4, 4, 3],
  'Jazz':         [2, 1, 0, 1, 2, 2, 1, 1, 2, 3],
  'Clássica':     [2, 1, 0, 0, 0, 0, -1, 1, 2, 3],
  'Eletrônica':   [6, 5, 3, 0, -2, 0, 2, 3, 5, 5],
  'Podcast':      [-5, -3, -1, 1, 3, 4, 4, 3, 1, -1],
  'Rádio':        [-3, -1, 1, 2, 3, 3, 2, 0, -2, -4],
  'Filme':        [3, 2, 1, 0, 1, 2, 2, 3, 2, 2],
  'Carro':        [5, 4, 2, 0, -1, 0, 1, 3, 4, 3],
  'Bluetooth':    [3, 2, 1, 0, 0, 1, 1, 2, 3, 3],
  'Caixa de Som': [4, 3, 1, 0, -1, 0, 1, 2, 3, 2],
};

// ── Perfis de dispositivo ────────────────────────────────────────────────────
export type DeviceProfile = 'auto' | 'fone' | 'bluetooth' | 'speaker' | 'carro';
export const DEVICE_META: Record<DeviceProfile, { label: string; preset: string | null }> = {
  auto:      { label: 'Auto',        preset: null },
  fone:      { label: 'Fone',        preset: 'Flat' },
  bluetooth: { label: 'Bluetooth',   preset: 'Bluetooth' },
  speaker:   { label: 'Caixa de Som', preset: 'Caixa de Som' },
  carro:     { label: 'Carro',       preset: 'Carro' },
};

// ── Estado persistido (localStorage + sync na conta) ─────────────────────────
export interface Boosters { bass: boolean; treble: boolean; voice: boolean; loud: boolean }
export interface AudioSettings {
  volume: number;
  muted: boolean;
  eqEnabled: boolean;
  eqMode: 'simple' | 'pro';
  eq10: number[];
  eqPreset: string | null;
  boosters: Boosters;
  aiSound: boolean;
  experience: boolean;          // ORION SOUND EXPERIENCE (modo mestre)
  deviceProfile: DeviceProfile;
}

export const AUDIO_STORAGE_KEY = 'global_audio_settings';
const DEFAULT_VOLUME = 0.03;

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  volume: DEFAULT_VOLUME,
  muted: false,
  eqEnabled: true,
  eqMode: 'simple',
  eq10: [...ORION_PRESETS['Flat']],
  eqPreset: 'Flat',
  boosters: { bass: false, treble: false, voice: false, loud: false },
  aiSound: false,
  experience: false,
  deviceProfile: 'auto',
};

export function loadAudioSettings(): AudioSettings {
  try {
    const saved = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      // migração v1 (eq de 5 bandas) → v2 (eq10): duplica cada banda no par
      let eq10 = Array.isArray(p.eq10) && p.eq10.length === 10 && p.eq10.every((n: unknown) => typeof n === 'number')
        ? p.eq10 as number[]
        : null;
      if (!eq10 && Array.isArray(p.eq) && p.eq.length === 5) {
        eq10 = (p.eq as number[]).flatMap(v => [v, v]);
      }
      return {
        ...DEFAULT_AUDIO_SETTINGS,
        volume: typeof p.volume === 'number' ? p.volume : DEFAULT_VOLUME,
        muted: p.muted === true,
        eqEnabled: p.eqEnabled !== false,
        eqMode: p.eqMode === 'pro' ? 'pro' : 'simple',
        eq10: eq10 ?? [...ORION_PRESETS['Flat']],
        eqPreset: typeof p.eqPreset === 'string' ? p.eqPreset : (p.eqPreset === null ? null : 'Flat'),
        boosters: { ...DEFAULT_AUDIO_SETTINGS.boosters, ...(p.boosters || {}) },
        aiSound: p.aiSound === true,
        experience: p.experience === true,
        deviceProfile: (['auto', 'fone', 'bluetooth', 'speaker', 'carro'] as const).includes(p.deviceProfile)
          ? p.deviceProfile : 'auto',
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_AUDIO_SETTINGS, eq10: [...ORION_PRESETS['Flat']] };
}

export function saveAudioSettings(s: AudioSettings) {
  try { localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ── Grafo singleton v2 ───────────────────────────────────────────────────────
export interface OrionAudioGraph {
  version: 2;
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  eq: BiquadFilterNode[];
  bass: BiquadFilterNode;
  treble: BiquadFilterNode;
  voice: BiquadFilterNode;
  boost: GainNode;
  comp: DynamicsCompressorNode;
  analyser: AnalyserNode;
}

declare global {
  interface Window {
    // createMediaElementSource só pode ser chamado UMA vez por elemento
    __viagg_audio_graph__: OrionAudioGraph | { ctx: AudioContext; source: MediaElementAudioSourceNode; filters?: BiquadFilterNode[]; analyser?: AnalyserNode } | undefined;
  }
}

export function getOrionGraph(): OrionAudioGraph | null {
  const g = window.__viagg_audio_graph__ as OrionAudioGraph | undefined;
  return g && g.version === 2 ? g : null;
}

/**
 * Constrói (ou faz upgrade v1→v2 de) o grafo. DEVE ser chamado dentro de um
 * gesto do usuário: AudioContext fora de gesto nasce "suspended" e, como o
 * grafo captura o elemento, a música sairia MUDA.
 */
export function ensureOrionGraph(): OrionAudioGraph | null {
  const existing = window.__viagg_audio_graph__ as OrionAudioGraph | { ctx: AudioContext; source: MediaElementAudioSourceNode } | undefined;
  if (existing && (existing as OrionAudioGraph).version === 2) {
    const g = existing as OrionAudioGraph;
    if (g.ctx.state === 'suspended') g.ctx.resume().catch(() => { /* ignore */ });
    return g;
  }

  const audio = window.__viagg_audio__ as HTMLAudioElement | undefined;
  if (!audio) return null;

  try {
    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;

    // Elemento carregado sem CORS entraria mudo no grafo → recarrega com CORS
    if (audio.crossOrigin !== 'anonymous') {
      const pos = audio.currentTime;
      const wasPlaying = !audio.paused;
      audio.crossOrigin = 'anonymous';
      audio.load();
      audio.addEventListener('loadedmetadata', () => {
        audio.currentTime = pos;
        if (wasPlaying) audio.play().catch(() => { /* ignore */ });
      }, { once: true });
    }

    // Upgrade v1: reusa ctx + source (impossível recriar o source) e reconstrói a cadeia
    let ctx: AudioContext;
    let source: MediaElementAudioSourceNode;
    if (existing?.ctx && existing?.source) {
      ctx = existing.ctx;
      source = existing.source;
      try { source.disconnect(); } catch { /* ignore */ }
    } else {
      ctx = new Ctx();
      source = ctx.createMediaElementSource(audio);
    }

    const eq = EQ10_FREQS.map((freq, i) => {
      const f = ctx.createBiquadFilter();
      f.type = i === 0 ? 'lowshelf' : i === EQ10_FREQS.length - 1 ? 'highshelf' : 'peaking';
      f.frequency.value = freq;
      if (f.type === 'peaking') f.Q.value = 1.1;
      f.gain.value = 0;
      return f;
    });

    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf'; bass.frequency.value = 90; bass.gain.value = 0;
    const treble = ctx.createBiquadFilter();
    treble.type = 'highshelf'; treble.frequency.value = 9000; treble.gain.value = 0;
    const voice = ctx.createBiquadFilter();
    voice.type = 'peaking'; voice.frequency.value = 1800; voice.Q.value = 0.9; voice.gain.value = 0;

    const boost = ctx.createGain();
    boost.gain.value = 1;

    // Limiter SEMPRE ativo — é a garantia "sem distorção" dos boosters
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6; comp.knee.value = 8; comp.ratio.value = 12;
    comp.attack.value = 0.003; comp.release.value = 0.25;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;               // resolução p/ análise espectral do AI Sound
    analyser.smoothingTimeConstant = 0.8;

    let node: AudioNode = source;
    for (const f of eq) { node.connect(f); node = f; }
    node.connect(bass); bass.connect(treble); treble.connect(voice);
    voice.connect(boost); boost.connect(comp); comp.connect(analyser);
    analyser.connect(ctx.destination);

    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* ignore */ });

    const graph: OrionAudioGraph = { version: 2, ctx, source, eq, bass, treble, voice, boost, comp, analyser };
    window.__viagg_audio_graph__ = graph;
    return graph;
  } catch (err) {
    console.warn('[OrionAudio] grafo indisponível:', err);
    return null;
  }
}

// ── Aplicação de EQ / boosters ───────────────────────────────────────────────
export function applyEq(eq10: number[], enabled: boolean) {
  const g = getOrionGraph();
  if (!g) return;
  g.eq.forEach((f, i) => {
    f.gain.setTargetAtTime(enabled ? (eq10[i] ?? 0) : 0, g.ctx.currentTime, 0.05);
  });
}

export function applyBoosters(b: Boosters) {
  const g = getOrionGraph();
  if (!g) return;
  const t = g.ctx.currentTime;
  g.bass.gain.setTargetAtTime(b.bass ? 6 : 0, t, 0.05);
  g.treble.gain.setTargetAtTime(b.treble ? 5 : 0, t, 0.05);
  g.voice.gain.setTargetAtTime(b.voice ? 5 : 0, t, 0.05);
  g.boost.gain.setTargetAtTime(b.loud ? 1.55 : 1, t, 0.05);
}

/** Redução atual do limiter em dB (negativo = guarda anti-distorção atuando). */
export function limiterReduction(): number {
  const g = getOrionGraph();
  return g ? g.comp.reduction : 0;
}

// Modo simples: valor do grupo = média das bandas; edição aplica nos pares
export function eq5From10(eq10: number[]): number[] {
  return EQ5_GROUPS.map(gr => Math.round(gr.idx.reduce((s, i) => s + (eq10[i] ?? 0), 0) / gr.idx.length));
}
export function setGroupIn10(eq10: number[], group: number, value: number): number[] {
  const next = [...eq10];
  for (const i of EQ5_GROUPS[group].idx) next[i] = value;
  return next;
}

// ── ORION AI SOUND — classificador espectral (evidência real, sem LLM) ───────
export interface AiReading {
  perfil: 'Voz & Podcast' | 'Eletrônica' | 'Rock' | 'Rádio/Ruído' | 'Equilíbrio';
  confianca: number;                       // 0-100
  energias: { graves: number; medios: number; presenca: number; agudos: number };
}

const AI_TARGETS: Record<AiReading['perfil'], number[]> = {
  'Voz & Podcast': [-4, -3, -1, 1, 2, 3, 4, 3, 1, 0],
  'Eletrônica':    [5, 4, 2, 0, -1, 0, 1, 2, 3, 4],
  'Rock':          [3, 2, 0, -1, 1, 2, 3, 3, 2, 2],
  'Rádio/Ruído':   [-2, 0, 1, 2, 2, 2, 1, -1, -3, -5],
  'Equilíbrio':    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

function bandEnergy(data: Uint8Array, binHz: number, lo: number, hi: number): number {
  const a = Math.max(0, Math.floor(lo / binHz));
  const b = Math.min(data.length - 1, Math.ceil(hi / binHz));
  let sum = 0;
  for (let i = a; i <= b; i++) sum += data[i];
  return sum;
}

export function analyzeSpectrum(): AiReading | null {
  const g = getOrionGraph();
  if (!g) return null;
  const data = new Uint8Array(g.analyser.frequencyBinCount);
  g.analyser.getByteFrequencyData(data);
  const binHz = g.ctx.sampleRate / g.analyser.fftSize;

  const bass = bandEnergy(data, binHz, 20, 250);
  const mid = bandEnergy(data, binHz, 250, 2500);
  const presence = bandEnergy(data, binHz, 2500, 6000);
  const treble = bandEnergy(data, binHz, 6000, 16000);
  const total = bass + mid + presence + treble;
  if (total < 800) return null;            // silêncio / sinal insuficiente → não opina

  const r = { bass: bass / total, mid: mid / total, presence: presence / total, treble: treble / total };

  // "flatness" aproximada p/ detectar ruído de banda larga (chiado de rádio)
  let logSum = 0, linSum = 0, n = 0;
  for (let i = 2; i < data.length; i += 4) { const v = data[i] + 1; logSum += Math.log(v); linSum += v; n++; }
  const flatness = Math.exp(logSum / n) / (linSum / n);

  let perfil: AiReading['perfil'];
  let confianca: number;
  if (r.mid + r.presence > 0.62 && r.bass < 0.18) {
    perfil = 'Voz & Podcast'; confianca = Math.round(55 + (r.mid + r.presence - 0.62) * 100);
  } else if (r.bass > 0.42 && r.treble > 0.10) {
    perfil = 'Eletrônica'; confianca = Math.round(55 + (r.bass - 0.42) * 120);
  } else if (flatness > 0.62) {
    perfil = 'Rádio/Ruído'; confianca = Math.round(50 + (flatness - 0.62) * 100);
  } else if (r.presence > 0.20 && r.bass < 0.38) {
    perfil = 'Rock'; confianca = Math.round(50 + (r.presence - 0.20) * 150);
  } else {
    perfil = 'Equilíbrio'; confianca = 50;
  }

  return {
    perfil,
    confianca: Math.max(40, Math.min(95, confianca)),
    energias: {
      graves: Math.round(r.bass * 100),
      medios: Math.round(r.mid * 100),
      presenca: Math.round(r.presence * 100),
      agudos: Math.round(r.treble * 100),
    },
  };
}

/**
 * Loop do AI Sound: analisa a cada 1.5s, exige 2 leituras iguais consecutivas
 * (estabilidade) e rampa o EQ suavemente para o alvo do perfil detectado.
 * Retorna função de parada.
 */
export function startAiSound(onUpdate: (r: AiReading | null) => void): () => void {
  let last: AiReading['perfil'] | null = null;
  let stable: AiReading['perfil'] | null = null;
  const timer = setInterval(() => {
    const g = getOrionGraph();
    if (!g) return;
    const r = analyzeSpectrum();
    onUpdate(r);
    if (!r) return;
    if (r.perfil === last && r.perfil !== stable) {
      stable = r.perfil;
      const target = AI_TARGETS[r.perfil];
      g.eq.forEach((f, i) => f.gain.setTargetAtTime(target[i], g.ctx.currentTime, 1.0));
    }
    last = r.perfil;
  }, 1500);
  return () => clearInterval(timer);
}

// Curvas oferecidas ao fim do Teste de Som ("Qual perfil você prefere?")
export const TEST_RESULT_CURVES: Record<string, { label: string; eq10: number[] }> = {
  graves:      { label: 'Graves fortes',   eq10: [5, 4, 2, 0, 0, 0, 0, 1, 2, 2] },
  equilibrado: { label: 'Equilibrado',     eq10: [1, 1, 0, 0, 0, 0, 0, 0, 1, 1] },
  brilho:      { label: 'Mais brilho',     eq10: [0, 0, 0, 0, 0, 1, 2, 3, 4, 4] },
  voz:         { label: 'Voz clara',       eq10: [-3, -2, 0, 1, 3, 4, 3, 2, 1, 0] },
};

// ── Teste de Som ─────────────────────────────────────────────────────────────
export interface SoundTestStep { id: string; label: string }
export const SOUND_TEST_STEPS: SoundTestStep[] = [
  { id: 'graves',   label: 'Graves (31–120 Hz)' },
  { id: 'medios',   label: 'Médios (400–1.2k Hz)' },
  { id: 'agudos',   label: 'Agudos (5.5–11k Hz)' },
  { id: 'stereo',   label: 'Estéreo (esquerda → direita)' },
  { id: 'voz_m',    label: 'Voz masculina' },
  { id: 'voz_f',    label: 'Voz feminina' },
];

function playTone(g: OrionAudioGraph, fromHz: number, toHz: number, seconds: number, pan: number | null): Promise<void> {
  return new Promise(resolve => {
    const ctx = g.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(fromHz, ctx.currentTime);
    if (toHz !== fromHz) osc.frequency.exponentialRampToValueAtTime(toHz, ctx.currentTime + seconds);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
    let out: AudioNode = gain;
    if (pan !== null && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      gain.connect(p);
      out = p;
    }
    // injeta APÓS o EQ (testa o sistema, não a curva) mas passa pelo limiter + analyser
    osc.connect(gain);
    out.connect(g.boost);
    osc.start();
    osc.stop(ctx.currentTime + seconds + 0.05);
    osc.onended = () => { try { out.disconnect(); } catch { /* ignore */ } resolve(); };
  });
}

function speak(text: string, pitch: number): Promise<void> {
  return new Promise(resolve => {
    try {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang?.toLowerCase().startsWith('pt'));
      if (ptVoice) u.voice = ptVoice;
      u.lang = 'pt-BR';
      u.pitch = pitch;
      u.rate = 1;
      const done = () => resolve();
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
      setTimeout(done, 6000);              // fallback: nunca trava o teste
    } catch { resolve(); }
  });
}

/** Executa a sequência completa do teste; chama onStep a cada etapa. */
export async function runSoundTest(onStep: (step: SoundTestStep, index: number) => void, isCancelled: () => boolean): Promise<void> {
  const g = ensureOrionGraph();
  if (!g) return;
  for (let i = 0; i < SOUND_TEST_STEPS.length; i++) {
    if (isCancelled()) return;
    const step = SOUND_TEST_STEPS[i];
    onStep(step, i);
    switch (step.id) {
      case 'graves': await playTone(g, 31, 120, 2.2, null); break;
      case 'medios': await playTone(g, 400, 1200, 2.0, null); break;
      case 'agudos': await playTone(g, 5500, 11000, 2.0, null); break;
      case 'stereo':
        await playTone(g, 440, 440, 1.1, -1);
        if (!isCancelled()) await playTone(g, 440, 440, 1.1, 1);
        break;
      case 'voz_m': await speak('Esta é uma voz masculina para teste de áudio. Um, dois, três.', 0.65); break;
      case 'voz_f': await speak('Esta é uma voz feminina para teste de áudio. Um, dois, três.', 1.35); break;
    }
  }
}

// ── Detecção de dispositivo (melhor esforço, DECLARADA) ─────────────────────
export async function detectDeviceProfile(): Promise<DeviceProfile | null> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return null;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outs = devices.filter(d => d.kind === 'audiooutput' && d.label);
    if (!outs.length) return null;         // sem permissão de mídia o navegador oculta labels
    const labels = outs.map(o => o.label.toLowerCase()).join(' | ');
    if (/bluetooth|airpod|buds|wh-|wf-|jbl|headset/.test(labels)) return 'bluetooth';
    if (/headphone|fone|earphone/.test(labels)) return 'fone';
    if (/car|android auto|carplay/.test(labels)) return 'carro';
    if (/speaker|alto/.test(labels)) return 'speaker';
    return null;
  } catch { return null; }
}
