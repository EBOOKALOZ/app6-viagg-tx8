/**
 * ORION-AUDIO-01 + ORION-MEDIA-01 — Viagg-TX8 Centro Multimídia v2.0 (painel).
 *
 * Evolução do Audio Center: além do Centro Inteligente de Áudio (volume, EQ
 * 5/10 bandas, presets, boosters, ORION AI SOUND, visualizador LED, perfis por
 * dispositivo, sync na conta — TUDO preservado), o painel agora concentra
 * vídeo: abas EQ · Rádio · TV · Lives · Favoritos · Histórico. TV/Lives usam
 * o MultimediaMiniPlayer (16:9, LAZY — vídeo só carrega no clique "Assistir")
 * com canais de media_channels (admin: /admin/multimidia). Favoritos e
 * Histórico unificam rádio + vídeo. O DSP vive em src/lib/orionAudioEngine.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Volume1, Volume2, VolumeX, Sparkles, Wand2, SlidersHorizontal,
  Play, Loader2, RotateCcw, Download, Upload, Share2, Trash2, Save,
  Headphones, Bluetooth, Speaker, Car, CircleDot, Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import viaggLogo from '@/assets/logo.png';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  AudioSettings, AiReading, DeviceProfile, Boosters,
  EQ10_LABELS, EQ5_GROUPS, EQ_MIN, EQ_MAX, ORION_PRESETS, DEVICE_META,
  DEFAULT_AUDIO_SETTINGS, TEST_RESULT_CURVES, SOUND_TEST_STEPS, SoundTestStep,
  ensureOrionGraph, getOrionGraph, applyEq, applyBoosters, limiterReduction,
  eq5From10, setGroupIn10, startAiSound, runSoundTest, detectDeviceProfile,
} from '@/lib/orionAudioEngine';
import { RadioMundial } from './RadioMundial';
import { applyRadioEq, setRadioVolume } from '@/lib/radioPlayer';
import { MultimediaTV } from './MultimediaTV';
import type { MediaChannel } from '@/lib/multimedia/mediaCenter';
import { Tv, Clapperboard, Heart, History as HistoryIcon } from 'lucide-react';

interface CustomPreset { id: string; nome: string; bands: { eq10?: number[]; boosters?: Partial<Boosters> }; origem: string }

interface Props {
  settings: AudioSettings;
  setSettings: React.Dispatch<React.SetStateAction<AudioSettings>>;
  isPlaying: boolean;
  isOpen: boolean;
  onToggleMute: () => void;
  onVolumeChange: (value: number[]) => void;
}

const DEVICE_ICONS: Record<DeviceProfile, typeof Headphones> = {
  auto: CircleDot, fone: Headphones, bluetooth: Bluetooth, speaker: Speaker, carro: Car,
};

// Campos sincronizados na conta (volume/mute ficam locais por aparelho)
function pickSync(s: AudioSettings) {
  return {
    eqEnabled: s.eqEnabled, eqMode: s.eqMode, eq10: s.eq10, eqPreset: s.eqPreset,
    boosters: s.boosters, aiSound: s.aiSound, experience: s.experience, deviceProfile: s.deviceProfile,
  };
}

// ── Fader vertical (o Slider do projeto é só horizontal) ─────────────────────
function EqFader({ value, label, compact, onChange }: { value: number; label: string; compact?: boolean; onChange: (v: number) => void }) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const valueFromPointer = (clientY: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    if (rect.height === 0) return;
    const t = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    onChange(Math.round(EQ_MIN + t * (EQ_MAX - EQ_MIN)));
  };

  const percent = ((value - EQ_MIN) / (EQ_MAX - EQ_MIN)) * 100;
  const fillPct = (Math.abs(value) / EQ_MAX) * 50;

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <span className={cn('text-[9px] font-black tabular-nums leading-none', value === 0 ? 'text-zinc-500' : 'text-green-300')}>
        {value > 0 ? `+${value}` : value}
      </span>
      <div
        className={cn('relative touch-none cursor-pointer', compact ? 'h-20 w-5' : 'h-24 w-7')}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          valueFromPointer(e.clientY);
        }}
        onPointerMove={(e) => { if (dragging.current) valueFromPointer(e.clientY); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        role="slider"
        aria-label={`Banda ${label}`}
        aria-valuemin={EQ_MIN}
        aria-valuemax={EQ_MAX}
        aria-valuenow={value}
      >
        <div ref={railRef} className="absolute inset-x-0 top-2 bottom-2">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1.5 rounded-full bg-black/70 ring-1 ring-white/10" />
          <div className="absolute left-0.5 right-0.5 top-1/2 h-px bg-white/25" />
          {value !== 0 && (
            <div
              className="absolute left-1/2 -translate-x-1/2 w-1.5 rounded-full bg-gradient-to-t from-green-500 to-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
              style={value > 0 ? { bottom: '50%', height: `${fillPct}%` } : { top: '50%', height: `${fillPct}%` }}
            />
          )}
          <div
            className={cn(
              'absolute left-1/2 -translate-x-1/2 rounded-[4px] bg-gradient-to-b from-zinc-600 via-zinc-800 to-zinc-900 ring-1 ring-black/80 shadow-[0_2px_6px_rgba(0,0,0,0.6),0_0_8px_rgba(34,197,94,0.25)] flex items-center justify-center pointer-events-none',
              compact ? 'w-5 h-3.5' : 'w-7 h-4'
            )}
            style={{ bottom: `calc(${percent}% - ${compact ? 7 : 8}px)` }}
          >
            <div className="w-3.5 h-[2px] rounded bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.9)]" />
          </div>
        </div>
      </div>
      <span className="text-[8px] text-zinc-400 leading-none">{label}</span>
    </div>
  );
}

// ── Logo oficial Viagg-TX8 (pulsa sincronizada com o áudio quando tocando) ───
function ViaggLogo({ pulseRef }: { pulseRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div ref={pulseRef} className="relative w-10 h-10 shrink-0 transition-transform duration-100 will-change-transform">
      <img
        src={viaggLogo}
        alt="Viagg-TX8"
        className="w-full h-full object-contain rounded-xl ring-1 ring-emerald-400/40 shadow-[0_0_12px_rgba(52,211,153,0.35)]"
      />
      <div className="absolute inset-0 rounded-xl bg-emerald-400/20 blur-md -z-10" />
    </div>
  );
}

export function OrionAudioCenter({ settings, setSettings, isPlaying, isOpen, onToggleMute, onVolumeChange }: Props) {
  const { user } = useAuth();
  const [graphReady, setGraphReady] = useState(false);
  const [aiReading, setAiReading] = useState<AiReading | null>(null);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [detected, setDetected] = useState<DeviceProfile | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'running' | 'choose'>('idle');
  const [testStep, setTestStep] = useState<SoundTestStep | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const testCancelRef = useRef(false);
  const syncedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardLoggedRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const volumePercent = Math.round(settings.volume * 100);
  const isMutedState = settings.muted || settings.volume === 0;

  // ── Telemetria fire-and-forget ──
  const logEvent = useCallback((evento: string, detalhes: Record<string, unknown> = {}) => {
    if (!user?.id) return;
    (supabase.from('orion_audio_events') as any)
      .insert({ user_id: user.id, evento, detalhes })
      .then(() => { /* fire-and-forget */ }, () => { /* ignore */ });
  }, [user?.id]);

  // ── Grafo pronto quando o painel abre (abrir = gesto do usuário) ──
  useEffect(() => {
    if (!isOpen) return;
    if (ensureOrionGraph()) setGraphReady(true);
    logEvent('panel_open');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Aplicar EQ (quando AI está desligada, o usuário manda) ──
  useEffect(() => {
    if (!settings.aiSound) applyEq(settings.eq10, settings.eqEnabled);
    applyRadioEq(settings.eq10, settings.eqEnabled); // o MESMO EQ atua na rádio (streams com CORS)
  }, [settings.eq10, settings.eqEnabled, settings.aiSound, graphReady]);

  // ── O volume MESTRE também comanda a rádio (o slider do usuário deve valer para
  //    o que está tocando — música OU rádio). Mudo → 0. Mesma origem do slider verde. ──
  useEffect(() => {
    setRadioVolume(settings.muted ? 0 : settings.volume);
  }, [settings.volume, settings.muted]);

  useEffect(() => {
    applyBoosters(settings.boosters);
  }, [settings.boosters, graphReady]);

  // ── ORION AI SOUND — loop de análise (segue rodando com o painel fechado) ──
  useEffect(() => {
    if (!settings.aiSound) { setAiReading(null); return; }
    ensureOrionGraph();
    const stop = startAiSound(setAiReading);
    logEvent('ai_on');
    return () => {
      stop();
      logEvent('ai_off');
      applyEq(settingsRef.current.eq10, settingsRef.current.eqEnabled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.aiSound]);

  // ── ORION SOUND EXPERIENCE — boosters guiados pelo perfil detectado ──
  useEffect(() => {
    if (!settings.experience || !aiReading) return;
    const want: Boosters = {
      bass: aiReading.perfil === 'Eletrônica',
      treble: false,
      voice: aiReading.perfil === 'Voz & Podcast' || aiReading.perfil === 'Rádio/Ruído',
      loud: false,
    };
    setSettings(prev => {
      const b = prev.boosters;
      if (b.bass === want.bass && b.voice === want.voice && b.treble === want.treble && b.loud === want.loud) return prev;
      return { ...prev, boosters: want };
    });
  }, [aiReading?.perfil, settings.experience, setSettings, aiReading]);

  // ── Detecção de dispositivo (melhor esforço — declarada) ──
  useEffect(() => {
    if (!isOpen) return;
    detectDeviceProfile().then(d => {
      setDetected(d);
      if (d && settingsRef.current.deviceProfile === 'auto') {
        const preset = DEVICE_META[d].preset;
        if (preset && settingsRef.current.eqPreset !== preset) {
          setSettings(prev => ({ ...prev, eq10: [...ORION_PRESETS[preset]], eqPreset: preset }));
          toast.info(`🎧 Viagg-TX8: dispositivo "${DEVICE_META[d].label}" detectado — preset ${preset} aplicado.`);
        }
      }
    });
  }, [isOpen, setSettings]);

  // ── Sincronização na conta (server é a verdade p/ EQ/IA; volume fica local) ──
  useEffect(() => {
    if (!user?.id || syncedRef.current) return;
    syncedRef.current = true;
    (async () => {
      try {
        const { data } = await (supabase.from('orion_audio_settings') as any)
          .select('config').eq('user_id', user.id).maybeSingle();
        if (data?.config && typeof data.config === 'object') {
          const c = data.config as Partial<AudioSettings>;
          setSettings(prev => ({
            ...prev,
            eqEnabled: typeof c.eqEnabled === 'boolean' ? c.eqEnabled : prev.eqEnabled,
            eqMode: c.eqMode === 'pro' ? 'pro' : 'simple',
            eq10: Array.isArray(c.eq10) && c.eq10.length === 10 ? c.eq10 : prev.eq10,
            eqPreset: typeof c.eqPreset === 'string' || c.eqPreset === null ? c.eqPreset ?? null : prev.eqPreset,
            boosters: { ...prev.boosters, ...(c.boosters || {}) },
            aiSound: c.aiSound === true,
            experience: c.experience === true,
            deviceProfile: (c.deviceProfile as DeviceProfile) || prev.deviceProfile,
          }));
        } else {
          await (supabase.from('orion_audio_settings') as any)
            .upsert({ user_id: user.id, config: pickSync(settingsRef.current), updated_at: new Date().toISOString() });
        }
        const { data: rows } = await (supabase.from('orion_audio_presets') as any)
          .select('id, nome, bands, origem').eq('user_id', user.id).order('criado_em', { ascending: true });
        setCustomPresets(rows || []);
      } catch { /* offline → localStorage já cobre */ }
    })();
  }, [user?.id, setSettings]);

  // ── Auto-save (debounce 1.5s) ──
  useEffect(() => {
    if (!user?.id || !syncedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      (supabase.from('orion_audio_settings') as any)
        .upsert({ user_id: user.id, config: pickSync(settingsRef.current), updated_at: new Date().toISOString() })
        .then(() => { /* ok */ }, () => { /* ignore */ });
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [settings.eq10, settings.eqEnabled, settings.eqMode, settings.eqPreset, settings.boosters, settings.aiSound, settings.experience, settings.deviceProfile, user?.id]);

  // ── Tempo de uso (tick 5 min tocando) + guarda anti-distorção ──
  useEffect(() => {
    if (!isPlaying || !user?.id) return;
    const uso = setInterval(() => logEvent('uso', { minutos: 5 }), 300_000);
    const guard = setInterval(() => {
      const red = limiterReduction();
      if (!guardLoggedRef.current && red < -6) {
        guardLoggedRef.current = true;
        logEvent('distortion_guard', { reducao_db: Math.round(red) });
      }
    }, 10_000);
    return () => { clearInterval(uso); clearInterval(guard); };
  }, [isPlaying, user?.id, logEvent]);

  // ── Visualizador LED + pulso da logo (só com painel aberto) ──
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    const c2d = canvas?.getContext('2d');
    if (!canvas || !c2d) return;

    const COLS = 20, ROWS = 10;
    const levels = new Array<number>(COLS).fill(0);
    const peaks = new Array<number>(COLS).fill(0);
    let data: Uint8Array | null = null;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const W = Math.round(rect.width * dpr);
      const H = Math.round(rect.height * dpr);
      if (W === 0 || H === 0) return;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      c2d.clearRect(0, 0, W, H);

      const g = getOrionGraph();
      const playing = isPlaying && g;
      let avg = 0;
      if (g && playing) {
        if (!data || data.length !== g.analyser.frequencyBinCount) data = new Uint8Array(g.analyser.frequencyBinCount);
        g.analyser.getByteFrequencyData(data);
        for (let i = 0; i < data.length; i += 8) avg += data[i];
        avg = avg / (data.length / 8) / 255;
      } else {
        data = null;
      }

      // logo pulsa sincronizada com o nível
      if (logoRef.current) {
        logoRef.current.style.transform = `scale(${1 + Math.min(0.18, avg * 0.35)})`;
      }

      const pad = Math.round(4 * dpr);
      const gap = Math.round(2 * dpr);
      const cellW = (W - pad * 2 - gap * (COLS - 1)) / COLS;
      const cellH = (H - pad * 2 - gap * (ROWS - 1)) / ROWS;

      for (let col = 0; col < COLS; col++) {
        let v = 0;
        if (data) {
          const t = col / (COLS - 1);
          const bin = Math.min(data.length - 1, Math.round(Math.pow(t, 2.1) * (data.length - 1)));
          const bin2 = Math.min(data.length - 1, bin + 2);
          v = Math.max(data[bin], data[bin + 1] ?? 0, data[bin2]) / 255;
        }
        levels[col] = Math.max(v, levels[col] - 0.08);
        const lit = Math.round(levels[col] * ROWS);
        peaks[col] = Math.max(lit, peaks[col] - 0.25);
        const peakRow = Math.min(ROWS - 1, Math.round(peaks[col]) - 1);

        for (let row = 0; row < ROWS; row++) {
          const on = row < lit || (row === peakRow && peaks[col] >= 1);
          const x = pad + col * (cellW + gap);
          const y = H - pad - cellH - row * (cellH + gap);
          if (row >= ROWS - 2)      c2d.fillStyle = on ? '#ef4444' : 'rgba(239,68,68,0.12)';
          else if (row >= ROWS - 4) c2d.fillStyle = on ? '#eab308' : 'rgba(234,179,8,0.12)';
          else                      c2d.fillStyle = on ? '#22c55e' : 'rgba(34,197,94,0.10)';
          c2d.fillRect(x, y, cellW, cellH);
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      if (logoRef.current) logoRef.current.style.transform = 'scale(1)';
    };
  }, [isOpen, isPlaying]);

  // ── Handlers ──
  const applyPreset = useCallback((name: string, eq10: number[]) => {
    setSettings(prev => ({ ...prev, eq10: [...eq10], eqPreset: name, eqEnabled: true, aiSound: false }));
    logEvent('preset_apply', { preset: name });
  }, [setSettings, logEvent]);

  const handleBand10 = useCallback((i: number, v: number) => {
    setSettings(prev => {
      const eq10 = [...prev.eq10];
      eq10[i] = v;
      return { ...prev, eq10, eqPreset: null, aiSound: false };
    });
  }, [setSettings]);

  const handleBand5 = useCallback((group: number, v: number) => {
    setSettings(prev => ({ ...prev, eq10: setGroupIn10(prev.eq10, group, v), eqPreset: null, aiSound: false }));
  }, [setSettings]);

  const toggleBooster = useCallback((key: keyof Boosters) => {
    setSettings(prev => ({ ...prev, experience: false, boosters: { ...prev.boosters, [key]: !prev.boosters[key] } }));
  }, [setSettings]);

  const saveCustomPreset = useCallback(async (nome: string, origem: string, eq10?: number[]) => {
    if (!user?.id) { toast.error('Entre na sua conta para salvar presets.'); return; }
    const clean = nome.trim().slice(0, 40);
    if (!clean) return;
    setSavingPreset(true);
    try {
      const bands = { eq10: eq10 ?? settingsRef.current.eq10, boosters: settingsRef.current.boosters };
      const { error } = await (supabase.from('orion_audio_presets') as any)
        .upsert({ user_id: user.id, nome: clean, bands, origem }, { onConflict: 'user_id,nome' });
      if (error) throw error;
      const { data: rows } = await (supabase.from('orion_audio_presets') as any)
        .select('id, nome, bands, origem').eq('user_id', user.id).order('criado_em', { ascending: true });
      setCustomPresets(rows || []);
      toast.success(`Preset "${clean}" salvo na sua conta.`);
      setNewPresetName('');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar preset');
    } finally {
      setSavingPreset(false);
    }
  }, [user?.id]);

  const deleteCustomPreset = useCallback(async (p: CustomPreset) => {
    try {
      await (supabase.from('orion_audio_presets') as any).delete().eq('id', p.id);
      setCustomPresets(prev => prev.filter(x => x.id !== p.id));
      if (settingsRef.current.eqPreset === p.nome) setSettings(prev => ({ ...prev, eqPreset: null }));
    } catch { toast.error('Erro ao excluir preset'); }
  }, [setSettings]);

  // ── Teste de som ──
  const startTest = useCallback(async () => {
    testCancelRef.current = false;
    setTestState('running');
    ensureOrionGraph();
    setGraphReady(true);
    await runSoundTest((s) => setTestStep(s), () => testCancelRef.current);
    if (testCancelRef.current) { setTestState('idle'); return; }
    setTestState('choose');
    logEvent('teste_som');
  }, [logEvent]);

  const chooseTestProfile = useCallback((key: string) => {
    const curve = TEST_RESULT_CURVES[key];
    if (!curve) return;
    const nome = `Meu Som · ${curve.label}`;
    setSettings(prev => ({ ...prev, eq10: [...curve.eq10], eqPreset: nome, eqEnabled: true, aiSound: false, experience: false }));
    setTestState('idle');
    logEvent('preset_apply', { preset: nome, origem: 'teste_som' });
    if (user?.id) saveCustomPreset(nome, 'teste_som', curve.eq10);
  }, [setSettings, logEvent, saveCustomPreset, user?.id]);

  // ── Configurações: reset / export / import / share ──
  const resetAll = useCallback(() => {
    setSettings(prev => ({
      ...DEFAULT_AUDIO_SETTINGS,
      eq10: [...ORION_PRESETS['Flat']],
      volume: prev.volume,
      muted: prev.muted,
    }));
    toast.success('Equalizador restaurado ao padrão.');
  }, [setSettings]);

  const exportPreset = useCallback(() => {
    const payload = {
      tipo: 'orion_audio_preset', versao: 1,
      nome: settingsRef.current.eqPreset || 'Personalizado',
      eq10: settingsRef.current.eq10, boosters: settingsRef.current.boosters,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orion-preset-${(payload.nome).toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const importPresetPayload = useCallback((raw: string) => {
    try {
      const text = raw.startsWith('ORIONEQ:') ? atob(raw.slice(8)) : raw;
      const p = JSON.parse(text);
      if (!Array.isArray(p.eq10) || p.eq10.length !== 10 || !p.eq10.every((n: unknown) => typeof n === 'number')) {
        throw new Error('Formato inválido');
      }
      const nome = typeof p.nome === 'string' && p.nome.trim() ? p.nome.trim().slice(0, 40) : 'Importado';
      setSettings(prev => ({
        ...prev, eq10: p.eq10, eqPreset: nome, eqEnabled: true, aiSound: false,
        boosters: { ...prev.boosters, ...(p.boosters || {}) },
      }));
      if (user?.id) saveCustomPreset(nome, 'importado', p.eq10);
      toast.success(`Preset "${nome}" importado.`);
    } catch {
      toast.error('Não foi possível importar: formato inválido.');
    }
  }, [setSettings, saveCustomPreset, user?.id]);

  const sharePreset = useCallback(async () => {
    const code = 'ORIONEQ:' + btoa(JSON.stringify({
      nome: settingsRef.current.eqPreset || 'Personalizado',
      eq10: settingsRef.current.eq10,
    }));
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Código do preset copiado! Compartilhe e importe em qualquer aparelho.');
    } catch {
      window.prompt('Copie o código do preset:', code);
    }
  }, []);

  const VolumeIcon = isMutedState ? VolumeX : settings.volume < 0.5 ? Volume1 : Volume2;
  const eq5 = eq5From10(settings.eq10);
  const deviceLabel = settings.deviceProfile === 'auto'
    ? (detected ? `Auto · ${DEVICE_META[detected].label}` : 'Auto · Padrão do sistema')
    : DEVICE_META[settings.deviceProfile].label;

  // ── CENTRO MULTIMÍDIA (ORION-MEDIA-01): abas EQ · Rádio · TV · Lives · ♥ · ⏱ ──
  const [aba, setAba] = useState<'eq' | 'radio' | 'tv' | 'live' | 'favs' | 'hist'>('radio');
  // canal de vídeo selecionado (compartilhado entre TV/Lives/Favoritos/Histórico)
  const [mediaSel, setMediaSel] = useState<MediaChannel | null>(null);
  // favoritos/histórico → abrir um canal troca para a aba dele (TV ou Lives)
  const openChannel = useCallback((ch: MediaChannel) => {
    setMediaSel(ch);
    setAba(ch.kind === 'live' ? 'live' : 'tv');
  }, []);
  useEffect(() => {
    const openRadio = () => setAba('radio');
    window.addEventListener('viagg:open-radio', openRadio);
    return () => window.removeEventListener('viagg:open-radio', openRadio);
  }, []);
  // Ao ENTRAR na aba Rádio: corta o som da plataforma (música de fundo) e aguarda
  // o usuário escolher a emissora (radio em standby, sem tocar nada por conta própria).
  useEffect(() => {
    if (aba === 'radio') {
      try { window.dispatchEvent(new Event('viagg:stop-bg-music')); } catch { /* ignore */ }
    }
  }, [aba]);

  return (
    <div className="space-y-4">
      {/* ═══ CABEÇALHO ═══ */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ViaggLogo pulseRef={logoRef} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black text-white tracking-[0.1em] leading-tight">VIAGG-TX8 <span className="text-emerald-300">CENTRO</span> MULTIMÍDIA</p>
          <p className="text-[9px] text-zinc-400 font-bold tracking-wider">ÁUDIO · RÁDIO · TV · AO VIVO · v2.0</p>
        </div>
        
        {/* Controle da Música Tema */}
        <button
          onClick={() => {
            const ev = new Event(isPlaying ? 'viagg:stop-bg-music' : 'viagg:play-bg-music');
            window.dispatchEvent(ev);
          }}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest shrink-0 transition-colors",
            isPlaying 
              ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
              : "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
          )}
        >
          {isPlaying ? <span className="w-2 h-2 rounded bg-red-400" /> : <Play className="w-2.5 h-2.5 fill-current" />}
          Tema
        </button>

        <span className="text-xs font-black text-green-300 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full shadow-inner shrink-0">
          {volumePercent}%
        </span>
      </div>

      {/* ═══ ABAS DO CENTRO MULTIMÍDIA: EQ · Rádio · TV · Lives · ♥ · Histórico ═══ */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        {([
          ['eq', 'EQ', SlidersHorizontal, 'from-[#FF6A00] to-[#FF9A00]', 'rgba(255,106,0,0.8)', 'bg-white/5 text-zinc-400 hover:bg-white/10'],
          ['radio', 'Rádio', Radio, 'from-emerald-500 to-green-500', 'rgba(16,185,129,0.85)', 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'],
          ['favs', 'Favoritos', Heart, 'from-pink-500 to-rose-400', 'rgba(236,72,153,0.8)', 'bg-white/5 text-zinc-400 hover:bg-white/10'],
          ['hist', 'Histórico', HistoryIcon, 'from-violet-500 to-purple-500', 'rgba(139,92,246,0.8)', 'bg-white/5 text-zinc-400 hover:bg-white/10'],
        ] as const).map(([k, label, I, grad, glow, inactive]) => (
          <button key={k} onClick={() => setAba(k)}
            style={aba === k ? { boxShadow: `0 0 14px -4px ${glow}` } : undefined}
            className={cn('flex shrink-0 items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[10px] font-black transition-all',
              aba === k ? `bg-gradient-to-r ${grad} text-white` : inactive)}>
            <I className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {aba === 'radio' ? (
        <RadioMundial />
      ) : aba === 'tv' || aba === 'live' || aba === 'favs' || aba === 'hist' ? (
        <MultimediaTV mode={aba} selected={mediaSel} onSelect={setMediaSel} onOpenChannel={openChannel} />
      ) : (
      <>
      {/* status: dispositivo + estado */}
      <div className="flex items-center justify-between gap-2 text-[9px] font-bold">
        <span className="flex items-center gap-1.5 text-zinc-300 bg-white/5 border border-white/10 rounded-full px-2 py-1 min-w-0">
          {(() => { const I = DEVICE_ICONS[detected && settings.deviceProfile === 'auto' ? detected : settings.deviceProfile]; return <I className="w-3 h-3 text-emerald-300 shrink-0" />; })()}
          <span className="truncate">{deviceLabel}</span>
        </span>
        {isPlaying ? (
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-green-400">Tocando</span>
          </span>
        ) : (
          <span className="text-zinc-400 shrink-0">Pausado</span>
        )}
        {settings.muted && (
          <span className="text-[9px] font-black text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 uppercase tracking-wider shrink-0">Mudo</span>
        )}
      </div>

      {/* ═══ VOLUME ═══ */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMute}
          className={cn(
            'p-2 rounded-full transition-all duration-300 ring-1 shrink-0',
            settings.muted
              ? 'bg-red-500/10 text-red-400 ring-red-500/30 hover:bg-red-500/20'
              : 'bg-green-500/10 text-green-400 ring-green-500/30 hover:bg-green-500/20'
          )}
        >
          <VolumeIcon className="w-4 h-4" />
        </button>
        <Slider
          value={[volumePercent]}
          onValueChange={onVolumeChange}
          max={100}
          step={1}
          className="flex-1 [&_[data-radix-slider-track]]:bg-white/10 [&_[data-radix-slider-track]]:h-1.5 [&_[data-radix-slider-range]]:bg-gradient-to-r [&_[data-radix-slider-range]]:from-green-500 [&_[data-radix-slider-range]]:to-emerald-400 [&_[data-radix-slider-thumb]]:border-0 [&_[data-radix-slider-thumb]]:bg-white [&_[data-radix-slider-thumb]]:shadow-[0_0_10px_rgba(255,255,255,0.8)] [&_[data-radix-slider-thumb]]:w-4 [&_[data-radix-slider-thumb]]:h-4"
        />
      </div>

      {/* ═══ ORION AI SOUND + EXPERIENCE ═══ */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSettings(prev => ({ ...prev, aiSound: !prev.aiSound, experience: prev.aiSound ? false : prev.experience }))}
          className={cn(
            'flex flex-col items-center gap-1 py-2.5 rounded-2xl border transition-all',
            settings.aiSound
              ? 'bg-gradient-to-br from-emerald-500/25 to-cyan-500/15 border-emerald-400/60 shadow-[0_0_18px_rgba(52,211,153,0.35)]'
              : 'bg-white/5 border-white/10 hover:bg-white/10'
          )}
        >
          <Sparkles className={cn('w-4 h-4', settings.aiSound ? 'text-emerald-300' : 'text-zinc-400')} />
          <span className={cn('text-[9px] font-black uppercase tracking-widest', settings.aiSound ? 'text-emerald-200' : 'text-zinc-400')}>Viagg-TX8 AI Sound</span>
        </button>
        <button
          onClick={() => setSettings(prev => {
            const on = !prev.experience;
            return { ...prev, experience: on, aiSound: on ? true : prev.aiSound, deviceProfile: on ? 'auto' : prev.deviceProfile };
          })}
          className={cn(
            'flex flex-col items-center gap-1 py-2.5 rounded-2xl border transition-all',
            settings.experience
              ? 'bg-gradient-to-br from-violet-500/25 to-emerald-500/15 border-violet-400/60 shadow-[0_0_18px_rgba(167,139,250,0.35)]'
              : 'bg-white/5 border-white/10 hover:bg-white/10'
          )}
        >
          <Wand2 className={cn('w-4 h-4', settings.experience ? 'text-violet-300' : 'text-zinc-400')} />
          <span className={cn('text-[9px] font-black uppercase tracking-widest', settings.experience ? 'text-violet-200' : 'text-zinc-400')}>Sound Experience</span>
        </button>
      </div>

      {/* leitura da IA — evidência real, nunca inventada */}
      {settings.aiSound && (
        <div className="rounded-xl bg-black/40 border border-emerald-500/20 px-3 py-2 text-[9px] font-bold">
          {aiReading ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-emerald-300">🎵 {aiReading.perfil} <span className="text-zinc-400">({aiReading.confianca}% confiança)</span></span>
              <span className="text-zinc-500 tabular-nums shrink-0">
                G{aiReading.energias.graves} M{aiReading.energias.medios} P{aiReading.energias.presenca} A{aiReading.energias.agudos}
              </span>
            </div>
          ) : (
            <span className="text-zinc-400">Analisando o conteúdo… (toque música para a IA ler o espectro)</span>
          )}
        </div>
      )}

      {/* ═══ VISUALIZADOR ═══ */}
      <canvas ref={canvasRef} className="w-full h-16 rounded-lg bg-black/50 ring-1 ring-white/10" aria-hidden="true" />

      {/* ═══ EQUALIZADOR ═══ */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/20 rounded-full ring-1 ring-green-500/50">
              <SlidersHorizontal className="w-3.5 h-3.5 text-green-400" />
            </div>
            <span className="text-xs font-bold text-white tracking-wide">Equalizador</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {(['simple', 'pro'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setSettings(prev => ({ ...prev, eqMode: m }))}
                  className={cn(
                    'px-2 py-1 text-[8px] font-black uppercase tracking-widest transition-all',
                    settings.eqMode === m ? 'bg-green-500/25 text-green-200' : 'bg-white/5 text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  {m === 'simple' ? '5 bandas' : '10 bandas'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSettings(prev => ({ ...prev, eqEnabled: !prev.eqEnabled }))}
              className={cn(
                'text-[9px] font-black px-2 py-1 rounded-md border uppercase tracking-widest transition-all',
                settings.eqEnabled
                  ? 'bg-green-500/20 border-green-400/60 text-green-300 shadow-[0_0_12px_rgba(34,197,94,0.5)]'
                  : 'bg-white/5 border-white/15 text-zinc-500'
              )}
              aria-pressed={settings.eqEnabled}
            >
              {settings.eqEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <div className={cn(
          'flex items-end justify-between px-0.5 transition-opacity',
          (!settings.eqEnabled || settings.aiSound) && 'opacity-40 pointer-events-none'
        )}>
          {settings.eqMode === 'simple'
            ? EQ5_GROUPS.map((g, i) => (
                <EqFader key={g.label} label={g.label} value={eq5[i]} onChange={v => handleBand5(i, v)} />
              ))
            : EQ10_LABELS.map((label, i) => (
                <EqFader key={label} compact label={label} value={settings.eq10[i] ?? 0} onChange={v => handleBand10(i, v)} />
              ))}
        </div>
        {settings.aiSound && (
          <p className="text-[8px] text-zinc-500 mt-1 text-center">O Viagg-TX8 AI Sound está controlando o equalizador</p>
        )}
      </div>

      {/* ═══ PRESETS ═══ */}
      <div>
        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Presets</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 -mx-1 px-1">
          {Object.entries(ORION_PRESETS).map(([name, eq10]) => (
            <button
              key={name}
              onClick={() => applyPreset(name, eq10)}
              className={cn(
                'shrink-0 text-[9px] font-bold px-2.5 py-1 rounded-full border transition-all',
                settings.eqPreset === name
                  ? 'bg-green-500/25 border-green-400/60 text-green-200 shadow-[0_0_10px_rgba(34,197,94,0.35)]'
                  : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
              )}
            >
              {name}
            </button>
          ))}
        </div>
        {customPresets.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mt-1">
            {customPresets.map(p => (
              <span
                key={p.id}
                className={cn(
                  'shrink-0 flex items-center gap-1 text-[9px] font-bold pl-2.5 pr-1 py-0.5 rounded-full border transition-all',
                  settings.eqPreset === p.nome
                    ? 'bg-cyan-500/25 border-cyan-400/60 text-cyan-200'
                    : 'bg-white/5 border-white/10 text-zinc-300'
                )}
              >
                <button onClick={() => applyPreset(p.nome, p.bands?.eq10 || settings.eq10)} className="hover:text-white">
                  ★ {p.nome}
                </button>
                <button onClick={() => deleteCustomPreset(p)} className="p-0.5 text-zinc-500 hover:text-red-400" title="Excluir preset">
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-1.5">
          <input
            value={newPresetName}
            onChange={e => setNewPresetName(e.target.value)}
            placeholder="Nome do meu preset…"
            className="flex-1 h-7 px-2 rounded-lg bg-black/40 border border-white/10 text-[10px] text-white placeholder:text-zinc-600 outline-none focus:border-green-500/40"
            maxLength={40}
          />
          <button
            onClick={() => saveCustomPreset(newPresetName, 'manual')}
            disabled={savingPreset || !newPresetName.trim()}
            className="h-7 px-2.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-300 text-[9px] font-black uppercase tracking-wider disabled:opacity-40 hover:bg-green-500/25 transition-all flex items-center gap-1"
          >
            {savingPreset ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Salvar
          </button>
        </div>
      </div>

      {/* ═══ BOOSTERS ═══ */}
      <div>
        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Booster Inteligente <span className="text-zinc-600 normal-case">· limiter anti-distorção sempre ativo</span></p>
        <div className="grid grid-cols-4 gap-1.5">
          {([
            ['bass', 'Smart Bass'], ['treble', 'Smart Treble'], ['voice', 'Smart Voice'], ['loud', 'Volume Boost'],
          ] as [keyof Boosters, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggleBooster(key)}
              className={cn(
                'py-1.5 px-1 rounded-xl border text-[8px] font-black uppercase tracking-wide transition-all leading-tight',
                settings.boosters[key]
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200 shadow-[0_0_10px_rgba(52,211,153,0.4)]'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ DISPOSITIVO ═══ */}
      <div>
        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Perfil do dispositivo</p>
        <div className="grid grid-cols-5 gap-1.5">
          {(Object.keys(DEVICE_META) as DeviceProfile[]).map(dp => {
            const I = DEVICE_ICONS[dp];
            return (
              <button
                key={dp}
                onClick={() => {
                  setSettings(prev => {
                    const preset = DEVICE_META[dp].preset;
                    return {
                      ...prev, deviceProfile: dp,
                      ...(preset ? { eq10: [...ORION_PRESETS[preset]], eqPreset: preset } : {}),
                    };
                  });
                }}
                className={cn(
                  'flex flex-col items-center gap-1 py-1.5 rounded-xl border text-[7px] font-black uppercase transition-all',
                  settings.deviceProfile === dp
                    ? 'bg-green-500/20 border-green-400/50 text-green-200'
                    : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10'
                )}
                title={DEVICE_META[dp].label}
              >
                <I className="w-3.5 h-3.5" />
                {DEVICE_META[dp].label.split(' ')[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Teste de Som removido — mais espaço para a Central Multimídia (Rádio + EQ) */}

      {/* ═══ CONFIGURAÇÕES ═══ */}
      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-white/10">
        {([
          [RotateCcw, 'Resetar', resetAll],
          [Download, 'Exportar', exportPreset],
          [Upload, 'Importar', () => fileInputRef.current?.click()],
          [Share2, 'Compartilhar', sharePreset],
        ] as [typeof RotateCcw, string, () => void][]).map(([Icon, label, fn]) => (
          <button
            key={label}
            onClick={fn}
            className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
            title={label}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="text-[7px] font-black uppercase tracking-wider">{label}</span>
          </button>
        ))}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (!f) return;
            f.text().then(importPresetPayload);
            e.target.value = '';
          }}
        />
      </div>

      {/* branding + sync */}
      <p className="text-center text-[7px] text-zinc-600 font-bold tracking-[0.2em] uppercase">
        Viagg-TX8 Audio Center · {user ? 'sincronizado na sua conta' : 'modo local (entre para sincronizar)'}
      </p>
      </>
      )}
    </div>
  );
}

export default OrionAudioCenter;
