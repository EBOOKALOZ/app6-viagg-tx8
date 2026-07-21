import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ShieldCheck, Zap, ArrowRight, Loader2, CheckCircle2, Building2, PackageCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRealEstatePackages } from "@/hooks/useRealEstatePackages";
import { cn } from "@/lib/utils";

interface AdvertiserPlanUpgradeCardProps {
  account: {
    id: string;
    package_id?: string | null;
    full_name?: string | null;
  };
}

export function AdvertiserPlanUpgradeCard({ account }: AdvertiserPlanUpgradeCardProps) {
  const { data: packages, isLoading } = useRealEstatePackages();
  const [showPricing, setShowPricing] = useState(false);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="border-none shadow-2xl shadow-zinc-200/50 rounded-[40px] overflow-hidden bg-white flex flex-col min-h-[400px] items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        <p className="mt-4 text-xs font-black text-zinc-400 uppercase tracking-widest">Sincronizando Planos...</p>
      </Card>
    );
  }

  // If no packages are found, show a placeholder or empty state
  if (!packages || packages.length === 0) {
    return (
      <Card className="border-none shadow-2xl shadow-zinc-200/50 rounded-[40px] overflow-hidden bg-white flex flex-col group border border-zinc-100 p-10 items-center justify-center text-center space-y-6 min-h-[400px]">
        <div className="w-16 h-16 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-300">
          <Zap className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-black text-zinc-900 uppercase tracking-tight">Novos Planos em Breve</h3>
          <p className="text-zinc-400 text-xs font-medium max-w-[200px]">Estamos preparando ofertas exclusivas para acelerar seus anúncios.</p>
        </div>
        <Button 
          variant="outline"
          className="rounded-xl font-bold text-[10px] uppercase tracking-widest border-zinc-100 hover:bg-zinc-50"
          onClick={() => navigate('/anunciante/anuncios')}
        >
          Meus Anúncios
        </Button>
      </Card>
    );
  }

  // Find current plan
  const currentPlan = packages?.find(p => p.id === account.package_id);
  
  // All other available plans for the modal
  const upgrades = packages?.filter(p => p.id !== account.package_id) || [];
  
  // The primary suggestion for the main card (always show something if exists)
  const mainSuggestion = upgrades[0]; // Take the first one as recommendation

  const displayPlanName = currentPlan?.name || "Anunciante Grátis";
  
  return (
    <>
      <Card className="border-none shadow-2xl shadow-zinc-200/50 rounded-[40px] overflow-hidden bg-white flex flex-col group border border-zinc-100 animate-in fade-in slide-in-from-right-4 duration-700 h-full">
        <CardHeader className="p-10 pb-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500 mb-6 shadow-xl shadow-orange-100/50 group-hover:scale-110 transition-transform duration-500">
            <Star className="w-8 h-8 fill-current" />
          </div>
          <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight">UPGRADE DE PLANO</h3>
          <p className="text-zinc-400 text-sm font-medium">Eleve sua visibilidade e potencialize suas vendas.</p>
        </CardHeader>
        
        <CardContent className="p-10 pt-0 flex flex-col gap-8 flex-1">
          {/* Current Plan Status */}
          <div className="bg-zinc-50 rounded-3xl p-6 border border-zinc-100 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Seu Plano Atual</span>
              <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                {displayPlanName}
              </span>
            </div>
            
            <div className="w-full bg-zinc-200 h-2.5 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-1000" 
                style={{ width: currentPlan ? "75%" : "25%" }}
              />
            </div>

            <div className="flex flex-col gap-3">
              {currentPlan ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-600 font-bold leading-relaxed italic">
                    Você está aproveitando os benefícios do plano {currentPlan.name}.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-400 font-bold leading-relaxed">
                  Faça o upgrade para remover taxas, desbloquear contatos diretos e ganhar bônus em créditos.
                </p>
              )}
            </div>
          </div>

          {/* Dynamic Recommended Upgrade (Summarized) */}
          {mainSuggestion && (
            <div className="space-y-4 pt-4 border-t border-zinc-50 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Upgrade Disponível</span>
                <span className="text-[9px] font-black text-zinc-400 border border-zinc-100 px-2 py-0.5 rounded-md uppercase">
                  {upgrades.length} Opções
                </span>
              </div>
              
              <div className="relative p-5 rounded-2xl bg-zinc-900 text-white shadow-xl group/card overflow-hidden transition-all hover:ring-4 hover:ring-orange-500/10">
                 <div className="absolute top-0 right-0 w-24 h-24 bg-orange-600/20 blur-[40px] rounded-full" />
                 <div className="relative z-10 flex items-center justify-between gap-4">
                    <div className="space-y-1">
                       <p className="text-sm font-black uppercase tracking-tight">{mainSuggestion.name}</p>
                       <p className="text-2xl font-black text-orange-500 tracking-tighter">
                          {mainSuggestion.price_brl === 0 ? "Grátis" : `R$ ${mainSuggestion.price_brl.toFixed(2)}`}
                       </p>
                    </div>
                    <div className="text-right">
                       <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Créditos</p>
                       <p className="text-2xl font-black">{mainSuggestion.credits_amount}</p>
                    </div>
                 </div>
              </div>
            </div>
          )}
          
          <Button 
            className="w-full h-16 bg-orange-600 text-white hover:bg-orange-700 font-black uppercase text-xs tracking-[0.2em] rounded-2xl transition-all shadow-2xl shadow-orange-600/20 mt-auto gap-3 group/btn"
            onClick={() => setShowPricing(true)}
          >
            <Zap className="w-5 h-5 fill-white text-white group-hover/btn:scale-125 transition-all" />
            VER TODOS OS PLANOS
            <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-2 transition-all" />
          </Button>
        </CardContent>
      </Card>

      {/* Pricing Table Modal */}
      <Dialog open={showPricing} onOpenChange={setShowPricing}>
        <DialogContent className="max-w-5xl p-0 border-none bg-zinc-50 overflow-hidden rounded-[40px] sm:max-h-[90vh]">
          <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-orange-500/5 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="p-8 md:p-12 space-y-10 overflow-y-auto max-h-[90vh]">
            <DialogHeader className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-600 text-white text-[10px] font-black uppercase tracking-widest mx-auto mb-4 shadow-xl shadow-orange-600/20">
                <Star className="w-3.5 h-3.5 fill-current" /> Planos Premium Imóveis
              </div>
              <DialogTitle className="text-4xl font-black text-zinc-900 tracking-tighter">TURBINE SEUS ANÚNCIOS</DialogTitle>
              <DialogDescription className="text-zinc-500 font-bold max-w-2xl mx-auto">
                Escolha o plano ideal para o seu perfil. Mais visibilidade significa contatos mais rápidos e vendas garantidas.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {packages.map((p) => {
                const isCurrent = p.id === account.package_id;
                
                return (
                  <Card key={p.id} className={cn(
                    "relative border-2 transition-all duration-500 rounded-[35px] overflow-hidden flex flex-col group/row",
                    isCurrent ? "border-zinc-200 bg-zinc-100 opacity-80" : 
                    p.is_recommended ? "border-orange-500 bg-white ring-8 ring-orange-50 scale-105 z-10 shadow-2xl shadow-orange-200" :
                    "border-white bg-white shadow-xl shadow-zinc-200 hover:border-zinc-100"
                  )}>
                    {p.badge_text && (
                      <div className="absolute top-0 right-0">
                         <div className="bg-orange-600 text-white text-[9px] font-black px-4 py-1.5 rounded-bl-2xl uppercase tracking-widest">
                            {p.badge_text}
                         </div>
                      </div>
                    )}

                    <CardHeader className="p-8 pb-4 flex flex-col items-center text-center space-y-6">
                      {/* Logo Area */}
                      <div className="relative group/logo w-full flex justify-center pt-2">
                        <div className={cn(
                          "w-28 h-28 rounded-[32px] flex items-center justify-center transition-all duration-500 overflow-hidden bg-white hover:scale-105",
                          p.is_recommended ? "ring-4 ring-orange-500/20 shadow-xl" : "shadow-sm border border-zinc-100"
                        )}>
                          <img 
                            src="/assets/brand/logo-advertiser.jpg" 
                            alt="Logo" 
                            className="w-full h-full object-contain p-1 rounded-[28px]"
                          />
                        </div>
                        {isCurrent && (
                          <div className="absolute -top-3 right-[20%]">
                             <Badge className="bg-emerald-500 text-white border-none uppercase font-black text-[8px] px-2 py-0.5 shadow-lg">Ativo</Badge>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <CardTitle className="text-2xl font-black uppercase tracking-tight text-zinc-900 leading-none">{p.name}</CardTitle>
                        <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">{p.package_type}</p>
                      </div>
                    </CardHeader>

                    <CardContent className="p-8 pt-4 flex-1 flex flex-col gap-6">
                      <div className="space-y-1">
                        <p className="text-3xl font-black text-zinc-900 tracking-tighter">
                          {p.price_brl === 0 ? "Grátis" : `R$ ${p.price_brl.toFixed(2)}`}
                        </p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                          + {p.credits_amount} Créditos de anúncio
                        </p>
                      </div>

                      <div className="space-y-3 py-6 border-t border-zinc-50">
                        {p.features_json?.slice(0, 5).map((feature, i) => (
                          <div key={i} className="flex items-start gap-3 text-[11px] font-bold text-zinc-600 leading-tight">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            {feature}
                          </div>
                        ))}
                      </div>

                      <Button 
                        disabled={isCurrent}
                        className={cn(
                          "w-full h-14 rounded-2xl font-black uppercase text-xs tracking-widest transition-all",
                          isCurrent ? "bg-zinc-200 text-zinc-500 border-none" :
                          p.is_recommended ? "bg-orange-600 text-white hover:bg-orange-700 shadow-xl shadow-orange-200" :
                          "bg-zinc-900 text-white hover:bg-black"
                        )}
                        onClick={() => {
                          if (!isCurrent) {
                            navigate(`/anunciante/checkout/${p.id}`);
                          }
                        }}
                      >
                        {isCurrent ? "Plano Atual" : "Selecionar"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex items-center justify-center pt-6 gap-6">
               <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Pagamento Seguro</span>
               </div>
               <div className="flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-blue-500" />
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Créditos Imediatos</span>
               </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
