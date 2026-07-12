import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Wallet as WalletIcon,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Building2,
  Bike,
  Car,
  Truck,
  Users,
  CheckCircle2,
  XCircle,
  Hourglass,
  ShieldCheck,
  Landmark,
  Zap,
  ArrowDownToLine,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { useMotoboyCommission } from "@/hooks/useMotoboyCommission";
import { useUnifiedWalletViews, WalletStatement } from "@/hooks/useUnifiedWalletViews";
import { cn } from "@/lib/utils";
import pixLogo from "@/assets/pix-logo.svg";
import bankLogo from "@/assets/bank-logo.svg";

const PROFILE_ICONS: Record<string, React.ElementType> = {
  motoboy: Bike,
  merchant: Building2,
  driver: Car,
  freight: Truck,
  passenger: Users,
};

const PROFILE_LABELS: Record<string, string> = {
  motoboy: "Motoboy",
  merchant: "Lojista",
  driver: "Motorista",
  freight: "Freteiro",
  passenger: "Passageiro",
};

const PROFILE_COLORS: Record<string, string> = {
  motoboy: "#16a34a",
  merchant: "#2563eb",
  driver: "#f97316",
  freight: "#8b5cf6",
  passenger: "#0ea5e9",
};

const FILTER_CHIPS = ["Todos", "Motoboy", "Lojista", "Motorista", "Frete", "Passageiro"];

/** Contador animado em centavos (sobe suave até o valor em ~800ms). */
function useCountUp(target: number, durationMs = 800) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

