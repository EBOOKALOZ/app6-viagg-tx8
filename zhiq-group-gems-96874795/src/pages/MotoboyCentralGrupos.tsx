import { useState } from 'react';
import {
  Crown, TrendingDown, Users, Shield, Target, Zap, AlertTriangle,
  CheckCircle, Clock, MapPin, PiggyBank, BookOpen, History,
  ChevronRight, Loader2, Send, Eye, XCircle, Sparkles, ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useMotoboyCommission, type GroupDetail } from '@/hooks/useMotoboyCommission';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Tier config ─────────────────────────────────────────────────────────────
const TIERS = [
  { min: 3, label: 'Elite', icon: Crown, gradient: 'from-amber-400 to-yellow-500' },
  { min: 2, label: 'Ouro', icon: Shield, gradient: 'from-yellow-500 to-amber-600' },
  { min: 1, label: 'Prata', icon: Target, gradient: 'from-slate-300 to-slate-400' },
  { min: 0, label: 'Bronze', icon: Users, gradient: 'from-orange-400 to-orange-600' },
];

const COMMISSION_LADDER = [
  { groups: 0, rate: 25, label: '0 grupos', color: 'bg-red-500' },
  { groups: 1, rate: 18, label: '1 grupo', color: 'bg-orange-500' },
  { groups: 2, rate: 12, label: '2 grupos', color: 'bg-amber-500' },
  { groups: 3, rate: 6, label: '3 grupos', color: 'bg-emerald-500', best: true },
];

// ─── Section Card shell ──────────────────────────────────────────────────────
function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn(
      'border-0 bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden',
      className
    )}>
      {children}
    </Card>
  );
}

