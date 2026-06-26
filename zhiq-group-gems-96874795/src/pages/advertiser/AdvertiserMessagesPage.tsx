import { useNavigate, useLocation } from "react-router-dom";
import { MessageSquare, ArrowLeft, Loader2, Building2, Car, Package, User, Phone, MapPin, Clock, Coins, Unlock, Lock, Trash2, Bike, Briefcase, Truck, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useContactIntentions } from "@/hooks/useContactIntentions";
import { useAdvertiserCredits } from "@/hooks/useAdvertiserCredits";

const UNLOCK_COST = 13; // custo fixo do desbloqueio na LOJA (anunciante)
const RE_UNLOCK_DEFAULT = 9; // custo fixo p/ desbloquear WhatsApp no IMÓVEL (admin → Cobranças)
const VE_UNLOCK_DEFAULT = 9; // custo fixo p/ desbloquear WhatsApp no VEÍCULO (admin → Cobranças)
const SE_UNLOCK_DEFAULT = 9; // custo fixo p/ desbloquear WhatsApp no SERVIÇO (admin → Cobranças)
const FR_UNLOCK_DEFAULT = 12; // custo fixo p/ desbloquear WhatsApp no FRETE (admin → Cobranças)
const TR_UNLOCK_DEFAULT = 12; // custo fixo p/ desbloquear WhatsApp na VIAGEM (admin → Cobranças)

