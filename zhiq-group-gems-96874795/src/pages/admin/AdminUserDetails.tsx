import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getAdminUserDetails,
  updateUserActiveStatus,
  setCommissionOverride,
  removeCommissionOverride,
  getNextCommissionGoal,
  updateDriverGroupStatus,
  WhatsAppGroup,
  DriverWhatsAppGroup,
  UserProfile,
  CommissionOverride,
} from '@/lib/api';
import { toast } from 'sonner';
import {
  ArrowLeft, User, MessageSquare, Percent, Save, X, ExternalLink,
  Link as LinkIcon, TrendingUp, Target, Activity, Check, XCircle,
  ChevronDown, Shield, Image as ImageIcon, Calendar, Mail, BarChart3,
  Zap, Award, FileText, Coins as CoinsIcon, ArrowUpCircle, ArrowDownCircle,
  Wallet, MousePointerClick, Store as StoreIcon,
} from 'lucide-react';

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function useUserEngagement(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-user-engagement', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data: stores } = await (supabase.from('merchant_stores') as any)
        .select('id, store_name, nome_loja, created_at')
        .eq('user_id', userId);

      const storeList: any[] = stores || [];
      if (storeList.length === 0) {
        return { stores: [], totals: null, clicksTotal: 0, clicksByStore: {} as Record<string, number> };
      }

      const finances = await Promise.all(
        storeList.map(async (s) => {
          const { data } = await (supabase.rpc as any)('admin_get_store_finances', { p_store_id: s.id });
          return { storeId: s.id, data };
        })
      );

      const ids = storeList.map((s) => s.id);
      const { data: clicks } = await (supabase.from('marketplace_product_click_events') as any)
        .select('store_id, status, credits_charged, visitor_user_id, anon_id')
        .in('store_id', ids);

      const clicksRows: any[] = clicks || [];
      const clicksByStore: Record<string, number> = {};
      let chargedClicks = 0;
      let creditsBurned = 0;
      const uniqueVisitors = new Set<string>();
      for (const r of clicksRows) {
        clicksByStore[r.store_id] = (clicksByStore[r.store_id] || 0) + 1;
        if (r.status === 'charged') {
          chargedClicks += 1;
          creditsBurned += r.credits_charged || 0;
        }
        const visitor = r.visitor_user_id || r.anon_id;
        if (visitor) uniqueVisitors.add(visitor);
      }

      let saldoR = 0,
        recarregadoR = 0,
        gastoR = 0,
        availableCredits = 0,
        consumedCredits = 0;
      for (const f of finances) {
        const w = f.data?.wallet || {};
        const c = f.data?.credits?.balance || {};
        saldoR += Number(w.saldo_total || 0);
        recarregadoR += Number(w.pay_recharged || 0);
        gastoR += Number(w.pay_spent || 0);
        availableCredits += Number(c.available_credits || 0);
        consumedCredits += Number(c.consumed_credits || 0);
      }

      return {
        stores: storeList.map((s) => ({
          ...s,
          finances: finances.find((f) => f.storeId === s.id)?.data || null,
          clicks: clicksByStore[s.id] || 0,
        })),
        totals: {
          saldoR,
          recarregadoR,
          gastoR,
          availableCredits,
          consumedCredits,
          chargedClicks,
          creditsBurned,
          totalEvents: clicksRows.length,
          uniqueVisitors: uniqueVisitors.size,
        },
        clicksTotal: clicksRows.length,
        clicksByStore,
      };
    },
    enabled: !!userId,
  });
}

