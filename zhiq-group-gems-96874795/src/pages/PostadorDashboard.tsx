import { useNavigate, useLocation } from 'react-router-dom';
import { usePostadorPremium } from '@/hooks/usePostadorPremium';
import { useMotoboyCommission } from '@/hooks/useMotoboyCommission';
import { useAuth } from '@/contexts/AuthContext';
import {
  Send, Users, History, TrendingUp, Megaphone,
  Radio, CheckCircle, Clock, Trophy, ArrowRight,
  Loader2, Zap, Star, Wallet, BarChart3, Globe2, Sparkles, Rocket, Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { RIDVHeader } from '@/components/ridv/RIDVHeader';
import { RIDVStats } from '@/components/ridv/RIDVStats';
import { RIDVAssistant } from '@/components/ridv/RIDVAssistant';
import { RIDVCampaignCard } from '@/components/ridv/RIDVCampaignCard';
import { MOCK_RIDV_CAMPAIGNS } from '@/components/ridv/RIDVCampaignList';
import { supabase } from '@/integrations/supabase/client';
import {
  ImpulsionarStats,
  ImpulsionarCreditsCard,
  ImpulsionarProfileContent,
  ImpulsionarCampaignTabs,
  ImpulsionarAIAssistant,
  ImpulsionarEnterpriseKPIs,
  ImpulsionarCampaignModal,
} from '@/components/impulsionar';

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
  const [showModal, setShowModal] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isMerchant = pathname.startsWith('/merchant') || pathname.startsWith('/lojista');

  const base = isMerchant
    ? '/merchant'
    : pathname.startsWith('/mototaxi')
    ? '/mototaxi'
    : pathname.startsWith('/driver')
    ? '/driver'
    : '/motoboy';

  const profile = isMerchant
    ? 'merchant'
    : pathname.startsWith('/mototaxi')
    ? 'mototaxi'
    : pathname.startsWith('/driver')
    ? 'driver'
    : 'motoboy';

  const hub = `${base}/impulsionar`;
  const go = (segment: string) => {
    if (isMerchant) {
      if (segment === 'comissao') return navigate('/merchant/creditos');
      if (segment === 'campanhas') return navigate('/merchant/campanhas');
      if (segment === 'historico') return navigate('/merchant/history');
      if (segment === 'grupos') return navigate('/merchant/settings');
      return navigate('/merchant/dashboard');
    }
    navigate(`${hub}/${segment}`);
  };

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

  // Profile data for RIDVHeader
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [userName, setUserName] = useState('Parceiro');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const profileType = base === '/driver' ? 'driver' : base === '/mototaxi' ? 'mototaxi' : 'motoboy';

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, avatar_url')
          .eq('id', user.id)
          .maybeSingle();
        if (profile) {
          setUserName(profile.name || 'Parceiro');
          setAvatarUrl(profile.avatar_url || undefined);
        }
        // Fetch city/state from the correct profile table
        const table = profileType === 'driver' ? 'driver_profiles'
          : profileType === 'mototaxi' ? 'motoboy_profiles'
          : 'motoboy_profiles';
        const { data: profData } = await (supabase.from(table as any) as any)
          .select('cidade, estado, is_online')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profData) {
          setCity(profData.cidade || '');
          setState(profData.estado || '');
          setIsOnline(profData.is_online || false);
        }
      } catch (e) {
        // silent
      }
    };
    load();
  }, [user?.id, profileType]);

  return (
    <div className="p-3 pb-24 space-y-4">

      {/* ── RIDV Header ── */}
      <RIDVHeader
        avatarUrl={avatarUrl}
        userName={userName}
        city={city}
        state={state}
        isOnline={isOnline}
        profileType={profileType as any}
        memberSince={user?.created_at}
      />

      {/* ── IA RIDV Assistant (compact) ── */}
      <RIDVAssistant compact />

      {/* ── RIDV KPI Stats ── */}
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/50 px-0.5">
          Minha Central RIDV
        </p>
        <RIDVStats campanhasDisponiveis={pendingCount} isLoading={loadingBoard} />
      </div>

      {/* ── Preview campanhas RIDV em destaque ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/50">
            Campanhas em Destaque
          </p>
          <button
            onClick={() => go('campanhas')}
            className="text-[10px] font-bold text-orange-400 hover:text-orange-300 transition-colors"
          >
            Ver todas →
          </button>
        </div>
        <div className="space-y-2">
          {MOCK_RIDV_CAMPAIGNS.filter((c) => c.priority === 'featured').slice(0, 2).map((c) => (
            <RIDVCampaignCard
              key={c.id}
              campaign={c}
              compact
              onShare={(id) => console.log('[RIDV] share', id)}
              onView={() => go('campanhas')}
            />
          ))}
        </div>
      </div>

      {/* ── Banner Enterprise Criar Campanha ── */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 text-center sm:text-left">
          <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-md shrink-0">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black leading-tight">
              Gerenciador de Campanhas Enterprise IA
            </h3>
            <p className="text-xs text-orange-100 mt-0.5">
              Crie campanhas personalizadas com público-alvo, orçamentos e simulação de alcance RIDV.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-black text-white font-black text-xs shadow-lg flex items-center gap-2 shrink-0 transition-all hover:scale-105 active:scale-95"
        >
          <Rocket className="h-4 w-4 text-orange-400" />
          Nova Campanha (com Viagg-TX8™)
        </button>
      </div>

      {/* ── RIDV quick links ── */}
      <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-9 gap-2">
        {[
          { icon: Rocket,     label: 'Gerenciar',  segment: 'gerenciador',  color: '#ec4899', bg: 'rgba(236,72,153,0.10)' },
          { icon: BarChart3,  label: 'Analytics',  segment: 'analytics',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)' },
          { icon: Sparkles,   label: 'Créditos',   segment: 'creditos',     color: '#f97316', bg: 'rgba(249,115,22,0.10)' },
          { icon: Bell,       label: 'Avisos',     segment: 'notificacoes', color: '#3b82f6', bg: 'rgba(59,130,246,0.10)' },
          { icon: Wallet,     label: 'Carteira',   segment: 'carteira',     color: '#eab308', bg: 'rgba(234,179,8,0.10)' },
          { icon: History,    label: 'Histórico',  segment: 'historico',    color: '#10b981', bg: 'rgba(16,185,129,0.10)' },
          { icon: TrendingUp, label: "Comissão",   segment: 'comissao',     color: '#06b6d4', bg: 'rgba(6,182,212,0.10)' },
          { icon: BarChart3,  label: 'Resultados', segment: 'resultados',   color: '#0ea5e9', bg: 'rgba(14,165,233,0.10)' },
          { icon: Globe2,     label: 'Impacto',    segment: 'impacto',      color: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
        ].map(({ icon: Icon, label, segment, color, bg }) => (
          <button
            key={segment}
            onClick={() => go(segment)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all hover:-translate-y-0.5 active:scale-95"
            style={{ background: bg, border: `1px solid ${color}22` }}
          >
            <Icon className="h-5 w-5" style={{ color }} />
            <span className="text-[10px] font-black uppercase tracking-wider truncate max-w-full" style={{ color }}>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Nova Interface Impulsionar Moderna ── */}
      <ImpulsionarCreditsCard
        balance={48.50}
        pendingEarnings={12.00}
        onWithdraw={() => go('carteira')}
        onExplore={() => go('campanhas')}
      />

      <ImpulsionarStats
        viewsCount={1240 + postedTotal * 15}
        clicksCount={384 + myPosted * 5}
        activeCampaigns={pendingCount}
        loading={loadingBoard}
      />

      <ImpulsionarEnterpriseKPIs />

      <ImpulsionarProfileContent profileType={profile} />

      <ImpulsionarAIAssistant profileType={profile} />

      <div className="pt-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400 mb-2 px-1">
          Campanhas e Oportunidades
        </h3>
        <ImpulsionarCampaignTabs onSelectCampaign={() => go('divulgacoes')} profileType={profile} />
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
          label="Divulgações"
          description="Board operacional — reserve e confirme alvos"
          badge={pendingCount > 0 ? pendingCount : undefined}
          badgeColor={accentBadge}
          onClick={() => go('divulgacoes')}
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
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Últimas divulgações</p>
          <div className="rounded-xl bg-white border border-zinc-100 shadow-sm divide-y divide-zinc-50">
            {historyMine.slice(0, 5).map((h: any) => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {h.campaign_title || h.store_name || 'Divulgação'}
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

      <ImpulsionarCampaignModal
        open={showModal}
        onOpenChange={setShowModal}
        onSuccess={() => {
          go('gerenciador');
        }}
      />

    </div>
  );
}