export default function AdvertiserMessagesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { intentions, isLoading, unlockIntention, deleteIntention } = useContactIntentions();

  // Imóveis usam o PACOTE PRÓPRIO de créditos (não o do lojista).
  // Decide pela origem do lead (real_estate) e, como fallback, pela rota.
  const creditosRouteFor = (id: string) => {
    const it = intentions.find((i) => i.id === id);
    const isImovel =
      it?.listing_module === "real_estate" ||
      location.pathname.startsWith("/anunciante/imoveis");
    return isImovel ? "/anunciante/imoveis/creditos" : "/anunciante/creditos";
  };
  const { balance } = useAdvertiserCredits();
  const queryClient = useQueryClient();

  // No painel de IMÓVEIS o saldo e o débito usam a carteira PRÓPRIA de imóveis
  // (real_estate_credit_balances por owner_user_id), não a do lojista/anunciante.
  const imoveisMode = location.pathname.startsWith("/anunciante/imoveis");
  // No painel de VEÍCULOS o saldo e o débito usam a carteira PRÓPRIA de veículos
  // (vehicle_credit_balances por owner_user_id), não a do lojista/anunciante.
  const veiculosMode = location.pathname.startsWith("/anunciante/veiculos");
  // No painel de SERVIÇOS o saldo e o débito usam a carteira PRÓPRIA de serviços
  // (service_credit_balances por owner_user_id), não a do lojista/anunciante.
  const servicosMode = location.pathname.startsWith("/anunciante/servicos");
  // No painel de FRETES o saldo e o débito usam a carteira PRÓPRIA de fretes
  // (freight_credit_balances por owner_user_id), não a do lojista/anunciante.
  const fretesMode = location.pathname.startsWith("/anunciante/fretes");
  const viagensMode = location.pathname.startsWith("/anunciante/viagens");

  // Fallback de saldo do ANUNCIANTE (modo loja)
  const { data: fallbackBalance = 0 } = useQuery({
    queryKey: ["seller-credit-balance-for-msgs", user?.id],
    enabled: !!user?.id && !imoveisMode && !veiculosMode && !servicosMode && !fretesMode,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: adv } = await (supabase.from("advertiser_accounts" as any)
        .select("id").eq("user_id", user!.id).maybeSingle()) as any;
      const accId = (adv as any)?.id;
      if (!accId) return 0;
      const { data: bal } = await (supabase.from("advertiser_credit_balances" as any)
        .select("available_credits").eq("advertiser_account_id", accId).maybeSingle()) as any;
      return Number((bal as any)?.available_credits ?? 0);
    },
  });

  // Saldo PRÓPRIO de imóveis (real_estate_credit_balances)
  const { data: reBalance = 0 } = useQuery({
    queryKey: ["real-estate-balance-msgs", user?.id],
    enabled: !!user?.id && imoveisMode,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await (supabase.from("real_estate_credit_balances") as any)
        .select("available_credits").eq("owner_user_id", user!.id).maybeSingle();
      return Number((data as any)?.available_credits ?? 0);
    },
  });

  // Custo FIXO p/ desbloquear WhatsApp do interessado (admin → Cobranças)
  const { data: reUnlockCost = RE_UNLOCK_DEFAULT } = useQuery({
    queryKey: ["real-estate-unlock-whatsapp-cost"],
    enabled: imoveisMode,
    queryFn: async () => {
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("credits_cost, is_active")
        .eq("feature_code", "real_estate_unlock_whatsapp")
        .maybeSingle();
      if (!data) return RE_UNLOCK_DEFAULT;
      return (data as any).is_active === false ? 0 : (Number((data as any).credits_cost) || RE_UNLOCK_DEFAULT);
    },
  });

  // Saldo PRÓPRIO de veículos (vehicle_credit_balances)
  const { data: veBalance = 0 } = useQuery({
    queryKey: ["vehicle-balance-msgs", user?.id],
    enabled: !!user?.id && veiculosMode,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await (supabase.from("vehicle_credit_balances") as any)
        .select("available_credits").eq("owner_user_id", user!.id).maybeSingle();
      return Number((data as any)?.available_credits ?? 0);
    },
  });

  // Custo FIXO p/ desbloquear WhatsApp do interessado de VEÍCULO (admin → Cobranças)
  const { data: veUnlockCost = VE_UNLOCK_DEFAULT } = useQuery({
    queryKey: ["vehicle-unlock-whatsapp-cost"],
    enabled: veiculosMode,
    queryFn: async () => {
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("credits_cost, is_active")
        .eq("feature_code", "vehicle_unlock_whatsapp")
        .maybeSingle();
      if (!data) return VE_UNLOCK_DEFAULT;
      return (data as any).is_active === false ? 0 : (Number((data as any).credits_cost) || VE_UNLOCK_DEFAULT);
    },
  });

  // Saldo PRÓPRIO de serviços (service_credit_balances)
  const { data: seBalance = 0 } = useQuery({
    queryKey: ["service-balance-msgs", user?.id],
    enabled: !!user?.id && servicosMode,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await (supabase.from("service_credit_balances") as any)
        .select("available_credits").eq("owner_user_id", user!.id).maybeSingle();
      return Number((data as any)?.available_credits ?? 0);
    },
  });

  // Custo FIXO p/ desbloquear WhatsApp do interessado de SERVIÇO (admin → Cobranças)
  const { data: seUnlockCost = SE_UNLOCK_DEFAULT } = useQuery({
    queryKey: ["service-unlock-whatsapp-cost"],
    enabled: servicosMode,
    queryFn: async () => {
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("credits_cost, is_active")
        .eq("feature_code", "service_unlock_whatsapp")
        .maybeSingle();
      if (!data) return SE_UNLOCK_DEFAULT;
      return (data as any).is_active === false ? 0 : (Number((data as any).credits_cost) || SE_UNLOCK_DEFAULT);
    },
  });

  // Saldo PRÓPRIO de fretes (freight_credit_balances)
  const { data: frBalance = 0 } = useQuery({
    queryKey: ["freight-balance-msgs", user?.id],
    enabled: !!user?.id && fretesMode,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await (supabase.from("freight_credit_balances") as any)
        .select("available_credits").eq("owner_user_id", user!.id).maybeSingle();
      return Number((data as any)?.available_credits ?? 0);
    },
  });

  // Custo FIXO p/ desbloquear WhatsApp do interessado de FRETE (admin → Cobranças)
  const { data: frUnlockCost = FR_UNLOCK_DEFAULT } = useQuery({
    queryKey: ["freight-unlock-whatsapp-cost"],
    enabled: fretesMode,
    queryFn: async () => {
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("credits_cost, is_active")
        .eq("feature_code", "freight_unlock_whatsapp")
        .maybeSingle();
      if (!data) return FR_UNLOCK_DEFAULT;
      return (data as any).is_active === false ? 0 : (Number((data as any).credits_cost) || FR_UNLOCK_DEFAULT);
    },
  });

  // Saldo PRÓPRIO de viagens (travel_credit_balances)
  const { data: trBalance = 0 } = useQuery({
    queryKey: ["travel-balance-msgs", user?.id],
    enabled: !!user?.id && viagensMode,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_credit_balances") as any)
        .select("available_credits").eq("owner_user_id", user!.id).maybeSingle();
      return Number((data as any)?.available_credits ?? 0);
    },
  });

  // Custo FIXO p/ desbloquear WhatsApp do interessado de VIAGEM (admin → Cobranças)
  const { data: trUnlockCost = TR_UNLOCK_DEFAULT } = useQuery({
    queryKey: ["travel-unlock-whatsapp-cost"],
    enabled: viagensMode,
    queryFn: async () => {
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("credits_cost, is_active")
        .eq("feature_code", "travel_unlock_whatsapp")
        .maybeSingle();
      if (!data) return TR_UNLOCK_DEFAULT;
      return (data as any).is_active === false ? 0 : (Number((data as any).credits_cost) || TR_UNLOCK_DEFAULT);
    },
  });

  const creditBalance = imoveisMode ? reBalance : veiculosMode ? veBalance : servicosMode ? seBalance : fretesMode ? frBalance : viagensMode ? trBalance : (balance?.available_credits ?? fallbackBalance);

  // Custo por lead: imóvel/veículo/serviço/frete/viagem = WhatsApp fixo da carteira própria; loja = custo do anunciante
  const costForLead = (_lead: any): number => (imoveisMode ? reUnlockCost : veiculosMode ? veUnlockCost : servicosMode ? seUnlockCost : fretesMode ? frUnlockCost : viagensMode ? trUnlockCost : UNLOCK_COST);

  // Máscaras
  const maskName = (n: string | null) => {
    if (!n) return "Visitante";
    const first = n.trim().split(/\s+/)[0] || "Visitante";
    return first[0]?.toUpperCase() + "***";
  };
  const maskPhone = (p: string | null) => {
    if (!p) return "";
    const digits = String(p).replace(/\D/g, "");
    if (digits.length < 4) return "(**) ****-****";
    const ddd = digits.slice(-11, -9) || "**";
    return `(${ddd}) *****-****`;
  };
  // Remove a linha "E-mail: xxx" do texto (o e-mail é contato e fica no paywall);
  // o restante da mensagem pode ser mostrado por inteiro ao vendedor.
  const stripContactEmail = (msg: string | null) =>
    (msg || "").replace(/\n*\s*e-?mail:\s*[^\s]+@[^\s]+/i, "").trim();

  const handleUnlock = async (id: string) => {
    const lead = intentions.find((i) => i.id === id);
    const cost = lead ? costForLead(lead) : (imoveisMode ? 50 : UNLOCK_COST);

    // ── IMÓVEIS: debita a carteira PRÓPRIA via RPC (custo por categoria) ──
    if (imoveisMode) {
      if (creditBalance < cost) {
        toast.error(`Sem saldo de imóveis (precisa ${cost}, tem ${creditBalance}). Redirecionando...`, { duration: 3000 });
        setTimeout(() => navigate("/anunciante/imoveis/creditos"), 1200);
        return;
      }
      const { data, error } = await supabase.rpc("unlock_real_estate_intention" as any, { p_intention_id: id });
      const r = data as any;
      if (!error && r?.success) {
        toast.success(r.credits_charged ? `Contato desbloqueado! ${r.credits_charged} créditos debitados.` : "Contato desbloqueado!");
        queryClient.invalidateQueries({ queryKey: ["contact-intentions", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["real-estate-balance-msgs", user?.id] });
      } else if (r?.buy_credits_cta || r?.error === "insufficient_credits") {
        toast.error(`Saldo insuficiente: ${r.available}/${r.required}. Redirecionando...`);
        setTimeout(() => navigate("/anunciante/imoveis/creditos"), 1200);
      } else {
        toast.error("Erro ao desbloquear: " + (r?.error || error?.message || "desconhecido"));
      }
      return;
    }

    // ── VEÍCULOS: debita a carteira PRÓPRIA via RPC (custo fixo de WhatsApp) ──
    if (veiculosMode) {
      if (creditBalance < cost) {
        toast.error(`Sem saldo de veículos (precisa ${cost}, tem ${creditBalance}). Redirecionando...`, { duration: 3000 });
        setTimeout(() => navigate("/anunciante/veiculos/creditos"), 1200);
        return;
      }
      const { data, error } = await supabase.rpc("unlock_vehicle_intention" as any, { p_intention_id: id });
      const r = data as any;
      if (!error && r?.success) {
        toast.success(r.credits_charged ? `Contato desbloqueado! ${r.credits_charged} créditos debitados.` : "Contato desbloqueado!");
        queryClient.invalidateQueries({ queryKey: ["contact-intentions", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["vehicle-balance-msgs", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["veiculos-painel-saldo", user?.id] });
      } else if (r?.buy_credits_cta || r?.error === "insufficient_credits") {
        toast.error(`Saldo insuficiente: ${r.available}/${r.required}. Redirecionando...`);
        setTimeout(() => navigate("/anunciante/veiculos/creditos"), 1200);
      } else {
        toast.error("Erro ao desbloquear: " + (r?.error || error?.message || "desconhecido"));
      }
      return;
    }

    // ── SERVIÇOS: debita a carteira PRÓPRIA via RPC (custo fixo de WhatsApp) ──
    if (servicosMode) {
      if (creditBalance < cost) {
        toast.error(`Sem saldo de serviços (precisa ${cost}, tem ${creditBalance}). Redirecionando...`, { duration: 3000 });
        setTimeout(() => navigate("/anunciante/servicos/creditos"), 1200);
        return;
      }
      const { data, error } = await supabase.rpc("unlock_service_intention" as any, { p_intention_id: id });
      const r = data as any;
      if (!error && r?.success) {
        toast.success(r.credits_charged ? `Contato desbloqueado! ${r.credits_charged} créditos debitados.` : "Contato desbloqueado!");
        queryClient.invalidateQueries({ queryKey: ["contact-intentions", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["service-balance-msgs", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["servicos-painel-saldo", user?.id] });
      } else if (r?.buy_credits_cta || r?.error === "insufficient_credits") {
        toast.error(`Saldo insuficiente: ${r.available}/${r.required}. Redirecionando...`);
        setTimeout(() => navigate("/anunciante/servicos/creditos"), 1200);
      } else {
        toast.error("Erro ao desbloquear: " + (r?.error || error?.message || "desconhecido"));
      }
      return;
    }

    // ── FRETES: debita a carteira PRÓPRIA via RPC (custo fixo de WhatsApp) ──
    if (fretesMode) {
      if (creditBalance < cost) {
        toast.error(`Sem saldo de fretes (precisa ${cost}, tem ${creditBalance}). Redirecionando...`, { duration: 3000 });
        setTimeout(() => navigate("/anunciante/fretes/creditos"), 1200);
        return;
      }
      const { data, error } = await supabase.rpc("unlock_freight_intention" as any, { p_intention_id: id });
      const r = data as any;
      if (!error && r?.success) {
        toast.success(r.credits_charged ? `Contato desbloqueado! ${r.credits_charged} créditos debitados.` : "Contato desbloqueado!");
        queryClient.invalidateQueries({ queryKey: ["contact-intentions", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["freight-balance-msgs", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["fretes-painel-saldo", user?.id] });
      } else if (r?.buy_credits_cta || r?.error === "insufficient_credits") {
        toast.error(`Saldo insuficiente: ${r.available}/${r.required}. Redirecionando...`);
        setTimeout(() => navigate("/anunciante/fretes/creditos"), 1200);
      } else {
        toast.error("Erro ao desbloquear: " + (r?.error || error?.message || "desconhecido"));
      }
      return;
    }

    // ── VIAGENS: debita a carteira PRÓPRIA via RPC (custo fixo de WhatsApp) ──
    if (viagensMode) {
      if (creditBalance < cost) {
        toast.error(`Sem saldo de viagens (precisa ${cost}, tem ${creditBalance}). Redirecionando...`, { duration: 3000 });
        setTimeout(() => navigate("/anunciante/viagens/creditos"), 1200);
        return;
      }
      const { data, error } = await supabase.rpc("unlock_travel_intention" as any, { p_intention_id: id });
      const r = data as any;
      if (!error && r?.success) {
        toast.success(r.credits_charged ? `Contato desbloqueado! ${r.credits_charged} créditos debitados.` : "Contato desbloqueado!");
        queryClient.invalidateQueries({ queryKey: ["contact-intentions", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["travel-balance-msgs", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["viagens-painel-saldo", user?.id] });
      } else if (r?.buy_credits_cta || r?.error === "insufficient_credits") {
        toast.error(`Saldo insuficiente: ${r.available}/${r.required}. Redirecionando...`);
        setTimeout(() => navigate("/anunciante/viagens/creditos"), 1200);
      } else {
        toast.error("Erro ao desbloquear: " + (r?.error || error?.message || "desconhecido"));
      }
      return;
    }

    // ── LOJA (anunciante): fluxo existente ──
    if (creditBalance < UNLOCK_COST) {
      toast.error(`Sem saldo (precisa ${UNLOCK_COST}, tem ${creditBalance}). Redirecionando para compra...`, { duration: 3000 });
      setTimeout(() => navigate(creditosRouteFor(id)), 1200);
      return;
    }
    const result = await unlockIntention(id, UNLOCK_COST);
    if (result.success) {
      toast.success(`Contato desbloqueado! ${result.credits_charged} créditos debitados.`);
    } else {
      if (result.buy_credits_cta) {
        toast.error(`Saldo insuficiente: ${result.available}/${result.required}. Redirecionando...`);
        setTimeout(() => navigate(creditosRouteFor(id)), 1200);
      } else {
        toast.error("Erro ao desbloquear: " + result.error);
      }
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteIntention(id);
    if (res.success) toast.success("Mensagem excluída.");
    else toast.error("Erro: " + res.error);
  };

  const handleCallVisitor = (lead: any) => {
    if (!lead.visitor_phone) return;
    const clean = String(lead.visitor_phone).replace(/\D/g, "").replace(/^55/, "");
    const msg = encodeURIComponent(
      `Olá ${lead.visitor_name || ""}! Você demonstrou interesse no anúncio "${lead.listing_title || ""}" na Viagg-TX8. Vamos conversar?`
    );
    window.open(`https://wa.me/55${clean}?text=${msg}`, "_blank");
  };

  // Cada painel mostra só os leads do seu segmento:
  //  • imóveis  → listing_module === 'real_estate'
  //  • veículos → listing_module === 'vehicles'
  //  • serviços → listing_module === 'services'
  //  • fretes   → listing_module === 'freight'
  //  • loja     → tudo MENOS imóveis, veículos, serviços e fretes (produtos/mercado)
  const visibleIntentions = imoveisMode
    ? intentions.filter((i) => i.listing_module === "real_estate")
    : veiculosMode
      ? intentions.filter((i) => i.listing_module === "vehicles")
      : servicosMode
        ? intentions.filter((i) => i.listing_module === "services")
        : fretesMode
          ? intentions.filter((i) => i.listing_module === "freight")
          : viagensMode
            ? intentions.filter((i) => i.listing_module === "travel")
            : intentions.filter((i) => !["real_estate", "vehicles", "services", "freight", "travel"].includes(i.listing_module));

  const totalCount = visibleIntentions.length;

  return (
    <div className="p-4 md:p-8 animate-fade-in space-y-6 mt-4">
      <header className="mb-6 border-b border-[#2A3038] pb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[#A7B0BE] hover:text-[#FF6A00] text-xs font-black uppercase tracking-widest mb-4 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Voltar ao Menu
        </button>

        <h1 className="text-2xl font-bold flex items-center gap-2 text-[#F5F7FA]">
          <MessageSquare className="text-[#FF6A00]" />
          Mensagens
          <span className="ml-2 text-sm font-bold text-[#A7B0BE] bg-[#1B1F24] border border-[#2A3038] px-3 py-1 rounded-full">
            {totalCount}
          </span>
        </h1>
        <p className="text-[#A7B0BE] mt-2 text-sm">Contatos interessados nos seus anúncios.</p>
      </header>

      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF6A00]" />
        </div>
      ) : visibleIntentions.length === 0 ? (
        <div className="bg-[#1B1F24] border border-dashed border-[#2A3038] rounded-2xl p-12 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center mx-auto">
            <MessageSquare className="w-8 h-8 text-[#A7B0BE]" />
          </div>
          <h3 className="text-lg font-black text-[#F5F7FA] uppercase">Nenhuma mensagem ainda</h3>
          <p className="text-sm text-[#A7B0BE] max-w-md mx-auto">
            Quando alguém clicar em "Estou Interessado" ou "WhatsApp" em um dos seus anúncios, aparece aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visibleIntentions.map((lead) => {
            const isUnlocked = lead.status === "unlocked";
            const leadCost = costForLead(lead);
            const hasEnough = creditBalance >= leadCost;
            const ModuleIcon = lead.listing_module === "real_estate" ? Building2
              : lead.listing_module === "product" ? Package
              : lead.listing_module === "services" ? Briefcase
              : lead.listing_module === "freight" ? Truck
              : lead.listing_module === "travel" ? Plane
              : Car;
            const moduleLabel = lead.listing_module === "real_estate" ? "Imóvel"
              : lead.listing_module === "product" ? "Produto"
              : lead.listing_module === "services" ? "Serviço"
              : lead.listing_module === "freight" ? "Frete"
              : lead.listing_module === "travel" ? "Viagem"
              : "Veículo";

            return (
              <div
                key={lead.id}
                className={cn(
                  "rounded-2xl border-2 p-5 flex flex-col gap-3 transition-all",
                  isUnlocked ? "bg-emerald-50 border-emerald-300" : "bg-yellow-50 border-yellow-300"
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className={cn(
                    "inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow",
                    isUnlocked ? "bg-emerald-500 text-white" : "bg-yellow-500 text-zinc-900"
                  )}>
                    {isUnlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {isUnlocked ? "Desbloqueado" : moduleLabel}
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold flex items-center gap-1",
                    isUnlocked ? "text-emerald-800" : "text-yellow-800"
                  )}>
                    <Clock className="w-3 h-3" />
                    {new Date(lead.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {/* Cliente */}
                <div className={cn("space-y-1 text-sm", isUnlocked ? "text-emerald-900" : "text-yellow-900")}>
                  <p className="flex items-center gap-1.5 font-bold">
                    <User className="w-3.5 h-3.5" />
                    {isUnlocked ? (lead.visitor_name || "Visitante") : maskName(lead.visitor_name)}
                  </p>
                  {lead.visitor_phone && (
                    <p className="flex items-center gap-1.5 text-xs">
                      <Phone className="w-3.5 h-3.5" />
                      {isUnlocked ? lead.visitor_phone : maskPhone(lead.visitor_phone)}
                    </p>
                  )}
                  {(lead.city || lead.region) && (
                    <p className="flex items-center gap-1.5 text-xs">
                      <MapPin className="w-3.5 h-3.5" />
                      {[lead.city, lead.region].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>

                {/* Anúncio + imagem */}
                <div className={cn("pt-3 border-t", isUnlocked ? "border-emerald-300/70" : "border-yellow-300/70")}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-16 h-16 rounded-lg bg-white border overflow-hidden shrink-0 flex items-center justify-center",
                      isUnlocked ? "border-emerald-300" : "border-yellow-300"
                    )}>
                      {lead.listing_image_url ? (
                        <img
                          src={lead.listing_image_url}
                          alt={lead.listing_title || ""}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <ModuleIcon className={cn("w-7 h-7", isUnlocked ? "text-emerald-400" : "text-yellow-400")} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-bold uppercase tracking-wider", isUnlocked ? "text-emerald-700" : "text-yellow-700")}>
                        Interesse em
                      </p>
                      <p className={cn("text-sm font-bold line-clamp-2", isUnlocked ? "text-emerald-900" : "text-yellow-900")}>
                        {lead.listing_title || moduleLabel}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mensagem do interessado — visível por inteiro ao vendedor.
                   O e-mail (contato) é removido do texto enquanto não desbloqueia. */}
                {isUnlocked && lead.visitor_message ? (
                  <p className="text-xs text-emerald-800 italic px-1 bg-emerald-100/50 rounded-lg p-2 whitespace-pre-line">
                    "{lead.visitor_message}"
                  </p>
                ) : !isUnlocked && stripContactEmail(lead.visitor_message) ? (
                  <p className="text-xs text-yellow-900 italic px-1 bg-yellow-100/60 rounded-lg p-2 whitespace-pre-line">
                    "{stripContactEmail(lead.visitor_message)}"
                  </p>
                ) : !isUnlocked && lead.masked_preview ? (
                  <p className="text-xs text-yellow-800 font-mono text-center bg-black/5 rounded-lg p-2 border border-dashed border-yellow-400/50">
                    {lead.masked_preview}
                  </p>
                ) : null}

                {/* Saldo atual */}
                <div className={cn(
                  "flex items-center justify-between p-3 rounded-xl border",
                  hasEnough ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                )}>
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest flex items-center gap-1",
                    hasEnough ? "text-emerald-700" : "text-red-700"
                  )}>
                    <Coins className="w-3.5 h-3.5" /> Saldo atual
                  </span>
                  <span className={cn(
                    "text-2xl font-black tabular-nums leading-none",
                    hasEnough ? "text-emerald-600" : "text-red-600"
                  )}>
                    {creditBalance}
                  </span>
                </div>

                {/* Ações */}
                {!isUnlocked ? (
                  <Button
                    onClick={() => handleUnlock(lead.id)}
                    className="w-full h-11 bg-emerald-700 hover:bg-emerald-800 text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl shadow-lg shadow-emerald-900/30"
                  >
                    <Unlock className="w-4 h-4" /> Desbloquear (-{leadCost} cr)
                  </Button>
                ) : (
                  lead.visitor_phone && (
                    <Button
                      onClick={() => handleCallVisitor(lead)}
                      className="w-full h-11 bg-zhiq-teal hover:bg-zhiq-green text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl shadow-lg shadow-emerald-900/30"
                    >
                      <MessageSquare className="w-4 h-4" /> Contatar Visitante
                    </Button>
                  )
                )}



                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(lead.id)}
                  className="w-full h-9 rounded-lg border border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700 font-black text-[10px] uppercase gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Excluir
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
