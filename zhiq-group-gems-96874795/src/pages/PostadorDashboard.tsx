import { useNavigate, useLocation } from 'react-router-dom';
import { usePostadorPremium } from '@/hooks/usePostadorPremium';
import { useMotoboyCommission } from '@/hooks/useMotoboyCommission';
import { useAuth } from '@/contexts/AuthContext';
import {
  Send, Users, History, TrendingUp, Megaphone,
  Radio, CheckCircle, Clock, Trophy, ArrowRight,
  Loader2, Zap, Star, Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const TIER_COLORS: Record<string, string> = {
  Inicial: 'text-zinc-400',
  Bronze:  'text-amber-500',
  Prata:   'text-slate-400',
  Ouro:    'text-yellow-500',
  Elite:   'text-blue-400',
  VIP:     'text-violet-500',
};

const COMMISSION_TIERS = [
  { min: 0, rate: 25, name: 'Inicial' },
  { min: 1, rate: 20, name: 'Bronze' },
  { min: 2, rate: 16, name: 'Prata' },
  { min: 3, rate: 12, name: 'Ouro' },
  { min: 4, rate: 9,  name: 'Elite' },
  { min: 5, rate: 6,  name: 'VIP' },
];

function getTierName(validGroups: number) {
  let tier = COMMISSION_TIERS[0];
  for (const t of COMMISSION_TIERS) {
    if (validGroups >= t.min) tier = t;
  }
  return tier.name;
}

// ── Quick-action card ────────────────────────────────────────────────────────

interface ActionCardProps {
  icon: typeof Send;
  label: string;
  description: string;
  badge?: string | number;
  badgeColor?: string;
  onClick: () => void;
  accentClass: string;
}

function ActionCard({ icon: Icon, label, description, badge, badgeColor = 'bg-motoboy', onClick, accentClass }: ActionCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full rounded-2xl p-4 bg-white border border-zinc-100 shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left"
    >
      <div className={cn('p-2.5 rounded-xl shrink-0', accentClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-zinc-900 leading-tight">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-tight">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge !== undefined && (
          <span className={cn('text-xs font-bold text-white px-2 py-0.5 rounded-full', badgeColor)}>
            {badge}
          </span>
        )}
        <ArrowRight className="h-4 w-4 text-zinc-400" />
      </div>
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function PostadorDashboard() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const base = pathname.startsWith('/mototaxi')
    ? '/mototaxi'
    : pathname.startsWith('/driver')
    ? '/driver'
    : '/motoboy';

  const hub = `${base}/postador`;
  const go = (segment: string) => navigate(`${hub}/${segment}`);

  const { kpis, operatorKpis, operationalBoard, loadingBoard, historyMine } =
    usePostadorPremium();

  const commission = useMotoboyCommission(user?.id);

  const pendingCount  = kpis?.pending_count  ?? 0;
  const postedTotal   = kpis?.posted_count   ?? 0;
  const myPosted      = operatorKpis?.my_posted_count ?? 0;
  const validGroups   = commission?.validForCommission ?? 0;
  const totalGroups   = commission?.totalGroups ?? 0;
  const commRate      = commission?.commissionRate ?? 25;
  const tierName      = getTierName(validGroups);
  const tierColor     = TIER_COLORS[tierName] ?? 'text-zinc-400';

  const accentBtn = base === '/mototaxi'
    ? 'bg-footer-mototaxi/15 text-footer-mototaxi-foreground'
    : base === '/driver'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-motoboy/10 text-motoboy';

  const accentBadge = base === '/mototaxi'
    ? 'bg-footer-mototaxi'
    : base === '/driver'
    ? 'bg-amber-600'
    : 'bg-motoboy';

  return (
    <div className="p-3 pb-24 space-y-4">

      {/* ── Hero: status line ── */}
      <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 p-4 text-white flex items-start gap-3">
        <div className="p-2 rounded-xl bg-motoboy/20 shrink-0">
          <Radio className="h-5 w-5 text-motoboy" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base leading-tight">Módulo Postador</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {loadingBoard ? 'Carregando...' : `${pendingCount} ${pendingCount === 1 ? 'campanha disponível' : 'campanhas disponíveis'}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('text-sm font-black', tierColor)}>{tierName}</p>
          <p className="text-[11px] text-zinc-500">{commRate}% comissão</p>
        </div>
      </div>

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Pendentes',   value: pendingCount, icon: Clock,        color: 'text-amber-500' },
          { label: 'Minhas',      value: myPosted,     icon: CheckCircle,  color: 'text-emerald-500' },
          { label: 'Total geral', value: postedTotal,  icon: Zap,          color: 'text-blue-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl bg-white border border-zinc-100 p-3 text-center shadow-sm">
            <Icon className={cn('h-4 w-4 mx-auto mb-1', color)} />
            <p className="text-xl font-black text-zinc-900 leading-none">{value}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Grupos KPI ── */}
      <div className="rounded-xl bg-white border border-zinc-100 p-3 shadow-sm flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 shrink-0">
          <Users className="h-4 w-4 text-emerald-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-zinc-900">
            {validGroups} grupo{validGroups !== 1 ? 's' : ''} válido{validGroups !== 1 ? 's' : ''} para comissão
          </p>
          <p className="text-xs text-zinc-400">{totalGroups} grupos cadastrados no total</p>
        </div>
        <div className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold', tierColor, 'bg-zinc-100')}>
          <Star className="h-3 w-3" />
          {tierName}
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Acessar módulos</p>

        <ActionCard
          icon={Wallet}
          label="Carteira"
          description="Saldo, extrato, saques e Pix"
          onClick={() => go('carteira')}
          accentClass="bg-green-50 text-green-700"
        />
        <ActionCard
          icon={Send}
          label="Postagens"
          description="Board operacional — reserve e confirme alvos"
          badge={pendingCount > 0 ? pendingCount : undefined}
          badgeColor={accentBadge}
          onClick={() => go('postagens')}
          accentClass={accentBtn}
        />
        <ActionCard
          icon={Users}
          label="Meus Grupos"
          description="Gerencie seus grupos WhatsApp e tier de comissão"
          badge={validGroups > 0 ? validGroups : undefined}
          badgeColor="bg-emerald-500"
          onClick={() => go('grupos')}
          accentClass="bg-emerald-50 text-emerald-700"
        />
        <ActionCard
          icon={Megaphone}
          label="Campanhas"
          description="Caixa de entrada de campanhas disponíveis"
          onClick={() => go('campanhas')}
          accentClass="bg-violet-50 text-violet-600"
        />
        <ActionCard
          icon={TrendingUp}
          label="Comissão"
          description="Taxa atual, tiers e carteira de comissão"
          badge={`${commRate}%`}
          badgeColor="bg-amber-500"
          onClick={() => go('comissao')}
          accentClass="bg-amber-50 text-amber-600"
        />
        <ActionCard
          icon={History}
          label="Histórico"
          description="Suas postagens realizadas e confirmações"
          badge={myPosted > 0 ? myPosted : undefined}
          badgeColor="bg-blue-500"
          onClick={() => go('historico')}
          accentClass="bg-blue-50 text-blue-600"
        />
      </div>

      {/* ── Últimas postagens ── */}
      {historyMine && historyMine.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Últimas postagens</p>
          <div className="rounded-xl bg-white border border-zinc-100 shadow-sm divide-y divide-zinc-50">
            {historyMine.slice(0, 5).map((h: any) => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {h.campaign_title || h.store_name || 'Postagem'}
                  </p>
                  <p className="text-[11px] text-zinc-400">{fmtDate(h.posted_at)}</p>
                </div>
                <Trophy className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              </div>
            ))}
          </div>
          <button
            onClick={() => go('historico')}
            className="w-full text-center text-xs font-semibold text-motoboy py-2"
          >
            Ver histórico completo →
          </button>
        </div>
      )}

    </div>
  );
}
