import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useMotoboyCommission } from '@/hooks/useMotoboyCommission';
import { supabase } from '@/integrations/supabase/client';
import { deriveVisualStatus } from '@/lib/groupStatusUtils';
import { geocodeAddress } from '@/lib/map/GeoLocationService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { toast } from 'sonner';
import {
  Plus, MessageSquare, ExternalLink, CheckCircle, Clock, XCircle,
  TrendingDown, Shield, ClipboardList, Trash2, AlertTriangle,
  History, Trophy, Zap, Info, ShieldAlert, ArrowUpRight, Users
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';
import { SafeErrorBoundary } from '@/components/SafeErrorBoundary';
import { TierLadderCard } from '@/components/motoboy/TierLadderCard';
import { useTierPromotionToast } from '@/hooks/useTierPromotionToast';
import { cn } from '@/lib/utils';

// ==========================================
// INTERFACES & CONFIG
// ==========================================
interface ProfileGroup {
  id: string;
  owner_user_id: string;
  group_link: string;
  group_name: string;
  city_name: string;
  state_code: string;
  neighborhood: string;
  status: string; // visual derived status
  created_at: string;
  updated_at: string;
  members_count: number;
  last_posted_at: string | null;
  invalid_reason: string | null;
  is_valid: boolean;
  valid_for_commission: boolean;
  // Legacy aliases for display compatibility
  link: string;
  cidade: string;
  estado: string;
  tipo: string;
  member_count: number;
  last_post_subject: string | null;
  min_members_valid: boolean;
  radar_scores?: {
    recommendation: string;
    factors: any;
  } | null;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; colorClass: string; bgClass: string; borderClass: string }> = {
  ativo: { label: 'Ativo e Validado', icon: <CheckCircle className="h-4 w-4" />, colorClass: 'text-emerald-500', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/20' },
  em_analise: { label: 'Em Auditoria', icon: <Clock className="h-4 w-4" />, colorClass: 'text-amber-500', bgClass: 'bg-amber-500/10', borderClass: 'border-amber-500/20' },
  bloqueado: { label: 'Bloqueado', icon: <XCircle className="h-4 w-4" />, colorClass: 'text-red-500', bgClass: 'bg-red-500/10', borderClass: 'border-red-500/20' },
  inativo: { label: 'Inativo', icon: <ShieldAlert className="h-4 w-4" />, colorClass: 'text-orange-600', bgClass: 'bg-orange-600/10', borderClass: 'border-orange-500/20' },
  expirado: { label: 'Expirado', icon: <ShieldAlert className="h-4 w-4" />, colorClass: 'text-gray-500', bgClass: 'bg-gray-500/10', borderClass: 'border-gray-500/20' },
};

const MIN_COMMISSION = 6;
const MAX_COMMISSION = 25;

// Helper para dias inativos
const getDaysInactive = (lastPostedDate: string | null): number => {
  if (!lastPostedDate) return 999;
  const last = new Date(lastPostedDate);
  const diffTime = Math.abs(new Date().getTime() - last.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getDetailedRejectionReason = (group: ProfileGroup) => {
  let reason = "";

  if (group.members_count <= 90) {
    reason = "Rejeitado: O grupo possui menos de 91 membros. ";
  } else if (!group.radar_scores) {
    return null;
  } else {
    const { recommendation, factors } = group.radar_scores;
    if (recommendation === 'link_invalido' || factors?.link_invalido) {
      reason = "Rejeitado: Link de convite inválido ou revogado. ";
    } else if (recommendation === 'grupo_duplicado') {
      reason = "Rejeitado: Este link de grupo já está cadastrado no sistema. ";
    } else if (recommendation === 'grupo_abandonado') {
      reason = "Rejeitado: Grupo sem postagens recentes. ";
    } else if (recommendation === 'grupo_suspeito' || factors?.membros_implausiveis) {
      reason = "Rejeitado: Contagem de membros implausível. ";
    } else if (factors?.nome_divergente) {
      reason = "Rejeitado: Nome real do grupo difere muito do cadastrado. ";
    }
  }

  if (reason) {
    return reason + "O grupo deve ter no mínimo 1 postagem por semana de qualquer outros de seus membros.";
  }

  return null;
};

export default function MotoboyGroupsContent() {
  const { user, activeProfile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { commissionRate, activeGroups, validForCommission, isLoading: isCommissionLoading } = useMotoboyCommission(user?.id);

  // Toast celebrativo quando sobe (ou alerta quando cai) de tier
  useTierPromotionToast(user?.id, validForCommission);
  const [groups, setGroups] = useState<ProfileGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog States
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newGroupLink, setNewGroupLink] = useState('');
  const [newGroupCidade, setNewGroupCidade] = useState('');
  const [newGroupTipo, setNewGroupTipo] = useState('Geral');
  const [newGroupMembros, setNewGroupMembros] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkDuplicateError, setLinkDuplicateError] = useState<string | null>(null);


  // Derived Stats from LOCAL groups (for the group list cards below)
  const localValidGroupsCount = groups.filter(g => g.valid_for_commission).length;
  const invalidGroupsCount = groups.filter(g => g.status === 'bloqueado' || g.status === 'inativo' || g.status === 'expirado').length;
  const atRiskGroupsCount = groups.filter(g => g.status === 'ativo' && getDaysInactive(g.last_posted_at) > 20 && getDaysInactive(g.last_posted_at) <= 30).length;
  const pendingGroupCount = groups.filter(g => g.status === 'em_analise').length;

  // Commission card uses THE HOOK as single source of truth
  // (not the local groups array, which can be stale)
  const validGroupsCount = validForCommission ?? localValidGroupsCount;
  const rate = commissionRate ?? MAX_COMMISSION;
  const progress = Math.round(((MAX_COMMISSION - rate) / (MAX_COMMISSION - MIN_COMMISSION)) * 100);

  const fetchGroups = useCallback(async () => {
    if (!user || (activeProfile !== 'motoboy' && activeProfile !== 'mototaxi')) {
      setGroups([]);
      setIsLoading(false);
      return;
    }

    try {
      // Query using REAL column names from public.whatsapp_groups
      const { data: wpData, error: wpError } = await (supabase
        .from('whatsapp_groups') as any)
        .select(`
          id, owner_user_id, group_name, group_link, neighborhood,
          city_name, state_code, members_count,
          validation_status, is_active, is_valid, valid_for_commission,
          invalid_reason, last_posted_at, created_at, updated_at,
          radar_group_scores ( recommendation, factors )
        `)
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false });

      if (wpError) {
        console.error('[MotoboyGroups] Query error:', wpError);
        toast.error(`Erro ao carregar seus grupos: ${wpError.message}`);
        return;
      }

      console.log('[MotoboyGroups] Loaded groups:', wpData?.length, wpData);

      const mapped: ProfileGroup[] = (wpData || []).map((g: any) => {
        const visualStatus = deriveVisualStatus(g);

        return {
          id: g.id,
          owner_user_id: g.owner_user_id,
          group_link: g.group_link || '',
          group_name: g.group_name || g.city_name || 'Sem nome',
          city_name: g.city_name || 'Desconhecida',
          state_code: g.state_code || '',
          neighborhood: g.neighborhood || '',
          status: visualStatus,
          created_at: g.created_at,
          updated_at: g.updated_at || g.created_at,
          members_count: g.members_count || 0,
          last_posted_at: g.last_posted_at || null,
          invalid_reason: g.invalid_reason || null,
          radar_scores: Array.isArray(g.radar_group_scores) ? g.radar_group_scores[0] : (g.radar_group_scores || null),
          is_valid: Boolean(g.is_valid),
          valid_for_commission: Boolean(g.valid_for_commission),
          // Legacy aliases for display compatibility
          link: g.group_link || '',
          cidade: g.city_name || 'Desconhecida',
          estado: g.state_code || '',
          tipo: g.neighborhood || 'Geral',
          member_count: g.members_count || 0,
          last_post_subject: null,
          min_members_valid: (g.members_count || 0) >= 90,
        };
      });

      setGroups(mapped);
    } catch (error) {
      console.error("Erro ao processar grupos:", error);
      toast.error('Erro ao processar seus grupos.');
    } finally {
      setIsLoading(false);
    }
  }, [user, activeProfile]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Realtime: keep list + commission in sync on ANY whatsapp_groups change
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`groups-list-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_groups' },
        (payload: any) => {
          console.log('[MotoboyGroups Realtime] Change detected, refreshing list + commission:', payload.eventType);
          fetchGroups();
          queryClient.invalidateQueries({ queryKey: ['motoboy-commission', user.id] });
        }
      )
      .subscribe((status: string) => {
        console.log('[MotoboyGroups Realtime] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchGroups, queryClient]);

  const inactiveStatuses = ['inativo', 'bloqueado', 'expirado'];
  const inactiveGroups = groups.filter(g => inactiveStatuses.includes(g.status));

  const handleClearInactiveGroups = async () => {
    if (!user) return;
    if (inactiveGroups.length === 0) {
      toast.info('Nenhum grupo inativo para limpar.');
      return;
    }
    const confirmMsg =
      inactiveGroups.length === 1
        ? 'Excluir definitivamente o grupo inativo? Esta ação remove o grupo permanentemente do sistema.'
        : `Excluir definitivamente os ${inactiveGroups.length} grupos inativos? Esta ação remove os grupos permanentemente do sistema.`;
    if (!confirm(confirmMsg)) return;

    try {
      const ids = inactiveGroups.map(g => g.id);
      const { error } = await (supabase
        .from('whatsapp_groups') as any)
        .delete()
        .in('id', ids);

      if (error) throw error;
      setGroups(prev => prev.filter(g => !ids.includes(g.id)));
      toast.success(`${ids.length} grupo${ids.length > 1 ? 's' : ''} inativo${ids.length > 1 ? 's' : ''} excluído${ids.length > 1 ? 's' : ''} definitivamente.`);
      fetchGroups();
      queryClient.invalidateQueries({ queryKey: ['motoboy-commission', user.id] });
    } catch (err: any) {
      console.error('[clearInactive] error:', err);
      toast.error(`Erro ao excluir inativos: ${err?.message || 'erro desconhecido'}`);
    }
  };

  const handleAddGroup = async () => {
    if (!user) return;
    if (!newGroupLink.trim() || !newGroupCidade) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    // REGRA CENTRAL DO RADAR IA (91+ membros) — validação espelho do banco:
    // o trigger recusa QUALQUER aprovação com ≤90, venha de onde vier.
    const membros = parseInt(newGroupMembros, 10);
    if (!Number.isFinite(membros) || membros <= 90) {
      setLinkDuplicateError(
        `Grupo reprovado pelo RADAR IA. Quantidade mínima exigida: 91 membros (informado: ${Number.isFinite(membros) ? membros : 0}).`,
      );
      return;
    }
    setIsSubmitting(true);
    setLinkDuplicateError(null);

    try {
      // Exclusividade: só bloqueia se o link estiver ATIVO com alguém.
      // Grupo desativado (o dono saiu) fica LIVRE para outro vincular.
      const { data: existing } = await (supabase
        .from('whatsapp_groups') as any)
        .select('id, owner_user_id')
        .eq('group_link', newGroupLink.trim())
        .eq('is_active', true)
        .maybeSingle();

      if (existing) {
        setLinkDuplicateError(
          existing.owner_user_id === user.id
            ? 'Você já tem este grupo ativo.'
            : 'Este grupo já está ativo com outro profissional. Ele só fica disponível se o profissional atual sair (desativar o grupo).',
        );
        setIsSubmitting(false);
        return;
      }

      // Raio de 100 km: geocodifica a cidade/bairro do grupo — o banco
      // recusa vínculos fora da área de atuação e a localização é
      // requisito para o grupo CONTAR na comissão.
      const geo = await geocodeAddress(newGroupCidade).catch(() => []);
      const loc = geo?.[0]?.latLng;
      if (!loc) {
        setLinkDuplicateError(
          'Não encontrei essa cidade/bairro no mapa. Confira o nome (ex.: "Centro, Cuiabá - MT").',
        );
        setIsSubmitting(false);
        return;
      }

      const { data, error } = await (supabase
        .from('whatsapp_groups') as any)
        .insert({
          // ATENÇÃO: a tabela NÃO tem coluna user_id — o dono é owner_user_id.
          // (Enviar user_id fazia o banco recusar o insert inteiro.)
          owner_user_id: user.id,
          group_link: newGroupLink.trim(),
          city_name: newGroupCidade,
          group_name: newGroupCidade, // use city as default name
          members_count: membros,
          latitude: loc.lat,
          longitude: loc.lng,
          validation_status: 'approved',
          is_active: true,
          // is_valid and valid_for_commission are computed by the
          // backend trigger enforce_group_validity — do NOT set here.
          last_posted_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      // Trata violação de UNIQUE (código 23505) — defesa contra corrida concorrente
      // que passou pela checagem JS acima.
      if (error?.code === '23505' || /duplicate key|unique/i.test(error?.message || '')) {
        setLinkDuplicateError('Este grupo já está ativo com outro profissional. Ele só fica disponível se o profissional atual sair (desativar o grupo).');
        setIsSubmitting(false);
        return;
      }
      // Regras do banco (raio 100 km / exclusividade / mínimo de membros)
      // chegam como RAISE: mostra a mensagem REAL, nunca um erro genérico.
      if (error && /fora da sua área|já está ativo|90 membros|mínimo/i.test(error.message || '')) {
        setLinkDuplicateError(error.message);
        setIsSubmitting(false);
        return;
      }
      if (error) throw error;
      const created = !!data?.id;

      if (created === false) {
        setLinkDuplicateError('Este link já existe na base ou é inválido para reaproveitamento.');
      } else {
        toast.success('Grupo vinculado com sucesso! Sua comissão foi atualizada.');
        setIsAddDialogOpen(false);
        setNewGroupLink('');
        setNewGroupCidade('');
        setNewGroupMembros('');
        fetchGroups();
        // Force commission recalculation immediately
        queryClient.invalidateQueries({ queryKey: ['motoboy-commission', user.id] });
      }
    } catch (err: any) {
      // NUNCA esconder a causa real (regra do projeto)
      console.error('[handleAddGroup] error:', err);
      setLinkDuplicateError(err?.message || 'Erro na requisição. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 bg-[hsl(var(--motoboy-dashboard-bg))]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-motoboy border-t-transparent" />
      </div>
    );
  }

  return (
    <MotoboyPageTemplate
      title="Sua Rede de Engajamento"
      subtitle="Gerencie seu Ativo Territorial e blinde sua comissão"
      icon={Shield}
      headerRight={
        <div className="flex items-center justify-center gap-2 flex-wrap w-full sm:w-auto">
          <Button
            onClick={() => navigate('/motoboy/impulsionar')}
            size="sm"
            className="bg-[#00a300] hover:bg-[#008c00] text-[#F5E62B] font-black shadow-lg shadow-[#00a300]/30 whitespace-nowrap shrink-0 flex-1 sm:flex-initial justify-center border border-black/15"
          >
            <Zap className="h-4 w-4 mr-1.5 shrink-0 text-white" />
            Central de Impulsionamento
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold border-2 border-yellow-500 hover:border-yellow-400 shadow-md shadow-yellow-400/30 whitespace-nowrap shrink-0 flex-1 sm:flex-initial justify-center">
                <Plus className="h-4 w-4 mr-1 shrink-0" />
                Vincular Grupo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-motoboy" />
                  Vincular Ativo Territorial
                </DialogTitle>
                <p className="text-xs text-muted-foreground pt-2">
                  Anexe um grupo válido da sua região para fortalecer o comércio local e baixar sua tarifa.
                </p>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Link Convite *</Label>
                  <Input value={newGroupLink} onChange={e => setNewGroupLink(e.target.value)} placeholder="https://chat.whatsapp.com/..." className="mt-1" />
                </div>
                <div>
                  <Label>Bairro ou Cidade *</Label>
                  <Input value={newGroupCidade} onChange={e => setNewGroupCidade(e.target.value)} placeholder="Ex: Centro, Cuiabá - MT" className="mt-1" />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    📍 O grupo precisa estar num raio de <strong>100 km</strong> da sua base.
                  </p>
                </div>
                {/* AVISO DE REQUISITO MÍNIMO DE MEMBROS */}
                <div className="p-4 rounded-xl bg-amber-600 border border-amber-500 text-white space-y-2 shadow-sm">
                  <div className="flex items-center gap-2.5 font-bold text-base text-white">
                    <img
                      src="/assets/brand/viagg-tx8-logo-premium.png"
                      alt="Viagg-TX8"
                      className="h-10 w-10 shrink-0 rounded-full object-cover border border-white/40 bg-white shadow-sm"
                    />
                    <span>Aprovação Apenas Acima de 90 Membros</span>
                  </div>
                  <p className="text-xs leading-relaxed text-white">
                    O <strong>Viagg-TX8</strong> audita automaticamente a contagem real de membros e a atividade do grupo. <strong>Grupos com 90 membros ou menos não serão aprovados</strong> para o desconto na comissão.
                  </p>
                </div>
                <div>
                  <Label>Nº de membros do grupo * (mínimo 91)</Label>
                  <Input
                    inputMode="numeric"
                    value={newGroupMembros}
                    onChange={e => setNewGroupMembros(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ex: 250"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={newGroupTipo} onValueChange={setNewGroupTipo}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Geral">Moradores / Geral</SelectItem>
                      <SelectItem value="Regional">Comércio Local</SelectItem>
                      <SelectItem value="Entregas">Motoboys / Entregas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {linkDuplicateError && (
                  <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 text-sm">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>{linkDuplicateError}</p>
                  </div>
                )}
                <Button disabled={isSubmitting} onClick={handleAddGroup} className="w-full bg-motoboy hover:bg-motoboy-hover text-white">
                  {isSubmitting ? 'Verificando...' : 'Enviar para Auditoria Local'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <SafeErrorBoundary>
        <div className="space-y-3 sm:space-y-4 pb-12">

          {/* 1. VISÃO GERAL (O BOLSO) */}
          {(() => {
            const isGoalReached = rate <= MIN_COMMISSION;
            const bgGradient = isGoalReached
              ? 'bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600'
              : 'bg-gradient-to-br from-orange-600 via-orange-500 to-amber-600';
            const decorBlobTop = isGoalReached ? 'bg-white/10' : 'bg-white/10';
            const decorBlobBottom = isGoalReached ? 'bg-emerald-400/20' : 'bg-amber-400/20';
            const subtitleColor = isGoalReached ? 'text-emerald-100' : 'text-orange-100';
            const bodyColor = isGoalReached ? 'text-emerald-50' : 'text-orange-50';
            const barBg = isGoalReached ? 'bg-emerald-900/40' : 'bg-orange-900/40';
            const barBorder = isGoalReached ? 'border-emerald-300/30' : 'border-orange-300/30';
            const barFill = isGoalReached
              ? 'bg-gradient-to-r from-emerald-300 via-teal-200 to-white'
              : 'bg-gradient-to-r from-amber-300 via-yellow-300 to-white';
            const footerColor = isGoalReached ? 'text-emerald-200' : 'text-orange-200';
            const badgeBg = isGoalReached ? 'bg-white/15' : 'bg-white/15';
            const badgeIcon = isGoalReached ? '🏆' : '';
            const badgeLabel = isGoalReached ? 'Meta Atingida' : 'Proteção de Comissão';
            const auxMessage = isGoalReached
              ? 'Parabéns! Você atingiu a taxa mínima da plataforma.'
              : `Continue fortalecendo sua rede territorial para reduzir sua taxa.`;

            return (
              <Card className="border-0 shadow-xl overflow-hidden cursor-default">
                <div className={`relative ${bgGradient} transition-colors duration-700`}>
                  <div className={`absolute top-0 right-0 w-32 h-32 ${decorBlobTop} rounded-full blur-3xl -translate-y-1/2 translate-x-1/2`} />
                  <div className={`absolute bottom-0 left-0 w-32 h-32 ${decorBlobBottom} rounded-full blur-3xl translate-y-1/2 -translate-x-1/2`} />

                  <CardContent className="relative p-4 sm:p-6">
                    <div className="flex flex-col md:flex-row gap-6 items-center">
                      <div className="flex-1 space-y-2 text-center md:text-left z-10">
                        <Badge variant="outline" className={`border-white/30 text-white ${badgeBg} mb-2 uppercase tracking-wide text-[10px] font-black`}>
                          {isGoalReached ? <CheckCircle className="h-3 w-3 mr-1" /> : <Trophy className="h-3 w-3 mr-1" />}
                          {badgeLabel}
                        </Badge>
                        <div className="flex items-baseline justify-center md:justify-start gap-2">
                          <span className="text-4xl sm:text-5xl font-black text-white">{rate}%</span>
                          <span className={`text-xs sm:text-sm font-medium ${subtitleColor}`}>Taxa TX8 Atual</span>
                        </div>
                        <p className={`text-xs sm:text-sm ${bodyColor}`}>
                          {auxMessage}
                        </p>
                      </div>

                      <div className="flex-1 w-full space-y-3 z-10">
                        <div className="flex justify-between items-end">
                          <span className={`text-xs font-medium ${subtitleColor} uppercase tracking-widest`}>Aproveitamento</span>
                          <span className="text-sm font-bold text-white">{validGroupsCount}/5 Máx</span>
                        </div>
                        <div className={`relative h-3 rounded-full ${barBg} overflow-hidden border ${barBorder}`}>
                          <div
                            className={`h-full ${barFill} transition-all duration-1000`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className={`text-[10px] ${footerColor} text-right`}>Mínimo da plataforma: {MIN_COMMISSION}%</p>
                      </div>
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })()}

          {/* 1.5 ESCADA DE TIERS */}
          <TierLadderCard validGroups={validGroupsCount} />

          {/* 2. DASHBOARD DE STATUS */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Card className="bg-card shadow-sm border-emerald-500/20">
              <CardContent className="p-3 sm:p-4 flex flex-col items-center justify-center">
                <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 mb-1.5 sm:mb-2" />
                <p className="text-2xl sm:text-3xl font-black text-foreground">{validGroupsCount}</p>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Válidos Ouro</p>
              </CardContent>
            </Card>

            <Card className="bg-card shadow-sm border-amber-500/20">
              <CardContent className="p-3 sm:p-4 flex flex-col items-center justify-center">
                <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500 mb-1.5 sm:mb-2" />
                <p className="text-2xl sm:text-3xl font-black text-foreground">{pendingGroupCount}</p>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Em Auditoria</p>
              </CardContent>
            </Card>

            <Card className="bg-card shadow-sm border-orange-500/20 relative overflow-hidden">
              {atRiskGroupsCount > 0 && <span className="absolute top-0 right-0 p-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span></span>}
              <CardContent className="p-3 sm:p-4 flex flex-col items-center justify-center">
                <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-orange-500 mb-1.5 sm:mb-2" />
                <p className="text-2xl sm:text-3xl font-black text-foreground">{atRiskGroupsCount}</p>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Risco Inatividade</p>
              </CardContent>
            </Card>

            <Card className="bg-card shadow-sm border-red-500/20 opacity-80">
              <CardContent className="p-3 sm:p-4 flex flex-col items-center justify-center">
                <XCircle className="h-5 w-5 sm:h-6 sm:w-6 text-red-500 mb-1.5 sm:mb-2" />
                <p className="text-2xl sm:text-3xl font-black text-foreground">{invalidGroupsCount}</p>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Inválidos / Punidos</p>
              </CardContent>
            </Card>
          </div>

          {/* Alertas Rápidos (se houver risco) */}
          {atRiskGroupsCount > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 sm:p-4 flex gap-2 sm:gap-3 shadow-md">
              <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-orange-700 dark:text-orange-400">Ação Necessária Imediata</p>
                <p className="text-xs text-orange-600 dark:text-orange-300 mt-0.5 sm:mt-1 leading-tight">
                  Você tem {atRiskGroupsCount} grupo(s) sem postagem válida há mais de 20 dias. Se passarem de 30 dias, eles perdem validade e sua taxa na plataforma sobe automaticamente. Abra o <b>Postador</b>.
                </p>
              </div>
            </div>
          )}

          {/* 3. LISTA DETALHADA: INVENTÁRIO DO ATIVO */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-3 px-1">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-motoboy" />
                <h3 className="text-sm font-bold text-foreground tracking-wide">Inventário Operacional</h3>
              </div>
              {inactiveGroups.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleClearInactiveGroups}
                  className="bg-[#F5E62B] border-[#F5E62B] text-red-600 hover:bg-[#f0e000] hover:border-[#f0e000] hover:text-red-700 h-8 px-3 text-xs font-semibold"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Limpar Inativos ({inactiveGroups.length})
                </Button>
              )}
            </div>

            {!groups.length ? (
              <Card className="border-dashed border-2 bg-transparent shadow-none">
                <CardContent className="flex flex-col items-center py-10 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="font-semibold text-muted-foreground">Sem ativos locais.</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">Anexe grupos da sua região para baixar o custo das transações e ganhar prioridade algorítmica.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => {
                  const cfg = statusConfig[group.status] || statusConfig['em_analise'];
                  const daysInactive = getDaysInactive(group.last_posted_at);

                  // Color map para régua 30/60/90 (Foco: <=30 ativo. >30 perde validade)
                  const isCritical = daysInactive > 20 && daysInactive <= 30;
                  const isLost = daysInactive > 30 && daysInactive !== 999;

                  return (
                    <Card key={group.id} className="bg-card shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-4">

                        {/* HEADER DO CARD */}
                        <div className="flex items-start justify-between border-b pb-3 mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-sm text-foreground">{group.cidade}</h4>
                              <div className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border", cfg.bgClass, cfg.colorClass, cfg.borderClass)}>
                                {cfg.icon} {cfg.label}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                              <span className={cn("flex items-center font-semibold", group.min_members_valid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
                                <Users className="h-3.5 w-3.5 mr-1" /> {group.member_count} membros {group.min_members_valid ? '✅' : '❌'}
                              </span>
                              <span className="flex items-center text-primary/70">
                                <ArrowUpRight className="h-3.5 w-3.5 mr-1" /> {group.tipo}
                              </span>
                            </div>
                          </div>

                          {/* ACÇÕES RÁPIDAS */}
                          <div className="flex gap-2">
                            <a href={group.link} target="_blank" rel="noopener noreferrer" className="p-2 border rounded-md hover:bg-muted text-muted-foreground"><ExternalLink className="h-3 w-3" /></a>
                            <button
                              title="Excluir grupo definitivamente"
                              onClick={async () => {
                                if (!confirm(`Excluir definitivamente o grupo "${group.cidade}"? Esta ação removerá o grupo em definitivo do seu inventário.`)) return;
                                try {
                                  const { error } = await (supabase.from('whatsapp_groups') as any)
                                    .delete()
                                    .eq('id', group.id);
                                  if (error) throw error;
                                  toast.success('Grupo excluído definitivamente.');
                                  setGroups(prev => prev.filter(g => g.id !== group.id));
                                  fetchGroups();
                                  queryClient.invalidateQueries({ queryKey: ['motoboy-commission', user?.id] });
                                } catch (err: any) {
                                  console.error('[Delete Group] error:', err);
                                  toast.error(`Erro ao excluir grupo: ${err?.message || 'erro desconhecido'}`);
                                }
                              }}
                              className="p-2 border border-red-200 bg-red-50 text-red-500 rounded-md hover:bg-red-100 dark:border-red-900 dark:bg-red-950"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {/* CORPO DO CARD - ESTADO E RÉGUA */}
                        <div className="space-y-4">

                          {/* Se estiver Invalido, acusa o ERRO da Auditoria */}
                          {group.invalid_reason && (
                            <div className="flex flex-col gap-1 bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-xs text-red-700 dark:text-red-400">
                              <div className="flex items-center gap-1.5 font-bold mb-1">
                                <ShieldAlert className="h-4 w-4 shrink-0" />
                                Motivo de Invalidação:
                              </div>
                              <p className="pl-5">
                                {getDetailedRejectionReason(group) ? (
                                  <span className="animate-pulse text-red-500 font-semibold inline-block">
                                    {getDetailedRejectionReason(group)}
                                  </span>
                                ) : (
                                  group.invalid_reason === 'Rejeitado pelo RADAR IA/admin' 
                                    ? 'Rejeitado pela Viagg-TX8' 
                                    : group.invalid_reason
                                )}
                              </p>
                            </div>
                          )}

                          {/* Régua de Inatividade Visível apenas p/ Aprovados/Ativos */}
                          {group.status === 'ativo' && (
                            <div className="bg-muted/30 p-3 rounded-lg border border-muted/50">
                              <div className="flex justify-between items-end mb-2">
                                <span className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                                  <History className="h-3 w-3" /> Régua de Postagens (Max 30d)
                                </span>
                                <span className={cn(
                                  "text-xs font-bold px-2 py-0.5 rounded-sm",
                                  isCritical ? 'bg-orange-500/10 text-orange-500' : isLost ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                                )}>
                                  {daysInactive === 999 ? 'Nunca postou' : `${daysInactive} dias inativo`}
                                </span>
                              </div>

                              {/* Visual Progress Bar (30 dias max) */}
                              <div className="relative h-1.5 w-full bg-background rounded-full overflow-hidden shadow-inner">
                                <div className={cn(
                                  "absolute top-0 left-0 h-full transition-all duration-700",
                                  isCritical ? 'bg-orange-500' : isLost ? 'bg-red-500' : 'bg-emerald-500'
                                )} style={{ width: `${Math.min((daysInactive / 30) * 100, 100)}%` }} />
                              </div>

                              {/* Log Info */}
                              {group.last_posted_at && (
                                <p className="text-[10px] text-muted-foreground mt-3 truncate pl-1 border-l-2 border-primary/20">
                                  <b className="text-foreground/80">Última Ação:</b> "{group.last_post_subject}"
                                </p>
                              )}
                            </div>
                          )}

                          {/* Botão Call to Action Inteligente */}
                          {group.status === 'ativo' && (
                            <div className="pt-2">
                              <Button
                                onClick={() => navigate('/motoboy/postador')}
                                size="sm"
                                variant={isCritical ? 'default' : 'secondary'}
                                className={cn(
                                  "w-full text-xs font-semibold shadow-sm",
                                  isCritical
                                    ? "bg-orange-600 hover:bg-orange-700 text-white"
                                    : "bg-[#16a34a] hover:bg-[#15803d] text-white"
                                )}>
                                <MessageSquare className="h-3.5 w-3.5 mr-1" />
                                {isCritical ? "Risco de Punição: Postar Agora" : "Engajar Loja Local neste grupo"}
                              </Button>
                            </div>
                          )}

                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

          </div>

        </div>

      </SafeErrorBoundary>
    </MotoboyPageTemplate>
  );
}