function CardLabel({ icon: Icon, label, badge }: { icon: any; label: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-bold text-foreground uppercase tracking-wide">{label}</span>
      </div>
      {badge}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function MotoboyCentralGrupos() {
  const { user } = useAuth();
  const commission = useMotoboyCommission(user?.id);

  // Campaign queue for the motoboy
  const { data: campaignQueue = [] } = useQuery({
    queryKey: ['motoboy-panel-queue', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('campaign_queue') as any)
        .select('id, title, campaign_type, target_city, status, scheduled_for, posted_at')
        .in('status', ['pending', 'scheduled', 'processing', 'posted'])
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) { console.error('[CentralGrupos] queue error:', error); return []; }
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Posting history for the motoboy
  const { data: postingHistory = [] } = useQuery({
    queryKey: ['motoboy-panel-history', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('posting_history') as any)
        .select('id, title, campaign_type, target_city, final_status, posted_at, error_message')
        .eq('operator_user_id', user?.id)
        .order('posted_at', { ascending: false })
        .limit(5);
      if (error) { console.error('[CentralGrupos] history error:', error); return []; }
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Derived data
  const tier = TIERS.find(t => commission.validForCommission >= t.min) || TIERS[TIERS.length - 1];
  const TierIcon = tier.icon;
  const currentLadderIndex = COMMISSION_LADDER.findIndex(t => t.groups === Math.min(commission.validForCommission, 3));

  const pendingCampaigns = campaignQueue.filter((c: any) => c.status === 'pending' || c.status === 'scheduled');
  const completedCampaigns = campaignQueue.filter((c: any) => c.status === 'posted');

  // Smart recommendation
  const getRecommendation = () => {
    if (commission.atRiskGroups > 0)
      return { text: `${commission.atRiskGroups} grupo(s) sem postagem recente — poste agora para manter validade!`, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-500/10' };
    if (commission.pendingGroups > 0)
      return { text: `${commission.pendingGroups} grupo(s) aguardando aprovação. Aguarde a validação.`, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-500/10' };
    if (commission.validForCommission < 3)
      return { text: `Cadastre mais ${3 - commission.validForCommission} grupo(s) para atingir comissão Elite de 6%!`, icon: Sparkles, color: 'text-emerald-600', bg: 'bg-emerald-500/10' };
    if (pendingCampaigns.length > 0)
      return { text: `${pendingCampaigns.length} campanha(s) disponível(is) na fila para postagem.`, icon: Send, color: 'text-violet-600', bg: 'bg-violet-500/10' };
    return { text: 'Tudo em dia! Continue mantendo seus grupos ativos.', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-500/10' };
  };
  const rec = getRecommendation();

  // Monthly savings estimate
  const estimatedRevenue = 3500;
  const currentFee = (estimatedRevenue * commission.commissionRate) / 100;
  const eliteFee = (estimatedRevenue * 6) / 100;
  const potentialSavings = currentFee - eliteFee;

  if (commission.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50/50 to-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Carregando painel operacional...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-50/50 to-background dark:from-emerald-950/20 p-4 space-y-4 pb-24">

      {/* ═══════════ HERO — COMMISSION ═══════════ */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_60%)]" />
        <CardContent className="relative p-6">
          <div className="flex items-center justify-between mb-3">
            <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r', tier.gradient)}>
              <TierIcon className="h-4 w-4" /><span>{tier.label}</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-200 text-sm">
              <Users className="h-4 w-4" />
              <span>{Math.min(commission.validForCommission, 3)}/3 válidos</span>
            </div>
          </div>
          <div className="text-center mb-4">
            <p className="text-emerald-200 text-sm mb-1">Sua comissão atual</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-6xl font-black tracking-tight">{commission.commissionRate}%</span>
              {commission.commissionRate > 6 && <TrendingDown className="h-7 w-7 text-emerald-300 animate-bounce" />}
            </div>
            {commission.nextTierRate !== null ? (
              <p className="text-emerald-100 text-sm mt-2">
                +{commission.groupsToNextTier} grupo(s) válido(s) para chegar a <strong>{commission.nextTierRate}%</strong>
              </p>
            ) : (
              <p className="text-emerald-100 text-sm mt-2 font-semibold">🏆 Comissão mínima atingida!</p>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-emerald-200">
              <span>Meta Elite 6%</span>
              <span>{Math.min(commission.validForCommission, 3)}/3</span>
            </div>
            <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-300 to-white rounded-full transition-all duration-700"
                style={{ width: `${Math.min((commission.validForCommission / 3) * 100, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════ ROW 1: Grupos Válidos + Ação Recomendada ═══════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Card: Grupos Válidos */}
        <SectionCard>
          <CardContent className="p-5">
            <CardLabel icon={Users} label="Grupos Válidos" badge={
              <Badge variant="outline" className="text-[10px]">{commission.totalGroups} total</Badge>
            } />
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-center">
                <p className="text-2xl font-black text-emerald-600">{commission.validForCommission}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Válidos</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 text-center">
                <p className="text-2xl font-black text-amber-600">{commission.pendingGroups}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Pendentes</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10 text-center">
                <p className="text-2xl font-black text-blue-600">{commission.activeGroups}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Ativos</p>
              </div>
              <div className="p-3 rounded-xl bg-red-500/10 text-center">
                <p className="text-2xl font-black text-red-600">{commission.expiredGroups}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Inativos</p>
              </div>
            </div>
          </CardContent>
        </SectionCard>

        {/* Card: Próxima Ação Recomendada */}
        <SectionCard>
          <CardContent className="p-5">
            <CardLabel icon={Zap} label="Ação Recomendada" />
            <div className={cn('flex items-start gap-3 p-4 rounded-xl', rec.bg)}>
              <div className="p-2 rounded-lg bg-card shadow-sm shrink-0">
                <rec.icon className={cn('h-5 w-5', rec.color)} />
              </div>
              <div>
                <p className={cn('text-sm font-semibold', rec.color)}>{rec.text}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Recomendação baseada no estado atual dos seus grupos.</p>
              </div>
            </div>
          </CardContent>
        </SectionCard>
      </div>

      {/* ═══════════ ROW 2: Em Risco + Fila + Histórico ═══════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Card: Grupos em Risco */}
        <SectionCard>
          <CardContent className="p-5">
            <CardLabel icon={AlertTriangle} label="Grupos em Risco" badge={
              commission.atRiskGroups > 0
                ? <Badge className="bg-red-500/20 text-red-600 border-red-500/30 text-[10px]">{commission.atRiskGroups} atenção</Badge>
                : <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-[10px]">OK</Badge>
            } />
            {commission.atRiskGroups === 0 ? (
              <div className="flex flex-col items-center py-4 text-center">
                <CheckCircle className="h-8 w-8 text-emerald-400 mb-2" />
                <p className="text-sm font-semibold text-emerald-600">Nenhum grupo em risco</p>
                <p className="text-[10px] text-muted-foreground mt-1">Seus grupos estão saudáveis.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {commission.groups
                  .filter(g => {
                    const cutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
                    return g.is_active && g.validation_status === 'approved' && (!g.last_posted_at || g.last_posted_at < cutoff);
                  })
                  .slice(0, 3)
                  .map(g => (
                    <div key={g.id} className="flex items-center justify-between p-2.5 rounded-lg bg-red-500/5 border border-red-500/10">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{g.group_name || g.city_name || 'Grupo'}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {g.members_count} membros • {g.last_posted_at ? `Última: ${new Date(g.last_posted_at).toLocaleDateString()}` : 'Sem postagem'}
                        </p>
                      </div>
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </SectionCard>

        {/* Card: Fila de Postagens */}
        <SectionCard>
          <CardContent className="p-5">
            <CardLabel icon={Send} label="Fila de Postagens" badge={
              <Badge variant="outline" className="text-[10px]">{pendingCampaigns.length} disponíveis</Badge>
            } />
            {pendingCampaigns.length === 0 ? (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="p-3 rounded-full bg-muted/50 mb-2"><Send className="h-5 w-5 text-muted-foreground" /></div>
                <p className="text-sm font-semibold text-muted-foreground">Fila vazia</p>
                <p className="text-[10px] text-muted-foreground mt-1">Novas campanhas aparecerão aqui.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingCampaigns.slice(0, 3).map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/10">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{c.title || 'Campanha'}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{c.target_city || '—'}
                      </p>
                    </div>
                    <Badge className="text-[9px] bg-violet-500/10 text-violet-600 border-violet-500/20">{c.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </SectionCard>

        {/* Card: Histórico de Postagens */}
        <SectionCard>
          <CardContent className="p-5">
            <CardLabel icon={History} label="Histórico" badge={
              <Badge variant="outline" className="text-[10px]">{postingHistory.length} registros</Badge>
            } />
            {postingHistory.length === 0 ? (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="p-3 rounded-full bg-muted/50 mb-2"><History className="h-5 w-5 text-muted-foreground" /></div>
                <p className="text-sm font-semibold text-muted-foreground">Sem histórico</p>
                <p className="text-[10px] text-muted-foreground mt-1">Postagens confirmadas aparecem aqui.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {postingHistory.slice(0, 4).map((h: any) => {
                  const ok = h.final_status === 'posted' || h.final_status === 'postado';
                  return (
                    <div key={h.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{h.title || 'Postagem'}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {h.posted_at ? new Date(h.posted_at).toLocaleDateString() : '—'} • {h.target_city || '—'}
                        </p>
                      </div>
                      <Badge className={cn(
                        'text-[9px] border-0',
                        ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
                      )}>
                        {ok ? <CheckCircle className="h-3 w-3 mr-0.5" /> : <XCircle className="h-3 w-3 mr-0.5" />}
                        {h.final_status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </SectionCard>
      </div>

      {/* ═══════════ ROW 3: Força Territorial + Impacto no Ganho + Regras ═══════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Card: Força Territorial */}
        <SectionCard>
          <CardContent className="p-5">
            <CardLabel icon={MapPin} label="Força Territorial" />
            {Object.keys(commission.groupsByRegion).length === 0 ? (
              <div className="flex flex-col items-center py-4 text-center">
                <MapPin className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Cadastre grupos para ver sua presença regional.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(commission.groupsByRegion).map(([region, data]) => {
                  const strength = data.valid >= 2 ? 'Forte' : data.valid === 1 ? 'Média' : 'Fraca';
                  const color = data.valid >= 2 ? 'text-emerald-600' : data.valid === 1 ? 'text-amber-600' : 'text-red-500';
                  const bg = data.valid >= 2 ? 'bg-emerald-500/10' : data.valid === 1 ? 'bg-amber-500/10' : 'bg-red-500/10';
                  return (
                    <div key={region} className={cn('flex items-center justify-between p-3 rounded-xl', bg)}>
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className={cn('h-4 w-4 shrink-0', color)} />
                        <div>
                          <p className="text-sm font-semibold truncate">{region}</p>
                          <p className="text-[10px] text-muted-foreground">{data.total} grupo(s) • {data.valid} válido(s)</p>
                        </div>
                      </div>
                      <Badge className={cn('text-[9px] border-0', bg, color)}>{strength}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </SectionCard>

        {/* Card: Impacto no Ganho */}
        <SectionCard>
          <CardContent className="p-5">
            <CardLabel icon={PiggyBank} label="Impacto no Ganho" />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-red-500/5 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Taxa atual/mês</p>
                  <p className="text-lg font-black text-red-600">-R$ {currentFee.toFixed(0)}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/5 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Economia potencial</p>
                  <p className="text-lg font-black text-emerald-600">+R$ {potentialSavings > 0 ? potentialSavings.toFixed(0) : '0'}</p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-primary/5 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Comissão {commission.commissionRate}%</span>
                  <span className="font-bold text-primary flex items-center gap-1">
                    <ArrowRight className="h-3 w-3" /> 6% Elite
                  </span>
                </div>
                <Progress value={Math.min(((25 - commission.commissionRate) / (25 - 6)) * 100, 100)} className="h-2" />
              </div>
              <p className="text-[10px] text-center text-muted-foreground">
                *Baseado em faturamento estimado de R$ {estimatedRevenue.toLocaleString('pt-BR')}
              </p>
            </div>
          </CardContent>
        </SectionCard>

        {/* Card: Regras de Validação */}
        <SectionCard>
          <CardContent className="p-5">
            <CardLabel icon={BookOpen} label="Regras de Validação" />
            <div className="space-y-2">
              {[
                { rule: 'Mínimo 90 membros no grupo', icon: Users },
                { rule: 'Grupo ativo (não silenciado)', icon: CheckCircle },
                { rule: 'Postagem recente (últimos 30 dias)', icon: Send },
                { rule: 'Link válido do WhatsApp', icon: Eye },
                { rule: 'Aprovação pela equipe', icon: Shield },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="p-1 rounded bg-primary/10 shrink-0">
                    <item.icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <p className="text-xs text-foreground">{item.rule}</p>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground pt-1 border-t mt-2">
                Grupos que atendem todos os critérios contam para redução da comissão.
              </p>
            </div>
          </CardContent>
        </SectionCard>
      </div>

      {/* ═══════════ ESCADA DE COMISSÕES ═══════════ */}
      <SectionCard>
        <CardContent className="p-5">
          <CardLabel icon={Crown} label="Escada de Comissões" />
          <div className="space-y-1.5">
            {COMMISSION_LADDER.map((step, index) => {
              const isCurrent = index === currentLadderIndex;
              const isPast = index < currentLadderIndex;
              const isFuture = index > currentLadderIndex;
              return (
                <div key={step.groups} className={cn(
                  'relative flex items-center justify-between p-3 rounded-xl transition-all duration-300',
                  isCurrent && 'bg-gradient-to-r from-emerald-100 to-emerald-50 dark:from-emerald-900/40 border-2 border-emerald-500 shadow-md scale-[1.02]',
                  isPast && 'bg-emerald-50/50 dark:bg-emerald-950/20 opacity-60',
                  isFuture && 'bg-muted/30 opacity-70',
                  step.best && isFuture && 'border border-amber-300 dark:border-amber-700 bg-amber-50/50 opacity-100'
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold',
                      isCurrent && 'bg-emerald-500 text-white',
                      isPast && 'bg-emerald-200 text-emerald-700',
                      isFuture && !step.best && 'bg-muted text-muted-foreground',
                      step.best && isFuture && 'bg-amber-400 text-amber-950'
                    )}>
                      {isPast ? <CheckCircle className="h-4 w-4" /> : step.best ? <Crown className="h-4 w-4" /> : step.groups}
                    </div>
                    <span className={cn(
                      'text-sm font-medium',
                      isCurrent && 'text-emerald-800 dark:text-emerald-200 font-semibold',
                      isPast && 'text-emerald-600',
                      isFuture && 'text-muted-foreground'
                    )}>{step.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-lg font-bold tabular-nums',
                      isCurrent && 'text-emerald-700',
                      isPast && 'text-emerald-500',
                      isFuture && !step.best && 'text-muted-foreground',
                      step.best && isFuture && 'text-amber-600'
                    )}>{step.rate}%</span>
                    {isCurrent && <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase">Atual</span>}
                    {step.best && isFuture && <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-bold uppercase">Meta</span>}
                  </div>
                  {isCurrent && (
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2">
                      <ChevronRight className="h-5 w-5 text-emerald-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </SectionCard>

    </div>
  );
}
