import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Shield,
  Users,
  MessageSquare,
  ClipboardList,
  BookOpen,
  History,
  PieChart,
  Clock,
  CheckCircle,
  Copy,
  X,
  AlertTriangle,
  TrendingDown,
  Link,
  Loader2,
  Inbox,
  Zap,
  ArrowUpRight,
  TrendingUp,
  MapPin
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CampaignPromoCard } from '@/components/campaign/CampaignPromoCard';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Interfaces
interface MegaPainelPostadorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeGroups: number;
  commissionRate: number | null;
}

interface GroupLiberado {
  id: string;
  cidade: string;
  last_posted_at: string | null;
  next_post_at: string | null;
  link: string;
}

// Server clock sync logic
let serverOffsetMs = 0;
let offsetFetched = false;

async function fetchServerOffset() {
  if (offsetFetched) return;
  offsetFetched = true;
  try {
    const before = Date.now();
    const { data } = await supabase.rpc("get_server_timestamp" as any);
    const after = Date.now();
    if (data) {
      const serverTime = new Date(data as string).getTime();
      const clientMid = (before + after) / 2;
      serverOffsetMs = serverTime - clientMid;
    }
  } catch {
    // fallback
  }
}

function serverNow() {
  return Date.now() + serverOffsetMs;
}

function useCountdown(targetDate: string | null) {
  const [remaining, setRemaining] = useState('');
  const [isExpired, setIsExpired] = useState(true);

  useEffect(() => {
    fetchServerOffset();
  }, []);

  useEffect(() => {
    if (!targetDate) {
      setIsExpired(true);
      setRemaining('');
      return;
    }

    const update = () => {
      const diff = new Date(targetDate).getTime() - serverNow();
      if (diff <= 0) {
        setIsExpired(true);
        setRemaining('');
        return;
      }
      setIsExpired(false);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return { remaining, isExpired };
}

const COMMISSION_TIERS = [
  { grupos: 0, taxa: 25 },
  { grupos: 1, taxa: 18 },
  { grupos: 2, taxa: 12 },
  { grupos: 3, taxa: 6 },
];

function CampaignCountdown({ unlockAt, campaignId, onTimerFixed }: { unlockAt: string | null; campaignId: string; onTimerFixed?: () => void }) {
  const { remaining, isExpired } = useCountdown(unlockAt);
  const [fixing, setFixing] = useState(false);
  const fixAttemptedRef = useRef(false);

  useEffect(() => {
    if (unlockAt || fixAttemptedRef.current) return;
    fixAttemptedRef.current = true;
    setFixing(true);
    supabase.rpc('admin_start_campaign_timer', { p_campaign_id: campaignId })
      .then(({ error }) => {
        if (!error) onTimerFixed?.();
        setFixing(false);
      });
  }, [unlockAt, campaignId, onTimerFixed]);

  if (!unlockAt) {
    return (
      <Badge className="bg-destructive/10 text-destructive border-0 text-[10px] px-2 py-0.5 rounded-sm">
        {fixing ? <Loader2 className="h-3 w-3 animate-spin inline" /> : <AlertTriangle className="h-3 w-3 inline mr-1" />}
      </Badge>
    );
  }

  if (isExpired) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-[10px] px-2 py-0.5 rounded-sm">
        <CheckCircle className="h-3 w-3 mr-1" />
        Pronto
      </Badge>
    );
  }

  return (
    <Badge className="bg-amber-500/10 text-amber-500 border-0 text-[10px] px-2 py-0.5 rounded-sm">
      <Clock className="h-3 w-3 mr-1" />
      Liberação em {remaining}
    </Badge>
  );
}

function GroupPostRow({ group, isPosting, onPost }: { group: GroupLiberado; isPosting: boolean; onPost: () => void }) {
  const { remaining, isExpired } = useCountdown(group.next_post_at);

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/50 shadow-sm transition-all hover:bg-muted/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <MapPin className="h-4 w-4 text-primary" />
          <p className="text-sm font-bold text-foreground">{group.cidade}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <History className="h-3 w-3" />
            {group.last_posted_at ? new Date(group.last_posted_at).toLocaleDateString() : 'Nunca'}
          </span>
          {!isExpired && remaining && (
            <span className="text-amber-500 font-medium flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Aguarde {remaining}
            </span>
          )}
          {isExpired && (
            <span className="text-emerald-500 font-medium flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Apto
            </span>
          )}
        </div>
      </div>

      <Button
        size="sm"
        className={cn(
          "shrink-0 ml-3 font-semibold",
          !isExpired || isPosting ? "bg-muted text-muted-foreground" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
        )}
        disabled={!isExpired || isPosting}
        onClick={onPost}
      >
        {isPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
      </Button>
    </div>
  );
}

function CampaignCard({
  campaign,
  isLocked,
  copiedId,
  consumingId,
  onCopy,
  onConsume,
  onTimerFixed,
}: {
  campaign: any;
  isLocked: boolean;
  copiedId: string | null;
  consumingId: string | null;
  onCopy: (text: string, id: string) => void;
  onConsume: (id: string) => void;
  onTimerFixed?: () => void;
}) {
  const { remaining, isExpired } = useCountdown(campaign.admin_unlock_at);
  const locked = (!isExpired && !!campaign.admin_unlock_at) || !campaign.admin_unlock_at;
  const isLocal = campaign.merchant_id != null; // Se estiver atrelada a um lojista

  return (
    <Card className="border shadow-sm overflow-hidden bg-card transition-shadow hover:shadow-md">
      <div className="p-4 space-y-4">
        {/* Header da Campanha */}
        <div className="flex items-start justify-between gap-2">
          <div>
            {isLocal && (
              <Badge variant="outline" className="mb-2 bg-blue-500/10 text-blue-500 border-blue-500/30 text-[10px] px-2 py-0 flex items-center gap-1 w-fit">
                <MapPin className="h-3 w-3" /> Campanha Local
              </Badge>
            )}
            <h4 className="font-bold text-sm text-foreground line-clamp-1">{campaign.title || 'Comunicado Geral'}</h4>
          </div>
          <CampaignCountdown unlockAt={campaign.admin_unlock_at} campaignId={campaign.id} onTimerFixed={onTimerFixed} />
        </div>

        {/* PROMO CARD — visual premium do anúncio */}
        {(campaign.source_type === 'product_auto' || campaign.campaign_type === 'store_product' || (campaign.title && campaign.title.startsWith('Oferta:'))) ? (
          <CampaignPromoCard
            storeName={campaign.store_name || 'Loja local'}
            storeCity={campaign.target_city || undefined}
            storeBairro={campaign.target_bairro || undefined}
            productName={campaign.title?.replace('Oferta: ', '') || 'Produto'}
            productPrice={(() => {
              const match = campaign.message_text?.match(/R\$\s*([\d.,]+)/);
              return match ? parseFloat(match[1].replace(',', '.')) : undefined;
            })()}
            productImage={campaign.media_url || undefined}
            productDescription={campaign.message_text || undefined}
            campaignTitle={campaign.title || undefined}
            compact
          />
        ) : (
          <>
            {/* Pitch de Pertencimento */}
            {isLocal && (
              <div className="bg-primary/5 border border-primary/10 rounded-md p-2 text-xs text-primary/80">
                <span className="font-bold">Dica Territorial:</span> Divulgar o comércio local gera retenção de clientes no app e garante mais corridas exclusivas para você na região.
              </div>
            )}

            {/* Media */}
            {campaign.media_url && (
              <div className="rounded-md overflow-hidden bg-muted/30 border border-border">
                {campaign.content_type === 'video' ? (
                  <video src={campaign.media_url} controls className="w-full max-h-[160px] object-contain bg-black" />
                ) : (
                  <img src={campaign.media_url} alt="Mídia" className="w-full max-h-[160px] object-cover" />
                )}
              </div>
            )}

            {/* Conteúdo Copiável */}
            {campaign.text_content && (
              <div className="bg-muted/30 border border-border/50 rounded-md p-3 text-sm text-foreground/90 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">
                {campaign.text_content}
              </div>
            )}
          </>
        )}

        {/* Tracker Link */}
        {campaign.link_url && (
          <div className="flex items-center gap-1.5 p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-xs text-blue-600 dark:text-blue-400 font-medium">
            <Link className="h-3.5 w-3.5" />
            <span className="truncate">{campaign.link_url}</span>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex gap-2 pt-2">
          <Button
            variant={copiedId === campaign.id ? "default" : "outline"}
            size="sm"
            className={cn("flex-1 text-xs font-semibold h-10", copiedId === campaign.id ? "bg-emerald-600" : "")}
            onClick={() => onCopy(campaign.text_content || campaign.message_text || campaign.title || '', campaign.id)}
          >
            {copiedId === campaign.id ? <><CheckCircle className="h-3.5 w-3.5 mr-1" /> Copiado</> : <><Copy className="h-3.5 w-3.5 mr-1" /> 1. Copiar</>}
          </Button>

          <Button
            size="sm"
            className={cn(
              "flex-1 text-xs font-semibold h-10 transition-colors",
              locked ? "bg-muted text-muted-foreground opacity-90 cursor-not-allowed" : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            )}
            onClick={() => onConsume(campaign.id)}
            disabled={locked || consumingId === campaign.id}
          >
            {consumingId === campaign.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : locked ? (
              <><Clock className="h-3.5 w-3.5 mr-1" /> Aguarde ({remaining || '...'})</>
            ) : (
              <><CheckCircle className="h-3.5 w-3.5 mr-1" /> 2. Marcar Postada</>
            )}
          </Button>
        </div>

      </div>
    </Card>
  );
}

function PostingHistorySection({ userId }: { userId?: string }) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['motoboy-posting-history', userId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('posting_history') as any)
        .select('id, title, campaign_type, target_city, final_status, posted_at, execution_notes, error_message')
        .eq('operator_user_id', userId)
        .order('posted_at', { ascending: false })
        .limit(5);
      if (error) {
        console.error('[PostingHistory] fetch error:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-4 w-4 text-muted-foreground" /></div>;
  }

  if (!history?.length) {
    return (
      <div className="border border-dashed rounded-xl flex flex-col items-center justify-center p-6 bg-muted/10 text-center">
        <div className="bg-card w-10 h-10 rounded-full flex items-center justify-center shadow-sm mb-2">
          <History className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="font-semibold text-sm text-foreground">Sem registros</p>
        <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px]">Suas postagens confirmadas aparecerão aqui automaticamente.</p>
      </div>
    );
  }

  return (
    <Card className="shadow-none border border-border/60 overflow-hidden bg-card">
      <div className="divide-y divide-border/40">
        {history.map((h: any) => {
          const isOk = h.final_status === 'posted' || h.final_status === 'postado';
          return (
            <div key={h.id} className="flex items-center justify-between p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{h.title || 'Postagem'}</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> {h.target_city || '—'}
                  <span className="mx-1">•</span>
                  {h.posted_at ? new Date(h.posted_at).toLocaleDateString() : '—'}
                </p>
              </div>
              <Badge className={cn(
                'text-[10px] border-0 px-2 py-0.5',
                isOk ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
              )}>
                {isOk ? <CheckCircle className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                {h.final_status}
              </Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function MegaPainelPostador({ open, onOpenChange, activeGroups, commissionRate }: MegaPainelPostadorProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [consumingId, setConsumingId] = useState<string | null>(null);
  const [postingGroupId, setPostingGroupId] = useState<string | null>(null);
  const postInProgressRef = useRef(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Query groups
  const { data: liberadoGroups, isLoading: loadingGroups } = useQuery({
    queryKey: ['motoboy-posting-groups', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('motoboy_whatsapp_groups' as any)
        .select('id, cidade, last_posted_at, next_post_at, link')
        .eq('user_id', user!.id)
        .eq('posting_allowed', true)
        .eq('status', 'ativo');
      if (error) throw error;
      return (data ?? []) as unknown as GroupLiberado[];
    },
    enabled: open && !!user,
  });

  // Query campaign inbox (official territorial source)
  const { data: activeCampaigns, isLoading: loadingQueue } = useQuery({
    queryKey: ['motoboy-campaign-inbox-drawer', user?.id],
    queryFn: async () => {
      // Primary: use official view
      const { data: dispatched } = await (supabase.from('motoboy_campaign_inbox_view') as any)
        .select('*')
        .eq('assigned_to_user_id', user!.id)
        .order('created_at', { ascending: true });

      if (dispatched?.length) {
        // Map dispatch fields to legacy campaign format
        return dispatched.map((d: any) => ({
          id: d.campaign_queue_id || d.id,
          title: d.campaign_title,
          message_text: d.campaign_message,
          text_content: d.campaign_message,
          media_url: d.campaign_media_url,
          source_type: d.source_type,
          target_city: d.target_city || d.city,
          target_bairro: d.bairro,
          store_name: d.store_name,
          status: d.dispatch_status,
          admin_unlock_at: null,
          campaign_type: 'store_product',
          created_at: d.created_at,
        }));
      }

      // Fallback: query campaign_queue filtered by motoboy's city
      const { data: profile } = await supabase.from('motoboy_profiles')
        .select('cidade').eq('user_id', user!.id).maybeSingle();
      const mCity = (profile as any)?.cidade;
      if (!mCity) return [];

      const { data: queueItems } = await supabase.from('campaign_queue')
        .select('*').in('status', ['ready', 'approved', 'processing', 'pending', 'scheduled', 'queued'])
        .order('created_at', { ascending: true });

      const normalize = (s: string | null) =>
        (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s*[-/]\s*[a-z]{2}\s*$/i, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      const mCityNorm = normalize(mCity);

      return (queueItems ?? []).filter((item: any) => {
        if (['consumed', 'deleted', 'cancelled'].includes(item.status)) return false;
        const qCity = normalize(item.target_city);
        return qCity === mCityNorm;
      });
    },
    enabled: open && !!user,
  });

  const handlePostToGroup = useCallback(async (groupId: string) => {
    if (postInProgressRef.current) return;
    postInProgressRef.current = true;
    setPostingGroupId(groupId);

    try {
      const { data: freshGroup } = await supabase.from('motoboy_whatsapp_groups' as any).select('next_post_at').eq('id', groupId).single();
      if ((freshGroup as any)?.next_post_at && new Date((freshGroup as any)?.next_post_at) > new Date()) {
        toast.error('Grupo protegido pelo Cooldown de Flood');
        queryClient.invalidateQueries({ queryKey: ['motoboy-posting-groups'] });
        return;
      }
      const { error } = await supabase.rpc('post_to_group', { p_group_id: groupId } as any);
      if (error) throw error;
      toast.success('Auditoria local ativada neste grupo!');
      queryClient.invalidateQueries({ queryKey: ['motoboy-posting-groups'] });
    } catch (err: any) {
      toast.error('Gargalo ao validar timer. Tente novamente.');
    } finally {
      postInProgressRef.current = false;
      setPostingGroupId(null);
    }
  }, [queryClient]);

  // Notifications logic
  const notifiedUnlocksRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeCampaigns?.length || !user) return;
    const timers: NodeJS.Timeout[] = [];
    activeCampaigns.forEach((c) => {
      if (!c.admin_unlock_at || notifiedUnlocksRef.current.has(c.id)) return;
      const diff = new Date(c.admin_unlock_at).getTime() - serverNow();
      if (diff <= 0) return;
      timers.push(setTimeout(async () => {
        notifiedUnlocksRef.current.add(c.id);
        queryClient.invalidateQueries({ queryKey: ['motoboy-campaign-queue'] });
        toast.info('🔓 Nova campanha territorial liberada na fila.');
      }, diff));
    });
    return () => timers.forEach(clearTimeout);
  }, [activeCampaigns, user, queryClient]);

  // Realtime
  useEffect(() => {
    if (!open || !user) return;
    const groupsChannel = supabase.channel('motoboy-groups-posting-crt').on('postgres_changes', { event: '*', schema: 'public', table: 'motoboy_whatsapp_groups', filter: `user_id=eq.${user.id}` }, () => queryClient.invalidateQueries({ queryKey: ['motoboy-posting-groups'] })).subscribe();
    const campaignChannel = supabase.channel('motoboy-campaign-queue-crt').on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_dispatches' }, () => queryClient.invalidateQueries({ queryKey: ['motoboy-campaign-inbox-drawer'] })).on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_queue' }, () => queryClient.invalidateQueries({ queryKey: ['motoboy-campaign-inbox-drawer'] })).subscribe();
    return () => { supabase.removeChannel(groupsChannel); supabase.removeChannel(campaignChannel); };
  }, [open, user, queryClient]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleConsume = async (campaignId: string) => {
    setConsumingId(campaignId);
    try {
      const { error } = await supabase.rpc('consume_campaign_queue', { p_queue_id: campaignId });
      if (error) throw error;
      toast.success('Envio concluído: Ativo Territorial renovado.');
      queryClient.invalidateQueries({ queryKey: ['motoboy-campaign-queue'] });
    } catch {
      toast.error('Erro de sincronia com a fila');
    } finally {
      setConsumingId(null);
    }
  };

  const getStatusColor = (rate: number) => {
    if (rate <= 8) return 'text-emerald-500';
    if (rate <= 15) return 'text-amber-500';
    return 'text-red-500';
  };

  const hasActiveCampaigns = (activeCampaigns?.length || 0) > 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[96vh] flex flex-col font-sans bg-background/95 backdrop-blur-xl border-border">
        {/* HEADER */}
        <DrawerHeader className="border-b shadow-sm relative shrink-0 py-4 px-6 bg-card flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <DrawerTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                Centro de Operações Local
              </DrawerTitle>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Gestão Humana da sua Frota</p>
            </div>
          </div>

          <DrawerClose asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full bg-muted/50 hover:bg-muted shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 md:px-6">
          <div className="flex-1 overflow-y-auto space-y-6 py-6 pb-12 scrollbar-thin">

            {/* ====== BUBBLE DE INSTRUÇÃO E NARRATIVA ====== */}
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-l-4 border-primary p-4 rounded-r-xl shadow-sm">
              <h3 className="font-bold text-sm text-primary mb-1 flex items-center gap-1.5"><Shield className="h-4 w-4" /> Impacto no Bairro</h3>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                Aqui você transforma seu engajamento em recompensa. Copie os anúncios aprovados pela plataforma e poste nos seus grupos. Nós garantimos que nenhuma venda passa fora do App.
              </p>
            </div>

            {/* ====== DASHBOARD RÁPIDO DO BOLSO ====== */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-emerald-50 dark:bg-emerald-950/20 shadow-none border-emerald-500/20">
                <CardContent className="p-4 py-5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-emerald-600/80 uppercase tracking-widest">Sua Taxa</p>
                    <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{commissionRate ?? 25}%</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-emerald-500/30" />
                </CardContent>
              </Card>
              <Card className="bg-card shadow-sm border-border/50">
                <CardContent className="p-4 py-5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Grupos Válidos</p>
                    <p className="text-3xl font-black text-foreground">{Math.min(activeGroups, 3)}<span className="text-lg text-muted-foreground">/3</span></p>
                  </div>
                  <Users className="h-8 w-8 text-muted-foreground/30" />
                </CardContent>
              </Card>
            </div>

            {/* ====== LISTA DE POSTAGENS GLOBAIS (FILA 1) ====== */}
            <div>
              <div className="flex items-end justify-between mb-3 px-1">
                <div>
                  <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                    <Inbox className="h-5 w-5 text-primary" /> Fila Oficial
                  </h3>
                  <p className="text-xs text-muted-foreground font-medium">Conteúdo autorizado para a malha</p>
                </div>
                {hasActiveCampaigns && (
                  <Badge className="bg-primary/20 text-primary border-0 font-bold px-3">
                    {activeCampaigns!.length} liberadas
                  </Badge>
                )}
              </div>

              {loadingQueue ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !hasActiveCampaigns ? (
                <div className="border border-dashed rounded-xl flex flex-col items-center justify-center p-8 bg-muted/10 text-center">
                  <div className="bg-card w-14 h-14 rounded-full flex items-center justify-center shadow-sm mb-3">
                    <CheckCircle className="h-6 w-6 text-emerald-500" />
                  </div>
                  <p className="font-bold text-foreground">Fila Zerada</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">Você já engajou todas as campanhas disponíveis hoje. Bom trabalho!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeCampaigns!.map((campaign) => {
                    const isLocked = campaign.admin_unlock_at && new Date(campaign.admin_unlock_at) > new Date();
                    return (
                      <CampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        isLocked={!!isLocked}
                        copiedId={copiedId}
                        consumingId={consumingId}
                        onCopy={handleCopy}
                        onConsume={handleConsume}
                        onTimerFixed={() => queryClient.invalidateQueries({ queryKey: ['motoboy-campaign-queue'] })}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* ====== CONFERÊNCIA DE COOLDOWN ====== */}
            <div className="pt-2">
              <div className="flex flex-col gap-1 mb-3 px-1">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
                  <Clock className="h-4 w-4 text-muted-foreground" /> Seus Ativos
                </h3>
                <p className="text-[11px] text-muted-foreground">Registre as postagens nos grupos corretos para manter as blindagens de comissão.</p>
              </div>

              <Card className="shadow-none border border-border/60 overflow-hidden bg-card">
                {loadingGroups ? (
                  <div className="p-6 flex justify-center"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>
                ) : !liberadoGroups?.length ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">Nenhum grupo verificado atrelado à sua operação hoje.</div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {liberadoGroups.map((g) => (
                      <GroupPostRow
                        key={g.id}
                        group={g}
                        isPosting={postingGroupId === g.id}
                        onPost={() => handlePostToGroup(g.id)}
                      />
                    ))}
                  </div>
                )}
              </Card>
              {/* ====== HISTÓRICO OPERACIONAL ====== */}
              <div className="pt-2">
                <div className="flex flex-col gap-1 mb-3 px-1">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
                    <History className="h-4 w-4 text-muted-foreground" /> Seu Histórico
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Últimas postagens registradas na plataforma.</p>
                </div>

                <PostingHistorySection userId={user?.id} />
              </div>

            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
