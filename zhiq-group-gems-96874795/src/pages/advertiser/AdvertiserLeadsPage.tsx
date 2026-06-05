import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useContactIntentions } from "@/hooks/useContactIntentions";
import { useAdvertiserCredits } from "@/hooks/useAdvertiserCredits";
import { useAdvertiserAccountData } from "@/hooks/useAdvertiserAccountData";
import { useAdvertiserPurchaseHistory } from "@/hooks/useAdvertiserCreditPurchase";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Lock, Unlock, Phone, Clock, MapPin, AlertCircle, Building2, Car, Trash2, Volume2, VolumeX, User, Mail, Package, CheckCircle2, ShoppingBag, XCircle, Hourglass } from "lucide-react";
import { toast } from "sonner";
import LoadingTransition from "@/pages/LoadingTransition";
import { isLeadSoundEnabled, setLeadSoundEnabled, playLeadNotificationSound, stopLeadNotificationSound } from "@/lib/notificationSound";

interface PurchaseIntentionCard {
  id: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  customer_email: string | null;
  customer_bairro: string | null;
  customer_city: string | null;
  subtotal: number | null;
  total_items: number | null;
  created_at: string;
  items: Array<{
    id: string;
    product_title: string | null;
    quantity: number;
    unit_price: number | null;
    subtotal: number | null;
  }>;
}