export default function Wallet() {
  const navigate = useNavigate();
  const { user, activeProfile } = useAuth();
  const {
    overview,
    statement,
    payouts,
    isLoading,
    error,
    filterProfile,
    setFilterProfile,
    fetchWalletData,
    metrics,
  } = useUnifiedWalletViews();

  const [activeTab, setActiveTab] = useState<'statement' | 'payouts'>('statement');

  // Comissão (só faz sentido para perfis de entregador)
  const isRiderProfile = activeProfile === 'motoboy' || activeProfile === 'mototaxi';
  const { commissionRate, validForCommission } = useMotoboyCommission(isRiderProfile ? user?.id : undefined);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(cents / 100);
  };

  const formatDate = (isoString: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(isoString));
  };

  const isCurrentlyLoading = isLoading && !overview;

  const available = overview?.available_balance || 0;
  const processing = overview?.processing_balance || 0;
  const total = overview?.total_balance || 0;
  const animatedTotal = useCountUp(total);
  const animatedAvailable = useCountUp(available);

  // Contagem de transações (derivado local, só exibição)
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (now.getDay() + 6) % 7; // segunda = 0
  const startWeek = new Date(startToday); startWeek.setDate(startWeek.getDate() - dow);
  const txToday = statement.filter(s => s.direction === 'credit' && new Date(s.created_at) >= startToday).length;
  const txWeek = statement.filter(s => s.direction === 'credit' && new Date(s.created_at) >= startWeek).length;

  // Origem dos ganhos (créditos por perfil) — derivado local, só exibição
  const originTotals = statement
    .filter(s => s.direction === 'credit')
    .reduce<Record<string, number>>((acc, s) => {
      acc[s.profile_type] = (acc[s.profile_type] || 0) + s.amount_cents;
      return acc;
    }, {});
  const originSum = Object.values(originTotals).reduce((a, b) => a + b, 0);
  const originEntries = Object.entries(originTotals).sort((a, b) => b[1] - a[1]);

  // Progresso da comissão (5 grupos = 6%)
  const groupsProgress = Math.min(100, Math.round(((validForCommission ?? 0) / 5) * 100));
  const groupsToMin = Math.max(0, 5 - (validForCommission ?? 0));

  const scrollToWithdraw = () => {
    document.getElementById('metodos-saque')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Donut SVG (sem libs): um arco por perfil
  const renderDonut = () => {
    const R = 54, C = 2 * Math.PI * R;
    let offset = 0;
    return (
      <svg viewBox="0 0 140 140" className="h-40 w-40 shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="16" />
        {originEntries.map(([profile, cents]) => {
          const frac = originSum > 0 ? cents / originSum : 0;
          const seg = (
            <circle
              key={profile}
              cx="70" cy="70" r={R} fill="none"
              stroke={PROFILE_COLORS[profile] || '#16a34a'}
              strokeWidth="16"
              strokeLinecap={originEntries.length > 1 ? 'butt' : 'round'}
              strokeDasharray={`${Math.max(0.0001, frac * C)} ${C}`}
              strokeDashoffset={-offset}
              style={{ transition: 'stroke-dasharray .6s ease' }}
            />
          );
          offset += frac * C;
          return seg;
        })}
      </svg>
    );
  };

  const renderStatementItem = (item: WalletStatement, idx: number) => {
    const isCredit = item.direction === 'credit';
    const Icon = PROFILE_ICONS[item.profile_type] || WalletIcon;
    const profileName = PROFILE_LABELS[item.profile_type] || item.profile_type;

    let title = "";
    if (item.source_type === 'delivery') title = `Entrega #${item.source_id?.substring(0, 4) || '??'}`;
    else if (item.source_type === 'ride') title = `Corrida #${item.source_id?.substring(0, 4) || '??'}`;
    else if (item.source_type === 'payout') title = "Saque PIX";
    else if (item.source_type === 'deposit') title = "Depósito";
    else title = "Movimentação";

    return (
      <div
        key={item.id}
        className="wlt-rise flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-[250ms] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/70"
        style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{
              background: isCredit ? '#dcfce7' : '#fee2e2',
              color: isCredit ? '#16a34a' : '#dc2626',
            }}
          >
            {isCredit ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-900" style={{ fontWeight: 600 }}>{title}</p>
              <span
                className="rounded-full px-2 py-0.5 text-[10px]"
                style={{
                  background: isCredit ? '#dcfce7' : '#fee2e2',
                  color: isCredit ? '#16a34a' : '#dc2626',
                  fontWeight: 600,
                }}
              >
                {isCredit ? 'Recebimento' : 'Pagamento'}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: '#64748b' }}>
              <Icon className="h-3 w-3" />
              <span>{profileName}</span>
              <span>•</span>
              <span>{formatDate(item.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className={cn('tabular-nums text-sm sm:text-base', isCredit ? 'text-[#16a34a]' : 'text-red-600')} style={{ fontWeight: 700 }}>
            {isCredit ? '+' : '-'}{formatCurrency(item.amount_cents)}
          </p>
          {isCredit && (
            <p className="text-[10px]" style={{ color: '#64748b' }}>Para saque</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="flex min-h-screen flex-1 flex-col"
      style={{ background: '#f8fafc', fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" }}
    >
      <style>{`
        @keyframes wltRise { from { opacity: 0; transform: translateY(10px);} to { opacity: 1; transform: none;} }
        .wlt-rise { animation: wltRise .45s ease-out both; }
        @keyframes wltShine { 0% { transform: translateX(-150%);} 100% { transform: translateX(400%);} }
        @keyframes wltGlow { 0%,100% { opacity: .5;} 50% { opacity: 1;} }
        .wlt-card { transition: transform .25s ease, box-shadow .25s ease; }
        .wlt-card:hover { transform: translateY(-3px); box-shadow: 0 16px 36px -14px rgba(15,23,42,.16); }
        .wlt-btn { transition: transform .25s ease, box-shadow .25s ease, filter .25s ease; }
        .wlt-btn:hover { filter: brightness(1.06); box-shadow: 0 12px 26px -10px rgba(22,163,74,.55); }
        .wlt-btn:active { transform: scale(.97); }
      `}</style>

      {/* Header fixo */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-slate-700 hover:bg-slate-100">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-base text-slate-900 sm:text-lg" style={{ fontWeight: 700 }}>Carteira Unificada</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchWalletData()}
            disabled={isLoading}
            className="flex gap-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar carteira</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-24 pt-24">

        {error && (
          <Alert className="border-red-300 bg-red-50 text-red-700">
            <AlertCircle className="mb-1 h-5 w-5" />
            <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* ── Cabeçalho premium ─────────────────────────────────── */}
        <section
          className="wlt-rise rounded-[24px] bg-white p-6 sm:p-8"
          style={{ boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 14px 44px -14px rgba(15,23,42,.10)' }}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl"
                style={{ background: 'linear-gradient(135deg,#22c55e 0%,#16a34a 100%)', boxShadow: '0 8px 20px -8px rgba(22,163,74,.5)' }}
              >
                💳
              </div>
              <div>
                <h2 className="text-2xl tracking-tight text-slate-900" style={{ fontWeight: 800 }}>
                  Carteira Unificada
                </h2>
                <p className="mt-1 max-w-md text-sm" style={{ color: '#64748b' }}>
                  Sua carteira inteligente reúne automaticamente todos os ganhos da plataforma em um único saldo.
                </p>
              </div>
            </div>

            <div
              className="flex items-center gap-4 rounded-2xl px-6 py-5"
              style={{
                background: 'linear-gradient(135deg,rgba(220,252,231,.9) 0%,rgba(240,253,244,.75) 100%)',
                border: '1px solid rgba(22,163,74,.22)',
                boxShadow: '0 8px 24px -12px rgba(22,163,74,.35)',
                backdropFilter: 'blur(6px)',
              }}
            >
              <span className="text-3xl">💰</span>
              <div>
                <p className="text-xs" style={{ color: '#64748b', fontWeight: 600 }}>Saldo disponível</p>
                {isCurrentlyLoading ? <Skeleton className="mt-1 h-7 w-28" /> : (
                  <p className="tabular-nums text-2xl leading-tight" style={{ color: '#16a34a', fontWeight: 800 }}>
                    {formatCurrency(animatedAvailable)}
                  </p>
                )}
                <p className="text-[11px]" style={{ color: '#64748b' }}>Pronto para saque imediato.</p>
              </div>
            </div>
          </div>

          {/* Saldo total gigante */}
          <div className="mt-8 text-center">
            <p className="text-xs uppercase tracking-[0.2em]" style={{ color: '#64748b', fontWeight: 600 }}>Saldo Total</p>
            {isCurrentlyLoading ? <Skeleton className="mx-auto mt-2 h-14 w-56" /> : (
              <p
                className="relative mx-auto mt-1 inline-block tabular-nums text-5xl sm:text-6xl"
                style={{ color: '#0f172a', fontWeight: 800, textShadow: '0 0 24px rgba(22,163,74,.18)' }}
              >
                {formatCurrency(animatedTotal)}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-3 -top-1 text-lg"
                  style={{ animation: 'wltGlow 2.4s ease-in-out infinite' }}
                >✨</span>
              </p>
            )}
            <p className="mt-2 text-sm" style={{ color: '#64748b' }}>Saldo disponível para saque.</p>

            <button
              type="button"
              onClick={scrollToWithdraw}
              className="wlt-btn mx-auto mt-5 flex items-center gap-2 rounded-full px-8 py-3.5 text-sm text-white"
              style={{
                background: 'linear-gradient(135deg,#22c55e 0%,#16a34a 100%)',
                fontWeight: 700,
                boxShadow: '0 10px 24px -10px rgba(22,163,74,.55)',
              }}
            >
              <ArrowDownToLine className="h-4 w-4" />
              Sacar Agora
            </button>
          </div>
        </section>

        {/* ── Cards financeiros ─────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { emoji: '💵', label: 'Disponível', value: formatCurrency(available), color: '#16a34a', bg: '#dcfce7', sub: 'Livre para saque' },
            { emoji: '🔒', label: 'Reservado', value: formatCurrency(0), color: '#f97316', bg: '#ffedd5', sub: 'Valores em garantia' },
            { emoji: '⏳', label: 'Pendente', value: formatCurrency(processing), color: '#2563eb', bg: '#dbeafe', sub: 'Entregas em andamento' },
          ].map((c, i) => (
            <div
              key={c.label}
              className="wlt-card wlt-rise rounded-[20px] border border-slate-200 bg-white/80 p-5"
              style={{ animationDelay: `${i * 60}ms`, backdropFilter: 'blur(4px)' }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full text-xl" style={{ background: c.bg }}>
                  {c.emoji}
                </div>
                <p className="text-sm" style={{ color: '#64748b', fontWeight: 600 }}>{c.label}</p>
              </div>
              {isCurrentlyLoading ? <Skeleton className="mt-3 h-8 w-24" /> : (
                <p className="mt-3 tabular-nums text-2xl" style={{ color: c.color, fontWeight: 700 }}>{c.value}</p>
              )}
              <p className="mt-1 text-xs" style={{ color: '#64748b' }}>{c.sub}</p>
            </div>
          ))}

          <div
            className="wlt-card wlt-rise rounded-[20px] border border-slate-200 bg-white/80 p-5"
            style={{ animationDelay: '180ms', backdropFilter: 'blur(4px)' }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full text-xl" style={{ background: '#f1f5f9' }}>📊</div>
              <p className="text-sm" style={{ color: '#64748b', fontWeight: 600 }}>Saldo Contábil</p>
            </div>
            {isCurrentlyLoading ? <Skeleton className="mt-3 h-8 w-24" /> : (
              <p className="mt-3 tabular-nums text-2xl text-slate-900" style={{ fontWeight: 700 }}>{formatCurrency(total)}</p>
            )}
            <button
              type="button"
              onClick={() => { setActiveTab('statement'); document.getElementById('extrato-unificado')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="mt-1 text-xs underline-offset-2 hover:underline"
              style={{ color: '#2563eb', fontWeight: 600 }}
            >
              Visualizar extrato →
            </button>
          </div>
        </section>

        {/* ── Estatísticas ──────────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="wlt-card rounded-[20px] border border-slate-200 bg-white p-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: '#dcfce7' }}>📈</div>
            <p className="mt-3 text-xs" style={{ color: '#64748b', fontWeight: 600 }}>Ganhos Hoje</p>
            {isCurrentlyLoading ? <Skeleton className="mx-auto mt-1 h-7 w-20" /> : (
              <p className="tabular-nums text-2xl" style={{ color: '#16a34a', fontWeight: 700 }}>{formatCurrency(metrics.earningsToday)}</p>
            )}
            <p className="text-xs" style={{ color: '#64748b' }}>{txToday} transaç{txToday === 1 ? 'ão' : 'ões'}</p>
          </div>

          <div className="wlt-card rounded-[20px] border border-slate-200 bg-white p-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: '#dbeafe' }}>📅</div>
            <p className="mt-3 text-xs" style={{ color: '#64748b', fontWeight: 600 }}>Ganhos Semana</p>
            {isCurrentlyLoading ? <Skeleton className="mx-auto mt-1 h-7 w-20" /> : (
              <p className="tabular-nums text-2xl" style={{ color: '#16a34a', fontWeight: 700 }}>{formatCurrency(metrics.earningsWeek)}</p>
            )}
            <p className="text-xs" style={{ color: '#64748b' }}>{txWeek} transaç{txWeek === 1 ? 'ão' : 'ões'}</p>
          </div>

          {isRiderProfile ? (
            <div className="wlt-card rounded-[20px] border border-slate-200 bg-white p-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: '#ffedd5' }}>🎯</div>
              <p className="mt-3 text-xs" style={{ color: '#64748b', fontWeight: 600 }}>Comissão Atual</p>
              <p className="tabular-nums text-2xl" style={{ color: '#f97316', fontWeight: 700 }}>{commissionRate ?? 25}%</p>
              <p className="text-xs" style={{ color: '#64748b' }}>{validForCommission ?? 0} grupo{(validForCommission ?? 0) === 1 ? '' : 's'} ativo{(validForCommission ?? 0) === 1 ? '' : 's'}</p>
              <div className="mx-auto mt-2 h-2 w-4/5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${groupsProgress}%`, background: 'linear-gradient(90deg,#22c55e,#16a34a)', transition: 'width .6s ease' }}
                />
              </div>
              {groupsToMin > 0 ? (
                <p className="mt-1.5 text-[11px]" style={{ color: '#16a34a', fontWeight: 600 }}>
                  Falta{groupsToMin > 1 ? 'm' : ''} apenas {groupsToMin} grupo{groupsToMin > 1 ? 's' : ''} para atingir 6%.
                </p>
              ) : (
                <p className="mt-1.5 text-[11px]" style={{ color: '#16a34a', fontWeight: 600 }}>Comissão mínima de 6% garantida!</p>
              )}
            </div>
          ) : (
            <div className="wlt-card rounded-[20px] border border-slate-200 bg-white p-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: '#dcfce7' }}>🗓️</div>
              <p className="mt-3 text-xs" style={{ color: '#64748b', fontWeight: 600 }}>Ganhos Mês</p>
              {isCurrentlyLoading ? <Skeleton className="mx-auto mt-1 h-7 w-20" /> : (
                <p className="tabular-nums text-2xl" style={{ color: '#16a34a', fontWeight: 700 }}>{formatCurrency(metrics.earningsMonth)}</p>
              )}
              <p className="text-xs" style={{ color: '#64748b' }}>Acumulado do mês</p>
            </div>
          )}
        </section>

        {/* ── Origem dos ganhos ─────────────────────────────────── */}
        <section
          className="wlt-rise rounded-[24px] bg-white p-6 sm:p-8"
          style={{ boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 14px 44px -14px rgba(15,23,42,.10)' }}
        >
          <h3 className="text-lg text-slate-900" style={{ fontWeight: 700 }}>Origem dos Ganhos</h3>
          <div className="mt-5 flex flex-col items-center gap-8 sm:flex-row">
            <div className="relative">
              {renderDonut()}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="tabular-nums text-lg text-slate-900" style={{ fontWeight: 800 }}>
                  {originSum > 0 ? formatCurrency(originSum) : 'R$ 0,00'}
                </p>
                <p className="text-[10px]" style={{ color: '#64748b' }}>ganhos totais</p>
              </div>
            </div>
            <div className="w-full flex-1 space-y-3">
              {originEntries.length === 0 ? (
                <p className="text-sm" style={{ color: '#64748b' }}>Nenhum ganho registrado ainda — assim que você começar a receber, a distribuição por perfil aparece aqui.</p>
              ) : (
                originEntries.map(([profile, cents]) => {
                  const pct = originSum > 0 ? Math.round((cents / originSum) * 100) : 0;
                  const Icon = PROFILE_ICONS[profile] || WalletIcon;
                  return (
                    <div key={profile} className="flex items-center gap-3">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: PROFILE_COLORS[profile] || '#16a34a' }} />
                      <Icon className="h-4 w-4 shrink-0" style={{ color: '#64748b' }} />
                      <span className="min-w-0 flex-1 text-sm text-slate-900" style={{ fontWeight: 600 }}>
                        {PROFILE_LABELS[profile] || profile}
                      </span>
                      <span className="tabular-nums text-sm" style={{ color: '#64748b' }}>{pct}%</span>
                      <span className="tabular-nums text-sm text-slate-900" style={{ fontWeight: 700 }}>{formatCurrency(cents)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* ── Carteira inteligente (explicação) ─────────────────── */}
        <section
          className="wlt-rise flex items-start gap-4 rounded-[20px] p-6"
          style={{ background: '#f0fdf4', border: '1px solid rgba(22,163,74,.18)' }}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl" style={{ background: '#dcfce7' }}>🛡️</div>
          <div>
            <p className="text-sm text-slate-900" style={{ fontWeight: 700 }}>Carteira Inteligente</p>
            <p className="mt-1 text-sm" style={{ color: '#64748b' }}>
              Sua carteira é única. Todos os valores ganhos em qualquer perfil são automaticamente
              consolidados em um único saldo. Você pode sacar independentemente do perfil utilizado.
            </p>
          </div>
        </section>

        {/* ── Métodos de saque ──────────────────────────────────── */}
        <section id="metodos-saque" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="wlt-card rounded-[20px] border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white p-2" style={{ border: '1px solid #e2e8f0' }}>
                <img src={pixLogo} alt="Pix" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-sm text-slate-900" style={{ fontWeight: 700 }}>PIX</p>
                <p className="text-xs" style={{ color: '#64748b' }}>Receba em segundos, a qualquer hora.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toast.info('Cadastro de chave PIX em preparação — em breve disponível.')}
              className="wlt-btn mt-4 w-full rounded-full py-2.5 text-sm text-white"
              style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', fontWeight: 600, boxShadow: '0 8px 18px -8px rgba(22,163,74,.5)' }}
            >
              Cadastrar chave PIX
            </button>
          </div>

          <div className="wlt-card rounded-[20px] border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-full">
                <img src={bankLogo} alt="Banco" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-sm text-slate-900" style={{ fontWeight: 700 }}>Conta Bancária</p>
                <p className="text-xs" style={{ color: '#64748b' }}>Transferência direta para seu banco.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toast.info('Vínculo de conta bancária em preparação — em breve disponível.')}
              className="wlt-btn mt-4 w-full rounded-full py-2.5 text-sm text-white"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)', fontWeight: 600, boxShadow: '0 8px 18px -8px rgba(37,99,235,.5)' }}
            >
              <span className="inline-flex items-center gap-2"><Landmark className="h-4 w-4" /> Vincular Banco</span>
            </button>
          </div>
        </section>

        {/* ── Extrato unificado ─────────────────────────────────── */}
        <section
          id="extrato-unificado"
          className="wlt-rise rounded-[24px] bg-white p-6 sm:p-8"
          style={{ boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 14px 44px -14px rgba(15,23,42,.10)' }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg text-slate-900" style={{ fontWeight: 700 }}>Extrato Unificado</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('statement')}
                className="rounded-full px-4 py-1.5 text-xs transition-all duration-[250ms]"
                style={activeTab === 'statement'
                  ? { background: '#16a34a', color: '#fff', fontWeight: 700, boxShadow: '0 6px 14px -6px rgba(22,163,74,.5)' }
                  : { background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}
              >
                Extrato
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('payouts')}
                className="rounded-full px-4 py-1.5 text-xs transition-all duration-[250ms]"
                style={activeTab === 'payouts'
                  ? { background: '#16a34a', color: '#fff', fontWeight: 700, boxShadow: '0 6px 14px -6px rgba(22,163,74,.5)' }
                  : { background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}
              >
                Saques
              </button>
            </div>
          </div>

          {/* Chips de filtro por perfil */}
          {activeTab === 'statement' && (
            <div className="mt-4 flex flex-wrap gap-2">
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setFilterProfile(chip)}
                  className="rounded-full px-3.5 py-1.5 text-xs transition-all duration-[250ms]"
                  style={filterProfile === chip
                    ? { background: '#dcfce7', color: '#16a34a', border: '1px solid rgba(22,163,74,.35)', fontWeight: 700 }
                    : { background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', fontWeight: 600 }}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          <div className="mt-5">
            {activeTab === 'statement' && (
              <div className="space-y-3">
                {isCurrentlyLoading ? (
                  <div className="flex justify-center p-8"><Skeleton className="h-10 w-10 rounded-full" /></div>
                ) : statement.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <WalletIcon className="mb-4 h-12 w-12 text-slate-200" />
                    <p className="text-slate-900" style={{ fontWeight: 600 }}>Nenhuma movimentação ainda.</p>
                    <p className="mt-1 text-sm" style={{ color: '#64748b' }}>Saldo {formatCurrency(0)}</p>
                  </div>
                ) : (
                  statement.map(renderStatementItem)
                )}
              </div>
            )}

            {activeTab === 'payouts' && (
              <div className="space-y-3">
                {isCurrentlyLoading ? (
                  <div className="flex justify-center p-8"><Skeleton className="h-10 w-10 rounded-full" /></div>
                ) : payouts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <AlertCircle className="mb-4 h-12 w-12 text-slate-200" />
                    <p className="text-slate-900" style={{ fontWeight: 600 }}>Nenhum saque solicitado.</p>
                  </div>
                ) : (
                  payouts.map((p, idx) => (
                    <div
                      key={p.id}
                      className="wlt-rise flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-[250ms] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/70"
                      style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full text-xl" style={{ background: '#dcfce7' }}>
                          <Zap className="h-5 w-5" style={{ color: '#16a34a' }} />
                        </div>
                        <div>
                          <p className="text-sm text-slate-900" style={{ fontWeight: 600 }}>Saque PIX</p>
                          <p className="mt-0.5 text-xs" style={{ color: '#64748b' }}>{formatDate(p.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="tabular-nums text-sm sm:text-base" style={{ color: '#0f172a', fontWeight: 700 }}>{formatCurrency(p.amount_cents)}</p>
                        {p.status === 'completed' && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700" style={{ fontWeight: 600 }}><CheckCircle2 className="h-3 w-3" /> Concluído</span>}
                        {p.status === 'pending' && <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700" style={{ fontWeight: 600 }}><Hourglass className="h-3 w-3" /> Pendente</span>}
                        {p.status === 'failed' && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700" style={{ fontWeight: 600 }}><XCircle className="h-3 w-3" /> Falhou</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Segurança ─────────────────────────────────────────── */}
        <section
          className="wlt-rise flex flex-col items-start gap-4 rounded-[20px] bg-white p-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ border: '1px solid #e2e8f0', boxShadow: '0 8px 24px -14px rgba(15,23,42,.12)' }}
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl" style={{ background: '#f1f5f9' }}>🔒</div>
            <div>
              <p className="text-sm text-slate-900" style={{ fontWeight: 700 }}>Segurança Financeira</p>
              <p className="mt-1 max-w-xl text-sm" style={{ color: '#64748b' }}>
                Todos os seus dados financeiros são protegidos por criptografia de ponta a ponta,
                autenticação segura e infraestrutura de alta disponibilidade.
              </p>
            </div>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs"
            style={{ background: '#dcfce7', color: '#16a34a', fontWeight: 700 }}
          >
            <ShieldCheck className="h-4 w-4" /> Criptografia Ativa
          </span>
        </section>
      </main>
    </div>
  );
}
