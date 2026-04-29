import React from "react";
import { Star, ShieldCheck, Zap, ArrowRight, Loader2, CheckCircle2, History, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdvertiserAccountData } from "@/hooks/useAdvertiserAccountData";
import { useNavigate } from "react-router-dom";

interface PlanBenefitsSectionProps {
  data: AdvertiserAccountData;
}

export function PlanBenefitsSection({ data }: PlanBenefitsSectionProps) {
  const navigate = useNavigate();
  const isPremium = data.plan?.is_premium || false;
  const plan = data.plan;

  return (
    <Card className={cn(
        "border-none shadow-2xl shadow-zinc-200/50 rounded-[40px] overflow-hidden group flex flex-col h-full transition-all duration-700",
        isPremium ? "bg-zinc-900 text-white border-none shadow-orange-900/10 scale-[1.02] z-10" : "bg-white text-zinc-900 border border-zinc-100"
    )}>
       <CardHeader className="p-8 pb-4 relative z-10">
          <div className="flex items-center justify-between gap-4">
             <div className="space-y-1">
                <div className="flex items-center gap-2">
                   <Star className={cn("w-5 h-5", isPremium ? "text-orange-500 fill-current" : "text-zinc-300")} />
                   <CardTitle className="text-sm font-black uppercase tracking-tight">PLANO E BENEFÍCIOS</CardTitle>
                </div>
                <CardDescription className={cn("text-[10px] font-black uppercase tracking-widest", isPremium ? "text-zinc-500" : "text-zinc-400")}>
                   {isPremium ? "Assinatura Profissional Ativa" : "Vendas limitadas no modo Grátis"}
                </CardDescription>
             </div>
             
             {isPremium ? (
                <div className="bg-orange-600/10 px-3 py-1 rounded-full border border-orange-600/20 shadow-xl shadow-orange-600/10">
                   <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest leading-none">Status: Ativo</p>
                </div>
             ) : (
                <div className="bg-zinc-50 px-3 py-1 rounded-full border border-zinc-100">
                   <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">Acesso Limitado</p>
                </div>
             )}
          </div>
       </CardHeader>
       <CardContent className="p-8 pt-4 space-y-8 flex-1 flex flex-col relative z-10">
          <div className="space-y-2">
             <p className={cn("text-5xl font-black tracking-tighter leading-tight", isPremium ? "text-white" : "text-zinc-900")}>
                {isPremium ? plan?.name : "Anúncio Grátis"}
             </p>
             <p className={cn("text-xs font-bold leading-relaxed italic", isPremium ? "text-zinc-400" : "text-zinc-500")}>
                {isPremium 
                  ? `Você está pagando ${plan?.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por este plano.` 
                  : "Comece a divulgar de forma gratuita e mude conforme sua necessidade."}
             </p>
          </div>

          <div className="space-y-4 py-8 border-t border-b border-white/5 flex-1">
             <div className="flex items-center justify-between text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-4">
                <span>Vantagens Liberadas</span>
                <span className="text-orange-500">{plan?.benefits?.length || 2} itens</span>
             </div>
             
              {/* Dynamic Benefits List */}
              <div className="space-y-3">
                 {(plan?.benefits || ["Publicação Grátis", "Visibilidade no Mercado"]).map((benefit, i) => (
                    <div key={i} className="flex items-start gap-3 animate-in fade-in slide-in-from-left duration-500" style={{ animationDelay: `${i * 100}ms` }}>
                       <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                       <span className={cn("text-[11px] font-bold leading-tight", isPremium ? "text-zinc-300" : "text-zinc-600")}>
                         {benefit}
                       </span>
                    </div>
                 ))}
                {!isPremium && (
                   <div className="flex items-start gap-3 opacity-60 grayscale filter">
                      <Zap className="w-4 h-4 text-zinc-300 shrink-0 mt-0.5" />
                      <span className="text-[11px] font-bold leading-tight text-zinc-400 line-through">
                        Botão de Contato Desbloqueado
                      </span>
                   </div>
                )}
             </div>
          </div>

          <div className="pt-4 flex flex-col gap-4">
             <Button 
                className={cn(
                  "w-full h-14 font-black uppercase text-xs tracking-[0.2em] rounded-2xl transition-all shadow-2xl gap-3 group/btn",
                  isPremium ? "bg-white text-zinc-900 hover:bg-zinc-100 shadow-white/5" : "bg-orange-600 text-white hover:bg-orange-700 shadow-orange-600/20"
                )}
                onClick={() => navigate('/anunciante/creditos')}
             >
                {isPremium ? (
                  <>MANTER OU UPGRADE <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-2 transition-all" /></>
                ) : (
                  <>ATIVAR PLANO PREMIUM <Zap className="w-4 h-4 fill-white group-hover/btn:scale-125 transition-all" /></>
                )}
             </Button>

             <Button 
                variant="ghost" 
                className={cn(
                  "w-full h-12 font-black uppercase text-[10px] tracking-widest rounded-2xl gap-2",
                  isPremium ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-orange-600"
                )}
                onClick={() => navigate('/anunciante/creditos')}
             >
                <CreditCard className="w-4 h-4" /> ADICIONAR CRÉDITOS
             </Button>
          </div>
       </CardContent>
       
       {isPremium && (
          <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-orange-500/5 blur-[100px] rounded-full pointer-events-none" />
       )}
    </Card>
  );
}
