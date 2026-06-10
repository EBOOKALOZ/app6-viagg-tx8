import { useNavigate } from "react-router-dom";
import { MessageSquare, ArrowLeft, Loader2, Building2, Car, Package, User, Phone, MapPin, Clock, Coins, Unlock, Lock, Trash2, Bike } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useContactIntentions } from "@/hooks/useContactIntentions";
import { useAdvertiserCredits } from "@/hooks/useAdvertiserCredits";

const UNLOCK_COST = 13;

export default function AdvertiserMessagesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { intentions, isLoading, unlockIntention, deleteIntention } = useContactIntentions();
  const { balance } = useAdvertiserCredits();

  // Fallback de saldo caso useAdvertiserCredits ainda não tenha carregado
  const { data: fallbackBalance = 0 } = useQuery({
    queryKey: ["seller-credit-balance-for-msgs", user?.id],
    enabled: !!user?.id,
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

  const creditBalance = balance?.available_credits ?? fallbackBalance;

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

  const handleUnlock = async (id: string) => {
    if (creditBalance < UNLOCK_COST) {
      toast.error(`Sem saldo (precisa ${UNLOCK_COST}, tem ${creditBalance}). Redirecionando para compra...`, { duration: 3000 });
      setTimeout(() => navigate("/anunciante/creditos"), 1200);
      return;
    }
    const result = await unlockIntention(id, UNLOCK_COST);
    if (result.success) {
      toast.success(`Contato desbloqueado! ${result.credits_charged} créditos debitados.`);
    } else {
      if (result.buy_credits_cta) {
        toast.error(`Saldo insuficiente: ${result.available}/${result.required}. Redirecionando...`);
        setTimeout(() => navigate("/anunciante/creditos"), 1200);
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

  const totalCount = intentions.length;

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
      ) : intentions.length === 0 ? (
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
          {intentions.map((lead) => {
            const isUnlocked = lead.status === "unlocked";
            const hasEnough = creditBalance >= UNLOCK_COST;
            const ModuleIcon = lead.listing_module === "real_estate" ? Building2
              : lead.listing_module === "product" ? Package
              : Car;
            const moduleLabel = lead.listing_module === "real_estate" ? "Imóvel"
              : lead.listing_module === "product" ? "Produto"
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

                {/* Mensagem (só se desbloqueado) */}
                {isUnlocked && lead.visitor_message && (
                  <p className="text-xs text-emerald-800 italic line-clamp-3 px-1 bg-emerald-100/50 rounded-lg p-2">
                    "{lead.visitor_message}"
                  </p>
                )}
                {!isUnlocked && lead.masked_preview && (
                  <p className="text-xs text-yellow-800 font-mono text-center bg-black/5 rounded-lg p-2 border border-dashed border-yellow-400/50">
                    {lead.masked_preview}
                  </p>
                )}

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
                    <Unlock className="w-4 h-4" /> Desbloquear (-{UNLOCK_COST} cr)
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
                  onClick={() => navigate('/anunciante/entregas')}
                  className="w-full h-11 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl shadow-lg shadow-orange-900/30"
                >
                  <Bike className="w-4 h-4" /> Chamar Motoboy
                </Button>

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