export default function AdvertiserLeadsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { intentions, isLoading, pendingCount, unlockIntention, deleteIntention } = useContactIntentions();
  const { balance } = useAdvertiserCredits();
  const { data: accountData } = useAdvertiserAccountData();
  const { data: purchaseHistory = [], isLoading: isLoadingHistory } = useAdvertiserPurchaseHistory();
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isLeadSoundEnabled());

  const { data: purchaseIntentions = [], refetch: refetchPurchases } = useQuery<PurchaseIntentionCard[]>({
    queryKey: ["advertiser-purchase-intentions", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: stores } = await (supabase.from("merchant_stores") as any)
        .select("id")
        .eq("user_id", user!.id);
      const storeIds = (stores || []).map((s: any) => s.id);
      if (storeIds.length === 0) return [];

      const { data: pis } = await (supabase.from("purchase_intentions") as any)
        .select("id, customer_name, customer_whatsapp, customer_email, customer_bairro, customer_city, subtotal, total_items, created_at, store_id")
        .in("store_id", storeIds)
        .order("created_at", { ascending: false })
        .limit(100);

      const piList = (pis || []) as any[];
      if (piList.length === 0) return [];

      const ids = piList.map((p) => p.id);
      const { data: items } = await (supabase.from("purchase_intention_items") as any)
        .select("id, intention_id, product_title, quantity, unit_price, subtotal")
        .in("intention_id", ids);

      const itemsByIntention = new Map<string, any[]>();
      for (const it of (items || []) as any[]) {
        const arr = itemsByIntention.get(it.intention_id) || [];
        arr.push(it);
        itemsByIntention.set(it.intention_id, arr);
      }

      return piList.map((p) => ({
        id: p.id,
        customer_name: p.customer_name,
        customer_whatsapp: p.customer_whatsapp,
        customer_email: p.customer_email,
        customer_bairro: p.customer_bairro,
        customer_city: p.customer_city,
        subtotal: p.subtotal,
        total_items: p.total_items,
        created_at: p.created_at,
        items: itemsByIntention.get(p.id) || [],
      }));
    },
  });

  const handleDeletePurchase = async (id: string) => {
    if (!window.confirm("Excluir esta mensagem?")) return;
    const { error } = await (supabase.from("purchase_intentions") as any).delete().eq("id", id);
    if (error) toast.error("Erro ao excluir: " + error.message);
    else {
      toast.success("Mensagem excluída.");
      refetchPurchases();
    }
  };

  const formatCurrency = (v: number | null) =>
    (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Ao abrir a tela de Mensagens, parar completamente o bip de notificação.
  // Também para se novos leads chegarem enquanto a tela está aberta.
  useEffect(() => {
    stopLeadNotificationSound();
  }, []);

  useEffect(() => {
    stopLeadNotificationSound();
  }, [intentions.length]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setLeadSoundEnabled(next);
    if (next) {
      // Toca um bip de teste ao ativar (também "desbloqueia" o AudioContext)
      void playLeadNotificationSound();
      toast.success("Som de notificação ativado.");
    } else {
      toast.info("Som de notificação silenciado.");
    }
  };

  const handleUnlock = async (id: string) => {
    // Pré-checagem: se o saldo já é zero, encaminha direto pra compra
    if ((balance.available_credits ?? 0) <= 0) {
      toast.error('Você não tem créditos. Redirecionando pra compra de pacotes…', { duration: 3000 });
      setTimeout(() => navigate('/anunciante/creditos'), 800);
      return;
    }
    try {
      const result = await unlockIntention(id, 9);
      if (result.success) {
        toast.success(`Contato desbloqueado com sucesso! Foram descontados ${result.credits_charged} créditos.`);
      } else {
        if (result.buy_credits_cta) {
          toast.error(`Saldo insuficiente. Você tem ${result.available}, precisa de ${result.required}. Redirecionando pra compra…`, { duration: 3000 });
          setTimeout(() => navigate('/anunciante/creditos'), 800);
        } else {
          toast.error("Erro ao desbloquear contato: " + result.error);
        }
      }
    } catch (err: any) {
      toast.error("Erro inesperado ao desbloquear contato.");
    }
  };

  if (isLoading) return <LoadingTransition />;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#F5F7FA] flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-[#FF6A00]" />
            MENSAGENS & LEADS
          </h1>
          <p className="text-sm font-medium text-[#A7B0BE] mt-2">
            Gerencie as perguntas e intenções de contato dos visitantes em seus anúncios.
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={toggleSound}
              variant="outline"
              size="sm"
              title={soundEnabled ? "Silenciar som de novos leads" : "Ativar som de novos leads"}
              className={`h-8 px-3 gap-1.5 rounded-lg border-[#2A3038] bg-[#1B1F24] hover:bg-[#22272E] font-bold uppercase text-[10px] tracking-widest ${soundEnabled ? "text-emerald-400" : "text-[#A7B0BE]"}`}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {soundEnabled ? "Som ON" : "Som OFF"}
            </Button>
            <div className="bg-[#1B1F24] border border-[#2A3038] px-3 py-1.5 rounded-lg flex items-center gap-2">
              <span className="text-[11px] font-medium text-[#A7B0BE] uppercase tracking-wider">Plano Atual:</span>
              <span className="text-[11px] font-black text-[#FF6A00] uppercase tracking-wider">{accountData?.plan?.name || "Básico / Gratuito"}</span>
            </div>
            <div className="bg-[#1B1F24] border border-[#2A3038] px-3 py-1.5 rounded-lg flex items-center gap-2">
              <span className="text-[11px] font-medium text-[#A7B0BE] uppercase tracking-wider">Créditos Ativos:</span>
              <span className="text-[11px] font-black text-emerald-400">{balance.available_credits}</span>
            </div>
            <Button 
              onClick={() => navigate('/anunciante/creditos')}
              className="h-8 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-[10px] tracking-widest px-4 ml-1"
            >
              Adquirir Créditos
            </Button>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 bg-[#1B1F24] border border-red-500/30 bg-red-500/10 px-4 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs font-bold text-red-100">{pendingCount} leads pendentes de desbloqueio</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Pacotes Adquiridos: histórico de compras + saldo atual ── */}
      <Card className="bg-[#0F1419] border-[#2A3038] overflow-hidden">
        <CardHeader className="border-b border-[#2A3038] py-4 px-5 flex flex-row items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#FF8A33] flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">PACOTES ADQUIRIDOS</h2>
              <p className="text-[10px] sm:text-xs text-[#A7B0BE] uppercase tracking-widest">
                Créditos usados pra ler mensagens e desbloquear leads
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
              <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-300">Saldo atual</p>
              <p className="text-lg font-black text-emerald-400 leading-tight">{balance.available_credits} <span className="text-[10px] text-emerald-300">créd.</span></p>
            </div>
            <Button
              onClick={() => navigate('/anunciante/creditos')}
              className="h-9 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-[10px] tracking-widest px-3"
            >
              + Comprar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingHistory ? (
            <div className="p-6 text-center text-sm text-[#A7B0BE]">Carregando histórico…</div>
          ) : purchaseHistory.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <Package className="w-10 h-10 text-[#A7B0BE]/40 mx-auto" />
              <p className="text-sm text-[#A7B0BE]">Você ainda não comprou nenhum pacote de créditos.</p>
              <Button
                onClick={() => navigate('/anunciante/creditos')}
                className="bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-bold uppercase text-xs tracking-widest"
              >
                Adquirir primeiro pacote
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-[#2A3038]">
              {purchaseHistory.slice(0, 10).map((p) => {
                const statusMap: Record<string, { label: string; icon: any; color: string }> = {
                  paid: { label: 'Pago', icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
                  pending: { label: 'Pendente', icon: Hourglass, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
                  processing: { label: 'Processando', icon: Hourglass, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
                  failed: { label: 'Falhou', icon: XCircle, color: 'text-red-400 bg-red-500/10 border-red-500/30' },
                  cancelled: { label: 'Cancelado', icon: XCircle, color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30' },
                  expired: { label: 'Expirado', icon: XCircle, color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30' },
                };
                const cfg = statusMap[p.payment_status] || statusMap.pending;
                const StatusIcon = cfg.icon;
                const dateBR = new Date(p.paid_at || p.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: '2-digit',
                });
                return (
                  <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-[#1B1F24] border border-[#2A3038] flex items-center justify-center">
                      <Package className="w-4 h-4 text-[#FF6A00]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">
                        {p.credits_total} crédito{p.credits_total > 1 ? 's' : ''}
                        <span className="text-[#A7B0BE] font-medium ml-2">· {p.amount_brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      </p>
                      <p className="text-[11px] text-[#A7B0BE]">
                        {dateBR}{p.provider_name && ` · via ${p.provider_name}`}
                      </p>
                    </div>
                    <div className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${cfg.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </div>
                  </div>
                );
              })}
              {purchaseHistory.length > 10 && (
                <div className="px-5 py-2 text-center text-[10px] text-[#A7B0BE]">
                  Mostrando 10 mais recentes de {purchaseHistory.length} compras
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {purchaseIntentions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-black tracking-widest uppercase text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Pedidos recebidos ({purchaseIntentions.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {purchaseIntentions.map((pi) => (
              <Card key={pi.id} className="bg-emerald-50 border-2 border-emerald-200 shadow-lg overflow-hidden flex flex-col relative">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                <div className="px-4 pt-4">
                  <div className="inline-flex items-center gap-2 bg-emerald-600 text-white text-[16px] font-black uppercase tracking-widest px-4 py-2 rounded-full shadow">
                    <Package className="w-5 h-5" /> Pedido vindo de Marketplace
                  </div>
                </div>
                <CardHeader className="p-5 pt-3 pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-700">Dados confirmados</p>
                        <p className="text-[10px] text-emerald-500">Mini-cadastro ativo</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-emerald-700/70 font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(pi.created_at).toLocaleString("pt-BR")}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-emerald-600/60 hover:text-red-600 hover:bg-red-500/10 rounded-full"
                        onClick={() => handleDeletePurchase(pi.id)}
                        title="Excluir mensagem"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-5 pt-2 flex flex-col flex-1 space-y-3">
                  <div className="space-y-1.5 text-sm text-emerald-800">
                    <p className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {pi.customer_name || "Anônimo"}</p>

                    {(pi.customer_bairro || pi.customer_city) && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        {[pi.customer_bairro, pi.customer_city].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-emerald-200/70">
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" /> Itens do Pedido
                      </span>
                      <span className="text-xs font-bold text-emerald-700">{pi.total_items ?? 0} item(ns)</span>
                    </div>
                    <div className="space-y-1">
                      {pi.items.map((it) => (
                        <div key={it.id} className="flex justify-between gap-2 text-xs text-emerald-700">
                          <span className="line-clamp-1 flex-1">• {it.quantity}x {it.product_title || "Produto"}</span>
                          <span className="font-bold shrink-0">{formatCurrency(it.subtotal ?? (it.unit_price ?? 0) * it.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between pt-3 border-t border-emerald-200/70">
                    <span className="text-sm font-black text-emerald-800">Total Geral</span>
                    <span className="text-sm font-black text-emerald-800">{formatCurrency(pi.subtotal)}</span>
                  </div>

                  {pi.customer_whatsapp && (
                    <Button
                      onClick={() => window.open(`https://wa.me/55${pi.customer_whatsapp!.replace(/\D/g, "")}`, "_blank")}
                      className="w-full mt-auto bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[11px] tracking-widest h-11 gap-2"
                    >
                      <MessageSquare className="w-4 h-4" /> Chamar Cliente no WhatsApp
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {intentions.length === 0 && purchaseIntentions.length === 0 ? (
        <Card className="bg-[#1B1F24] border-[#2A3038] py-16 flex flex-col items-center text-center shadow-xl shadow-black/20">
          <div className="w-20 h-20 bg-[#14171B] border border-[#2A3038] rounded-full flex items-center justify-center mb-6">
            <MessageSquare className="w-8 h-8 text-[#A7B0BE]" />
          </div>
          <h3 className="text-xl font-black text-[#F5F7FA] uppercase">Nenhum Lead Recebido</h3>
          <p className="text-[#A7B0BE] font-medium max-w-sm mt-3">
            Você ainda não recebeu contatos ou perguntas. Melhorar as fotos e descrições dos seus anúncios pode ajudar!
          </p>
        </Card>
      ) : intentions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {intentions.map((lead) => {
            const isUnlocked = lead.status === "unlocked";

            return (
              <Card key={lead.id} className="bg-[#F5E62B] border border-[#E0D020] shadow-lg overflow-hidden flex flex-col relative group">
                {!isUnlocked && (
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-orange-500 to-red-500" />
                )}
                {isUnlocked && (
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                )}

                <CardHeader className="p-5 pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
                      {isUnlocked ? (
                        <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#F5F7FA]">
                        {isUnlocked ? "DESBLOQUEADO" : "BLOQUEADO"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-800 font-bold uppercase tracking-wider">
                        <Clock className="w-3 h-3" />
                        {new Date(lead.created_at).toLocaleDateString()}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-zinc-600 hover:text-red-600 hover:bg-red-500/10 rounded-full transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm("Tem certeza que deseja excluir esta mensagem?")) {
                            void (async () => {
                              const res = await deleteIntention(lead.id);
                              if (res.success) toast.success("Mensagem excluída.");
                              else toast.error("Erro ao excluir: " + res.error);
                            })();
                          }
                        }}
                        title="Excluir mensagem"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-2 flex flex-col flex-1 space-y-4">
                  {/* Anúncio de interesse */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                    {lead.listing_image_url ? (
                      <img
                        src={lead.listing_image_url}
                        alt={lead.listing_title || "Anúncio"}
                        className="w-full h-40 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-40 flex items-center justify-center bg-zinc-900">
                        {lead.listing_module === "real_estate" ? (
                          <Building2 className="w-10 h-10 text-zinc-700" />
                        ) : (
                          <Car className="w-10 h-10 text-zinc-700" />
                        )}
                      </div>
                    )}
                    <div className="flex items-start gap-2 px-3 py-2 border-t border-zinc-800">
                      {lead.listing_module === "real_estate" ? (
                        <Building2 className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
                      ) : (
                        <Car className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                          Interesse em
                        </div>
                        <div className="text-[13px] font-bold text-[#F5F7FA] line-clamp-2 leading-tight">
                          {lead.listing_title || (lead.listing_module === "real_estate" ? "Imóvel" : "Veículo")}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-3 border-b border-zinc-900/20 pb-3 mb-3">
                      <h4 className="text-zinc-900 font-black text-lg line-clamp-1">
                        {isUnlocked
                          ? lead.visitor_name
                          : (lead.visitor_name?.trim().split(/\s+/)[0] || "Mensagem de anonimo")}
                      </h4>
                      <svg className="w-10 h-10 shrink-0 fill-[#25D366] drop-shadow-lg" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                    </div>
                    <p className="text-[#FF6A00] font-bold text-xl animate-pulse">
                      ⏳ está aguardando seu retorno!!!
                    </p>
                    {!isUnlocked ? (
                      <p className="text-zinc-900 font-mono text-sm tracking-widest bg-black/20 p-2 rounded-lg text-center border border-dashed border-zinc-900/30">
                        {lead.masked_preview}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-emerald-400 font-mono bg-emerald-400/10 p-2.5 rounded-lg border border-emerald-400/20">
                          <Phone className="w-4 h-4" />
                          {lead.visitor_phone || "Não informado"}
                        </div>
                        {lead.visitor_message && (
                          <div className="text-sm text-[#A7B0BE] bg-[#14171B] p-3 rounded-lg border border-[#2A3038] italic">
                            "{lead.visitor_message}"
                          </div>
                        )}
                        {(lead.city || lead.region) && (
                          <div className="flex items-center gap-2 text-[11px] text-zinc-800 font-bold uppercase tracking-widest">
                            <MapPin className="w-3.5 h-3.5 text-[#FF6A00]" /> 
                            {[lead.city, lead.region].filter(Boolean).join(" - ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-4 border-t border-zinc-900/20">
                    {!isUnlocked ? (
                      <div className="space-y-2">
                        <Button
                          onClick={() => handleUnlock(lead.id)}
                          className="w-full bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-[18px] tracking-widest h-16 shadow-lg shadow-[#FF6A00]/20 gap-3"
                        >
                          <Unlock className="w-6 h-6" /> 
                          Desbloquear (9 Créditos)
                        </Button>
                        <div className="text-center text-[18px] font-black text-zinc-700 uppercase tracking-widest mt-1">
                          Saldo Atual: <span className={balance.available_credits >= 9 ? "text-emerald-700" : "text-red-600"}>{balance.available_credits} Créditos</span>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => window.open(`https://wa.me/55${lead.visitor_phone?.replace(/\D/g, "")}`, "_blank")}
                        className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 font-black uppercase text-[11px] tracking-widest h-12 gap-2"
                      >
                        <MessageSquare className="w-4 h-4" /> 
                        Chamar no WhatsApp
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