// ─── Types ───────────────────────────────────────────────────────
interface GroupWithStatus {
  id: string;
  user_id: string;
  link: string;
  cidade: string;
  estado: string;
  tipo: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface UserDetails {
  profile: UserProfile;
  groups: WhatsAppGroup[];
  driverGroups: DriverWhatsAppGroup[];
  motoboyGroups: GroupWithStatus[];
  merchantGroups: GroupWithStatus[];
  override: CommissionOverride | null;
  groupCount: number;
  totalDriverGroups: number;
  activeDriverGroups: number;
  totalMotoboyGroups: number;
  activeMotoboyGroups: number;
  totalMerchantGroups: number;
  activeMerchantGroups: number;
  totalAllGroups: number;
  totalActiveGroups: number;
  commissionRate: number;
  availableProfiles: string[];
  isAdmin: boolean;
  driverProfile: { selfie_url: string | null; cnh_url: string | null } | null;
  availableCredits: number;
  creditHistory: any[];
}

// ─── Profile theme config ────────────────────────────────────────
const PROFILE_THEME: Record<string, {
  label: string;
  icon: string;
  badge: string;
  accent: string;
  accentText: string;
  headerGradient: string;
  ring: string;
  cardBorder: string;
  bgSoft: string;
}> = {
  motoboy: {
    label: 'Motoboy', icon: '🏍️',
    badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-400/30',
    accent: 'bg-orange-500', accentText: 'text-orange-600 dark:text-orange-400',
    headerGradient: 'from-orange-500/10 via-orange-400/5 to-transparent',
    ring: 'ring-orange-400/50', cardBorder: 'border-orange-400/40',
    bgSoft: 'bg-orange-50 dark:bg-orange-950/20',
  },
  merchant: {
    label: 'Lojista', icon: '🏪',
    badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-400/30',
    accent: 'bg-emerald-500', accentText: 'text-emerald-600 dark:text-emerald-400',
    headerGradient: 'from-emerald-500/10 via-emerald-400/5 to-transparent',
    ring: 'ring-emerald-400/50', cardBorder: 'border-emerald-400/40',
    bgSoft: 'bg-emerald-50 dark:bg-emerald-950/20',
  },
  passenger: {
    label: 'Passageiro', icon: '🚗',
    badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-400/30',
    accent: 'bg-blue-500', accentText: 'text-blue-600 dark:text-blue-400',
    headerGradient: 'from-blue-500/10 via-blue-400/5 to-transparent',
    ring: 'ring-blue-400/50', cardBorder: 'border-blue-400/40',
    bgSoft: 'bg-blue-50 dark:bg-blue-950/20',
  },
  driver: {
    label: 'Motorista', icon: '🚕',
    badge: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-400/30',
    accent: 'bg-slate-500', accentText: 'text-slate-600 dark:text-slate-400',
    headerGradient: 'from-slate-500/5 to-transparent',
    ring: 'ring-slate-400/40', cardBorder: 'border-slate-400/30',
    bgSoft: 'bg-slate-50 dark:bg-slate-950/20',
  },
  mototaxi: {
    label: 'Moto-Táxi', icon: '🛵',
    badge: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-400/30',
    accent: 'bg-cyan-500', accentText: 'text-cyan-600 dark:text-cyan-400',
    headerGradient: 'from-cyan-500/5 to-transparent',
    ring: 'ring-cyan-400/40', cardBorder: 'border-cyan-400/30',
    bgSoft: 'bg-cyan-50 dark:bg-cyan-950/20',
  },
  freteiro: {
    label: 'Freteiro', icon: '🚚',
    badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-400/30',
    accent: 'bg-amber-500', accentText: 'text-amber-600 dark:text-amber-400',
    headerGradient: 'from-amber-500/5 to-transparent',
    ring: 'ring-amber-400/40', cardBorder: 'border-amber-400/30',
    bgSoft: 'bg-amber-50 dark:bg-amber-950/20',
  },
};

const ADMIN_THEME = {
  label: 'Admin', icon: '👑',
  badge: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-400/30',
  accent: 'bg-red-500', accentText: 'text-red-600 dark:text-red-400',
  headerGradient: 'from-red-500/8 via-red-400/4 to-transparent',
  ring: 'ring-red-400/50', cardBorder: 'border-red-400/30',
  bgSoft: 'bg-red-50 dark:bg-red-950/20',
};

const NEUTRAL_THEME = {
  accent: 'bg-muted', accentText: 'text-muted-foreground',
  headerGradient: 'from-muted/30 to-transparent',
  ring: 'ring-border/40', cardBorder: 'border-border/60',
  bgSoft: 'bg-muted/30',
};

function getDominantTheme(profiles: string[], isAdmin: boolean) {
  const priority = ['motoboy', 'merchant', 'passenger', 'driver', 'mototaxi', 'freteiro'];
  for (const p of priority) {
    if (profiles.includes(p)) return PROFILE_THEME[p];
  }
  if (isAdmin) return ADMIN_THEME;
  return NEUTRAL_THEME;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  em_analise: { label: 'Em análise', variant: 'secondary' },
  ativo: { label: 'Ativo', variant: 'default' },
  inativo: { label: 'Inativo', variant: 'outline' },
  rejeitado: { label: 'Rejeitado', variant: 'destructive' },
};

function getInitials(name: string | null): string {
  if (!name) return '??';
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

// ─── Component ───────────────────────────────────────────────────
export default function AdminUserDetails() {
  const { id } = useParams<{ id: string }>();
  const { user: adminUser } = useAuth();
  const navigate = useNavigate();
  const [userData, setUserData] = useState<UserDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [customRate, setCustomRate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [updatingGroupId, setUpdatingGroupId] = useState<string | null>(null);
  const [pendingActive, setPendingActive] = useState<boolean | null>(null);
  const [savingActive, setSavingActive] = useState(false);
  const { data: engagement } = useUserEngagement(id);

  // Estado efetivo mostrado no switch (pending se foi alterado, senão o salvo)
  const displayActive = pendingActive ?? isActive;
  const hasPendingChange = pendingActive !== null && pendingActive !== isActive;

  const fetchUserData = async () => {
    if (!id) return;
    const { data } = await getAdminUserDetails(id);
    if (data) {
      setUserData(data);
      setIsActive(data.profile.is_active);
      setCustomRate(data.override?.custom_rate?.toString() || '');
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchUserData(); }, [id]);

  const handleToggleActive = (checked: boolean) => {
    setPendingActive(checked);
  };

  const handleSaveActive = async () => {
    if (!id || pendingActive === null) return;
    setSavingActive(true);
    const { error } = await updateUserActiveStatus(id, pendingActive);
    if (error) {
      toast.error(`Erro ao atualizar status: ${(error as any).message || 'desconhecido'}`);
    } else {
      setIsActive(pendingActive);
      setPendingActive(null);
      toast.success(pendingActive ? 'Usuário ativado' : 'Usuário desativado');
    }
    setSavingActive(false);
  };

  const handleCancelActive = () => setPendingActive(null);

  const handleSetOverride = async () => {
    if (!id || !adminUser || !customRate) return;
    const rate = parseFloat(customRate);
    if (isNaN(rate) || rate < 0 || rate > 100) { toast.error('Taxa deve ser entre 0 e 100'); return; }
    setIsSaving(true);
    const { error } = await setCommissionOverride(id, rate, adminUser.id);
    if (error) toast.error('Erro ao definir taxa');
    else { toast.success('Taxa personalizada definida'); fetchUserData(); }
    setIsSaving(false);
  };

  const handleRemoveOverride = async () => {
    if (!id) return;
    setIsSaving(true);
    const { error } = await removeCommissionOverride(id);
    if (error) toast.error('Erro ao remover taxa personalizada');
    else { toast.success('Taxa personalizada removida'); setCustomRate(''); fetchUserData(); }
    setIsSaving(false);
  };

  const handleUpdateGroupStatus = async (groupId: string, newStatus: 'ativo' | 'rejeitado') => {
    setUpdatingGroupId(groupId);
    const { error } = await updateDriverGroupStatus(groupId, newStatus);
    if (error) toast.error('Erro ao atualizar status do grupo');
    else { toast.success(newStatus === 'ativo' ? 'Grupo aprovado!' : 'Grupo rejeitado'); await fetchUserData(); }
    setUpdatingGroupId(null);
  };

  // ─── Loading / Not found ────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Usuário não encontrado</p>
        <Button onClick={() => navigate('/admin/users')} className="mt-4">Voltar</Button>
      </div>
    );
  }

  const theme = getDominantTheme(userData.availableProfiles, userData.isAdmin);

  // ─── Render ────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* ═══ TOP: Back + Header ═══ */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Voltar para Usuários
      </Button>

      {/* ═══ HERO SIDEBAR + CARDS GRID (inspired by reference image) ═══ */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* ── LEFT SIDEBAR CARD: Avatar + Name + Profiles ── */}
        <div className="space-y-4">
          <Card className={`overflow-hidden ${theme.cardBorder}`}>
            {/* Gradient header */}
            <div className={`h-20 bg-gradient-to-br ${theme.headerGradient}`} />
            <div className="flex flex-col items-center -mt-10 pb-6 px-4">
              <Avatar className={`h-20 w-20 ring-4 ${theme.ring} border-4 border-card`}>
                <AvatarImage src={userData.profile.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/15 text-primary text-xl font-bold">
                  {getInitials(userData.profile.name)}
                </AvatarFallback>
              </Avatar>
              <h2 className="mt-3 text-lg font-bold text-center">{userData.profile.name || 'Sem nome'}</h2>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Mail className="h-3 w-3" />
                {userData.profile.email}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Calendar className="h-3 w-3" />
                Desde {new Date(userData.profile.created_at).toLocaleDateString('pt-BR')}
              </p>

              {/* Profile badges */}
              <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                {userData.isAdmin && (
                  <Badge variant="outline" className={`text-[11px] border ${ADMIN_THEME.badge}`}>
                    {ADMIN_THEME.icon} {ADMIN_THEME.label}
                  </Badge>
                )}
                {userData.availableProfiles.map((p) => {
                  const cfg = PROFILE_THEME[p];
                  if (!cfg) return null;
                  return (
                    <Badge key={p} variant="outline" className={`text-[11px] border ${cfg.badge}`}>
                      {cfg.icon} {cfg.label}
                    </Badge>
                  );
                })}
                {!userData.isAdmin && userData.availableProfiles.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhum perfil</span>
                )}
              </div>

              {/* Status toggle + Salvar */}
              <div className="mt-5 pt-4 border-t border-border/40 w-full flex flex-col items-center gap-3">
                <div className="flex items-center gap-3">
                  <Badge variant={displayActive ? 'default' : 'destructive'}>
                    {displayActive ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Switch checked={displayActive} onCheckedChange={handleToggleActive} />
                  {hasPendingChange && (
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600">
                      não salvo
                    </span>
                  )}
                </div>
                {hasPendingChange && (
                  <div className="flex items-center gap-2 w-full">
                    <Button onClick={handleSaveActive} disabled={savingActive} size="sm" className="flex-1 gap-1.5">
                      <Save className="h-3.5 w-3.5" />
                      {savingActive ? 'Salvando...' : 'Salvar'}
                    </Button>
                    <Button onClick={handleCancelActive} disabled={savingActive} variant="outline" size="sm">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Images card */}
          {(() => {
            const images: { label: string; url: string }[] = [];
            if (userData.profile.avatar_url) images.push({ label: 'Avatar', url: userData.profile.avatar_url });
            if (userData.driverProfile?.selfie_url) images.push({ label: 'Selfie', url: userData.driverProfile.selfie_url });
            if (userData.driverProfile?.cnh_url) images.push({ label: 'CNH', url: userData.driverProfile.cnh_url });
            if (images.length === 0) return null;
            return (
              <Card className={theme.cardBorder}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" /> Documentos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {images.map((img) => (
                    <div key={img.label} className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{img.label}</p>
                      <div className="overflow-hidden rounded-lg border border-border/50">
                        <img src={img.url} alt={img.label} className="w-full h-32 object-cover" loading="lazy" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* ── RIGHT: Tabbed dashboard ── */}
        <div className="space-y-6">
          <Tabs defaultValue="highlights" className="w-full">
            <TabsList className="w-full justify-start bg-card border border-border/60 h-10">
              <TabsTrigger value="highlights" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" />Destaques</TabsTrigger>
              <TabsTrigger value="profiles" className="text-xs gap-1"><Shield className="h-3.5 w-3.5" />Perfis</TabsTrigger>
              <TabsTrigger value="groups" className="text-xs gap-1"><MessageSquare className="h-3.5 w-3.5" />Grupos</TabsTrigger>
              <TabsTrigger value="credits" className="text-xs gap-1"><CoinsIcon className="h-3.5 w-3.5" />Créditos</TabsTrigger>
              <TabsTrigger value="commission" className="text-xs gap-1"><Percent className="h-3.5 w-3.5" />Comissão</TabsTrigger>
            </TabsList>

            {/* ── TAB: Highlights ── */}
            <TabsContent value="highlights" className="mt-4 space-y-4">
              {/* Engajamento atual */}
              {engagement && engagement.stores.length > 0 && engagement.totals && (
                <Card className="border-emerald-300/60 bg-emerald-50/30 dark:bg-emerald-950/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-600" /> Engajamento atual
                      <Badge variant="outline" className="text-[10px]">{engagement.stores.length} loja{engagement.stores.length > 1 ? 's' : ''}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <MiniKpi icon={<Wallet className="h-4 w-4" />} label="Saldo R$" value={fmtBRL(engagement.totals.saldoR)} color="text-emerald-600" />
                      <MiniKpi icon={<ArrowDownCircle className="h-4 w-4" />} label="Recarregado" value={fmtBRL(engagement.totals.recarregadoR)} color="text-emerald-500" />
                      <MiniKpi icon={<ArrowUpCircle className="h-4 w-4" />} label="Gasto (motoboy etc.)" value={fmtBRL(engagement.totals.gastoR)} color="text-red-500" />
                      <MiniKpi icon={<CoinsIcon className="h-4 w-4" />} label="Saldo créditos" value={engagement.totals.availableCredits.toLocaleString('pt-BR')} color="text-amber-600" />
                      <MiniKpi icon={<MousePointerClick className="h-4 w-4" />} label="Cliques cobrados" value={engagement.totals.chargedClicks} color="text-orange-600" />
                      <MiniKpi icon={<Activity className="h-4 w-4" />} label="Eventos totais" value={engagement.totals.totalEvents} color="text-zinc-700 dark:text-zinc-300" />
                      <MiniKpi icon={<User className="h-4 w-4" />} label="Visitantes únicos" value={engagement.totals.uniqueVisitors} color="text-blue-600" />
                      <MiniKpi icon={<CoinsIcon className="h-4 w-4" />} label="Créditos consumidos" value={engagement.totals.consumedCredits.toLocaleString('pt-BR')} color="text-red-500" />
                    </div>

                    <div className="border-t border-emerald-200/40 pt-3 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <StoreIcon className="h-3 w-3" /> Lojas vinculadas
                      </p>
                      {engagement.stores.map((s: any) => (
                        <RouterLink
                          key={s.id}
                          to={`/admin/lojas/${s.id}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card px-3 py-2 hover:bg-muted/30 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{s.store_name || s.nome_loja || 'Sem nome'}</p>
                            <p className="text-[10px] font-mono text-muted-foreground truncate">{s.id}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-xs">
                            <span className="text-emerald-600 font-semibold">{fmtBRL(Number(s.finances?.wallet?.saldo_total || 0))}</span>
                            <span className="text-amber-600 font-semibold">{Number(s.finances?.credits?.balance?.available_credits || 0).toLocaleString('pt-BR')} cr</span>
                            <span className="text-orange-600 font-semibold flex items-center gap-1">
                              <MousePointerClick className="h-3 w-3" /> {s.clicks}
                            </span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </RouterLink>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* KPI row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard icon={<Percent className="h-4 w-4" />} label="Taxa Atual" value={`${userData.commissionRate}%`}
                  accent={theme.accentText} bgSoft={theme.bgSoft} border={theme.cardBorder}
                  extra={userData.override ? 'Override' : undefined} />
                <KpiCard icon={<MessageSquare className="h-4 w-4" />} label="Grupos Registrados" value={String(userData.totalAllGroups)}
                  accent="text-foreground" bgSoft="bg-secondary/50" border="border-border/50" />
                <KpiCard icon={<Activity className="h-4 w-4" />} label="Grupos Ativos" value={String(userData.totalActiveGroups)}
                  accent={theme.accentText} bgSoft={theme.bgSoft} border={theme.cardBorder} />
                <KpiCard icon={<Target className="h-4 w-4" />} label="Próxima Meta"
                  value={(() => { const g = getNextCommissionGoal(userData.totalActiveGroups); return g ? `+${g.groupsNeeded}` : '🎉 Max'; })()}
                  accent="text-blue-600 dark:text-blue-400" bgSoft="bg-blue-50 dark:bg-blue-950/20" border="border-blue-400/30"
                  extra={(() => { const g = getNextCommissionGoal(userData.totalActiveGroups); return g ? `→ ${g.nextRate}%` : 'Menor taxa'; })()} />
              </div>

              {/* Commission Tier Strip */}
              <Card className={theme.cardBorder}>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Award className="h-4 w-4" /> Faixa de Comissão
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { groups: '3+', rate: 6 }, { groups: '2', rate: 11 },
                      { groups: '1', rate: 18 }, { groups: '0', rate: 25 },
                    ].map((tier) => {
                      const isCurrent = userData.commissionRate === tier.rate && !userData.override;
                      return (
                        <Badge key={tier.groups} variant={isCurrent ? 'default' : 'outline'}
                          className={isCurrent ? '' : 'text-muted-foreground'}>
                          {tier.groups}g → {tier.rate}%
                        </Badge>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Groups breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <GroupBreakdownCard label="Motorista" total={userData.totalDriverGroups} active={userData.activeDriverGroups}
                  icon={<MessageSquare className="h-4 w-4" />} accent="text-primary" />
                <GroupBreakdownCard label="Motoboy" total={userData.totalMotoboyGroups} active={userData.activeMotoboyGroups}
                  icon={<MessageSquare className="h-4 w-4" />} accent="text-orange-500" />
                <GroupBreakdownCard label="Lojista" total={userData.totalMerchantGroups} active={userData.activeMerchantGroups}
                  icon={<MessageSquare className="h-4 w-4" />} accent="text-emerald-500" />
              </div>

              {/* General Status Bar */}
              <Card className="border-border/50">
                <CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted-foreground">Status Geral:</span>
                  <Badge variant={isActive ? 'default' : 'destructive'}>
                    {isActive ? '✓ Ativo' : '✗ Inativo'}
                  </Badge>
                  {userData.totalActiveGroups > 0 && (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">✓ Postagens habilitadas</Badge>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── TAB: Profiles ── */}
            <TabsContent value="profiles" className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { key: 'passageiro', label: 'Passageiro', icon: '🚗', description: 'Pode solicitar corridas' },
                  { key: 'motorista', label: 'Motorista', icon: '🚕', description: 'Aceitar corridas' },
                  { key: 'motoboy', label: 'Motoboy', icon: '🏍️', description: 'Fazer entregas' },
                  { key: 'lojista', label: 'Lojista', icon: '🏪', description: 'Solicitar entregas' },
                ].map((profile) => {
                  const active = userData.availableProfiles.includes(profile.key);
                  const cfg = PROFILE_THEME[profile.key === 'lojista' ? 'merchant' : profile.key === 'passageiro' ? 'passenger' : profile.key === 'motorista' ? 'driver' : profile.key];
                  return (
                    <div key={profile.key}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${active
                        ? `${cfg?.bgSoft || 'bg-green-50 dark:bg-green-900/20'} ${cfg?.cardBorder || 'border-green-300'}`
                        : 'bg-muted/30 border-border opacity-60'}`}
                    >
                      <span className="text-2xl">{profile.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{profile.label}</p>
                          <Badge variant={active ? 'default' : 'outline'}
                            className={active ? 'bg-emerald-600 hover:bg-emerald-600 text-[10px]' : 'text-[10px]'}>
                            {active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{profile.description}</p>
                      </div>
                    </div>
                  );
                })}
                {/* Admin */}
                <div className={`flex items-center gap-3 p-3 rounded-lg border sm:col-span-2 ${
                  userData.isAdmin
                    ? `${ADMIN_THEME.bgSoft} ${ADMIN_THEME.cardBorder}`
                    : 'bg-muted/30 border-border opacity-60'
                }`}>
                  <span className="text-2xl">👑</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">Administrador</p>
                      <Badge variant={userData.isAdmin ? 'default' : 'outline'}
                        className={userData.isAdmin ? 'bg-red-600 hover:bg-red-600 text-[10px]' : 'text-[10px]'}>
                        {userData.isAdmin ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Acesso total ao painel administrativo</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── TAB: Groups ── */}
            <TabsContent value="groups" className="mt-4 space-y-4">
              <GroupListSection title="Grupos do Motorista" icon={<MessageSquare className="h-4 w-4 text-primary" />}
                groups={userData.driverGroups} type="driver" iconColor="bg-primary/20"
                updatingGroupId={updatingGroupId} onUpdateStatus={handleUpdateGroupStatus} />
              <GroupListSection title="Grupos do Motoboy" icon={<MessageSquare className="h-4 w-4 text-orange-500" />}
                groups={userData.motoboyGroups} type="motoboy" iconColor="bg-orange-500/20"
                updatingGroupId={updatingGroupId} onUpdateStatus={handleUpdateGroupStatus} />
              <GroupListSection title="Grupos do Lojista" icon={<MessageSquare className="h-4 w-4 text-emerald-500" />}
                groups={userData.merchantGroups} type="merchant" iconColor="bg-emerald-500/20"
                updatingGroupId={updatingGroupId} onUpdateStatus={handleUpdateGroupStatus} />
              {(userData.groups?.length ?? 0) > 0 && (
                <GroupListSection title="Grupos Legados" icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
                  groups={(userData.groups ?? []).map(g => ({ ...g, user_id: g.user_id, cidade: g.name, estado: '', tipo: '', status: '', updated_at: g.created_at }))}
                  type="legacy" iconColor="bg-muted"
                  updatingGroupId={updatingGroupId} onUpdateStatus={handleUpdateGroupStatus} />
              )}
            </TabsContent>

            {/* ── TAB: Credits (Sandbox) ── */}
            <TabsContent value="credits" className="mt-4 space-y-4">
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="p-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-black uppercase tracking-widest">Saldo Sandbox</p>
                    <p className="text-3xl font-black text-amber-500">R$ {userData.availableCredits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <Button asChild variant="outline" className="border-amber-500/30 text-amber-500">
                    <a href="/admin/creditos-teste" className="flex items-center gap-2">
                      <Zap className="h-4 w-4" /> Gerenciar Créditos
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-black flex items-center gap-2 uppercase tracking-tight">
                    <FileText className="h-4 w-4" /> Histórico Recente (Sandbox)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {userData.creditHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-xs text-muted-foreground uppercase tracking-widest font-black">Nenhuma movimentação</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="border-b border-border/40 text-muted-foreground uppercase font-black">
                            <th className="text-left py-2">Data</th>
                            <th className="text-left py-2">Origem</th>
                            <th className="text-right py-2">Valor</th>
                            <th className="text-right py-2">Saldo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                          {userData.creditHistory.map((tx) => (
                            <tr key={tx.id} className="hover:bg-muted/30">
                              <td className="py-2 text-muted-foreground">
                                {new Date(tx.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-2 font-bold">{tx.source_type}</td>
                              <td className={`py-2 text-right font-black ${tx.entry_type === 'credit' ? 'text-emerald-500' : 'text-red-500'}`}>
                                {tx.entry_type === 'credit' ? '+' : '-'} R$ {Number(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 text-right font-bold">R$ {Number(tx.balance_after).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── TAB: Commission Override ── */}
            <TabsContent value="commission" className="mt-4">
              <Card className={theme.cardBorder}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Percent className="h-5 w-5" /> Override Manual de Taxa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className={`text-4xl font-bold ${theme.accentText}`}>{userData.commissionRate}%</div>
                    {userData.override
                      ? <Badge variant="secondary">Taxa personalizada ativa</Badge>
                      : <Badge variant="outline">Taxa automática</Badge>
                    }
                  </div>
                  <div className="border-t border-border/40 pt-4">
                    <Label className="mb-2 block text-sm">Definir Override Manual</Label>
                    <div className="flex gap-2">
                      <Input type="number" placeholder="Ex: 10" value={customRate}
                        onChange={(e) => setCustomRate(e.target.value)} min="0" max="100" step="0.01" className="w-32" />
                      <span className="flex items-center text-muted-foreground">%</span>
                      <Button onClick={handleSetOverride} disabled={isSaving || !customRate} size="sm">
                        <Save className="h-4 w-4 mr-1" /> Definir
                      </Button>
                      {userData.override && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={isSaving}>
                              <X className="h-4 w-4 mr-1" /> Remover
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover taxa personalizada?</AlertDialogTitle>
                              <AlertDialogDescription>A taxa voltará a ser calculada automaticamente.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={handleRemoveOverride}>Remover</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function KpiCard({ icon, label, value, accent, bgSoft, border, extra }: {
  icon: React.ReactNode; label: string; value: string; accent: string; bgSoft: string; border: string; extra?: string;
}) {
  return (
    <Card className={`${border} overflow-hidden`}>
      <CardContent className={`p-4 ${bgSoft}`}>
        <div className={`flex items-center gap-2 mb-1 ${accent}`}>
          {icon}
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
        </div>
        <div className={`text-2xl font-bold ${accent}`}>{value}</div>
        {extra && <span className="text-[10px] text-muted-foreground">{extra}</span>}
      </CardContent>
    </Card>
  );
}

function MiniKpi({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-2">
      <div className={color}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <p className={`text-sm font-bold ${color} truncate`}>{value}</p>
      </div>
    </div>
  );
}

function GroupBreakdownCard({ label, total, active, icon, accent }: {
  label: string; total: number; active: number; icon: React.ReactNode; accent: string;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 mb-2 ${accent}`}>
          {icon}
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Total</p>
            <p className="text-lg font-bold">{total}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Ativos</p>
            <p className={`text-lg font-bold ${accent}`}>{active}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupListSection({ title, icon, groups, type, iconColor, updatingGroupId, onUpdateStatus }: {
  title: string; icon: React.ReactNode; groups: GroupWithStatus[]; type: string; iconColor: string;
  updatingGroupId: string | null; onUpdateStatus: (id: string, status: 'ativo' | 'rejeitado') => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">{icon} {title} ({groups.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-center py-6 text-sm">Nenhum grupo cadastrado</p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => {
              const statusConfig = STATUS_CONFIG[group.status] || STATUS_CONFIG.em_analise;
              return (
                <div key={group.id} className="flex items-center justify-between p-3 bg-secondary/40 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-full ${iconColor} p-2`}>{icon}</div>
                    <div>
                      <p className="font-medium text-sm">{group.cidade}{group.estado ? `, ${group.estado}` : ''}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.tipo || 'Geral'} • {new Date(group.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {type === 'driver' && group.status === 'em_analise' ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 gap-1 border-amber-500 text-amber-600"
                            disabled={updatingGroupId === group.id}>
                            {updatingGroupId === group.id
                              ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              : <>Em análise <ChevronDown className="h-3 w-3" /></>}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onUpdateStatus(group.id, 'ativo')} className="text-green-600">
                            <Check className="h-4 w-4 mr-2" /> Aceitar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onUpdateStatus(group.id, 'rejeitado')} className="text-red-600">
                            <XCircle className="h-4 w-4 mr-2" /> Rejeitar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : group.status ? (
                      <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                    ) : null}
                    {group.link && (
                      <a href={group.link} target="_blank" rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
