/**
 * RadioMiniPlayer — ORION UX AUDIO: mini player GLOBAL da rádio.
 *
 * Duas formas, MESMA barra (zero duplicação):
 *  • <RadioMiniPlayer/>        — flutuante fixa (portal em document.body), toda navegação.
 *  • <RadioMiniPlayerDocked/>  — encaixada no lugar do card de clima do Mercado
 *    (HeroClimaRadio). Quando a encaixada está visível, a flutuante se esconde
 *    (contador de docks em window + evento — nunca duas barras na tela).
 * "Música atual": streams icecast não expõem metadata ICY ao navegador — lacuna
 * declarada; mostramos emissora + status reais.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, X, Loader2, Volume2, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import viaggLogo from '@/assets/logo.png';
import {
  subscribeRadio, togglePlay, closeRadio, setRadioVolume, type RadioState, getRadioState,
} from '@/lib/radioPlayer';

declare global {
  interface Window {
    __viagg_radio_docks__: number | undefined;
  }
}
const DOCK_EVT = 'viagg:radio-dock-change';
function setDocks(delta: number) {
  window.__viagg_radio_docks__ = Math.max(0, (window.__viagg_radio_docks__ || 0) + delta);
  window.dispatchEvent(new Event(DOCK_EVT));
}

function MiniBar({ onOpenCenter, docked }: { onOpenCenter: () => void; docked?: boolean }) {
  const [radio, setRadio] = useState<RadioState>(getRadioState());
  const [showVol, setShowVol] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => subscribeRadio(setRadio), []);
  useEffect(() => { setLogoOk(true); }, [radio.station?.stationuuid]);

  if (!radio.station) return null;

  const status = radio.loading ? 'Conectando…' : radio.playing ? 'Ao vivo' : radio.error ? 'Indisponível' : 'Pausada';

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-[#0a1f16]/95 px-3 py-2 ring-1 ring-white/15 backdrop-blur-xl',
      docked ? 'w-full shadow-md' : 'shadow-[0_0_30px_6px_rgba(34,197,94,0.25)]'
    )}>
      {/* logo da emissora (fallback: logo do app) */}
      <img
        src={logoOk && radio.station.favicon ? radio.station.favicon : viaggLogo}
        onError={() => setLogoOk(false)}
        alt=""
        className="h-9 w-9 shrink-0 rounded-lg bg-white/5 object-cover ring-1 ring-emerald-400/30"
      />

      {/* nome + status — clicar abre o Audio Center (aba Rádio) */}
      <button onClick={onOpenCenter} className="min-w-0 flex-1 text-left" title="Voltar para a Rádio">
        <p className="truncate text-[12px] font-black text-white leading-tight">{radio.station.name || 'Rádio'}</p>
        <p className={cn(
          'flex items-center gap-1 truncate text-[9px] font-bold',
          radio.playing ? 'text-emerald-300' : radio.error ? 'text-red-300' : 'text-zinc-400'
        )}>
          {radio.playing && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
          )}
          {status} · Rádio Viagg-TX8
        </p>
      </button>

      {/* volume */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowVol(v => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10"
          title="Volume"
        >
          <Volume2 className="h-4 w-4" />
        </button>
        {showVol && (
          <div className="absolute bottom-10 right-0 z-10 rounded-xl border border-white/15 bg-[#0a1f16]/95 p-2 shadow-xl">
            <input
              type="range" min={0} max={100} step={1}
              defaultValue={Math.round(radio.volume * 100)}
              onChange={(e) => setRadioVolume(Number(e.target.value) / 100)}
              className="h-1.5 w-24 accent-emerald-400"
            />
          </div>
        )}
      </div>

      {/* play/pause */}
      <button
        onClick={togglePlay}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/30 active:scale-95"
        title={radio.playing ? 'Pausar' : 'Tocar'}
      >
        {radio.loading ? <Loader2 className="h-4 w-4 animate-spin" />
          : radio.playing ? <Pause className="h-4 w-4" />
          : <Play className="h-4 w-4" />}
      </button>

      {/* abrir rádio / fechar */}
      <button
        onClick={onOpenCenter}
        className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-emerald-300 hover:bg-white/10"
        title="Voltar para a Rádio"
      >
        <Radio className="h-4 w-4" />
      </button>
      <button
        onClick={closeRadio}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:bg-red-500/15 hover:text-red-300"
        title="Encerrar rádio"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Flutuante global (portal). Se houver uma versão encaixada visível, esta se esconde. */
export function RadioMiniPlayer({ hidden, onOpenCenter }: { hidden?: boolean; onOpenCenter: () => void }) {
  const [radio, setRadio] = useState<RadioState>(getRadioState());
  const [docks, setDocksState] = useState<number>(window.__viagg_radio_docks__ || 0);

  useEffect(() => subscribeRadio(setRadio), []);
  useEffect(() => {
    const onDock = () => setDocksState(window.__viagg_radio_docks__ || 0);
    window.addEventListener(DOCK_EVT, onDock);
    return () => window.removeEventListener(DOCK_EVT, onDock);
  }, []);

  if (!radio.station || hidden || docks > 0) return null;

  return createPortal(
    <div className="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 z-[9980] w-[min(94vw,420px)]">
      <MiniBar onOpenCenter={onOpenCenter} />
    </div>,
    document.body
  );
}

/** Encaixada no hero do Mercado (lugar do card de clima). Registra o dock enquanto visível. */
export function RadioMiniPlayerDocked() {
  const [radio, setRadio] = useState<RadioState>(getRadioState());
  useEffect(() => subscribeRadio(setRadio), []);

  const visible = !!radio.station;
  useEffect(() => {
    if (!visible) return;
    setDocks(1);
    return () => setDocks(-1);
  }, [visible]);

  if (!visible) return null;
  return <MiniBar docked onOpenCenter={() => window.dispatchEvent(new Event('viagg:open-radio'))} />;
}

export default RadioMiniPlayer;
