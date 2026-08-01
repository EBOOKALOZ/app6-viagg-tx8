/**
 * Mini card "Tempo Real" — cotação do dólar (USD/BRL) via ExchangeRate.fun.
 * Independente do módulo Clima: usa services/exchangeRates.ts isoladamente.
 * Mesmo padrão visual do card Clima (WeatherCard): gradiente, raio, sombra,
 * espaçamento e hover idênticos.
 */
import { useEffect, useRef, useState } from "react";
import { Clock, RefreshCw, TrendingUp } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  fetchExchangeRatesSnapshot, getCachedSnapshot, type ExchangeRatesSnapshot,
} from "@/services/exchangeRates";

const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // reavalia a cada 5min se o cache de 60min já expirou

export function RealtimeExchangeCard() {
  const [snapshot, setSnapshot] = useState<ExchangeRatesSnapshot | null>(() => getCachedSnapshot());
  const [loading, setLoading] = useState(() => getCachedSnapshot() === null);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const load = async (isBackground: boolean) => {
      if (isBackground) setRefreshing(true);
      try {
        const { snapshot: next } = await fetchExchangeRatesSnapshot(["USD"]);
        if (cancelledRef.current) return;
        setSnapshot(next);
        setUnavailable(false);
      } catch {
        if (cancelledRef.current) return;
        // Sem cache e sem resposta da API — nunca deixa o card vazio, mostra o aviso.
        setUnavailable(true);
      } finally {
        if (!cancelledRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    load(snapshot !== null);

    // Não faz polling agressivo: só reavalia periodicamente se o cache de
    // 60min expirou. fetchExchangeRatesSnapshot já decide internamente se
    // precisa ir à rede ou pode servir do cache.
    const interval = setInterval(() => load(true), REFRESH_CHECK_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usd = snapshot?.quotes.USD ?? null;

  if (loading && !usd) {
    return (
      <div className="rounded-2xl p-6 min-h-[220px] animate-pulse" style={{ background: "linear-gradient(135deg, #1a2332 0%, #243447 100%)" }}>
        <div className="h-4 w-24 rounded bg-white/20 mb-4" />
        <div className="h-10 w-20 rounded bg-white/20" />
      </div>
    );
  }

  if (!usd) {
    return (
      <div className="rounded-2xl p-6 min-h-[220px] flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1a2332 0%, #243447 100%)" }}>
        <p className="text-sm text-white/60">Cotação temporariamente indisponível.</p>
      </div>
    );
  }

  const updatedAtStr = new Date(usd.quotedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div
        className="group relative rounded-2xl p-6 overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 animate-fade-in"
        style={{ background: "linear-gradient(135deg, #1a2332 0%, #243447 100%)" }}
      >
        <span className="absolute -right-4 -top-2 text-[120px] leading-none opacity-10 pointer-events-none select-none">
          💵
        </span>

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Tempo Real</p>
            <div className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-white">
              {refreshing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />}
              <span>USD</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="text-5xl leading-none">💵</span>
            <div>
              <p className="text-4xl font-bold text-white leading-none">
                R$ {usd.value.toFixed(2)}
              </p>
              <p className="text-sm text-white/80 mt-1">Dólar Americano (USD/BRL)</p>
            </div>
          </div>

          {unavailable && (
            <p className="text-[11px] text-amber-300/90 pt-1">
              Cotação temporariamente indisponível. Exibindo último valor salvo.
            </p>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <p className="text-[11px] text-white/50 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Atualizado às {updatedAtStr}
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Ver Cotação
            </button>
          </div>
        </div>
      </div>

      <RealtimeExchangeModal open={modalOpen} onOpenChange={setModalOpen} snapshot={snapshot} />
    </>
  );
}

interface RealtimeExchangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: ExchangeRatesSnapshot | null;
}

function RealtimeExchangeModal({ open, onOpenChange, snapshot }: RealtimeExchangeModalProps) {
  const usd = snapshot?.quotes.USD ?? null;
  const quotedAtStr = usd
    ? new Date(usd.quotedAt).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })
    : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">💵</span> Cotação em Tempo Real
          </DialogTitle>
          <DialogDescription>
            Cotação baseada na ExchangeRate.fun, atualizada aproximadamente a cada hora.
          </DialogDescription>
        </DialogHeader>

        {usd ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{usd.name} (USD)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Valor atual em Real</p>
                </div>
                <p className="text-2xl font-bold">R$ {usd.value.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Data da cotação</p>
                <p className="font-semibold">{quotedAtStr}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Fonte</p>
                <p className="font-semibold">{usd.source}</p>
              </div>
            </div>

            {/* Campo preparado para futuras moedas (EUR, GBP, ARS, ouro, BTC, ETH, SOL,
                Ibovespa, CDI, Selic, IPCA) — cada uma entra aqui assim que tiver um
                fetcher registrado em ASSET_REGISTRY, sem alterar este layout. */}
            <div className="rounded-xl border border-dashed border-border/60 p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Mais indicadores (Euro, Libra, Peso Argentino, Ouro, Bitcoin, Ethereum,
                Solana, Ibovespa, CDI, Selic, IPCA) em breve.
              </p>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Cotação temporariamente indisponível.
          </p>
        )}

        <div className="flex justify-end pt-1">
          <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
