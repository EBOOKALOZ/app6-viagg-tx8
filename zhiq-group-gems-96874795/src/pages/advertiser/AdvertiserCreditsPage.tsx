import React from "react";
import { 
  CreditCard, 
  Plus, 
  History, 
  Star, 
  ShieldCheck, 
  Zap, 
  CheckCircle2, 
  PackageCheck, 
  Loader2, 
  ArrowRight,
  Building2,
  CarFront,
  ShoppingBag,
  Sparkles
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useRealEstatePackages } from "@/hooks/useRealEstatePackages";
import { useMerchantCredits } from "@/hooks/useMerchantCredits";
import { useNavigate } from "react-router-dom";
import { cn, formatCurrencyBRL } from "@/lib/utils";

export default function AdvertiserCreditsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: packages, isLoading: packagesLoading } = useRealEstatePackages();
  const merchantCredits = useMerchantCredits();
  const merchantLoading = merchantCredits.isLoading;

  const realEstatePkgs = packages?.filter(p => p.category === 'real_estate') || [];
  const vehiclePkgs = packages?.filter(p => p.category === 'vehicles') || [];
  
  // Real merchant products (Configured by Admin)
  const productPkgs = merchantCredits.products.filter(p => p.is_active).map(p => ({
    id: p.id,
    name: p.name,
    package_type: p.type === 'pacote' ? 'Exposição Avulsa'
      : p.type === 'mensal' ? 'Assinatura Mensal'
      : p.type === 'semestral' ? 'Assinatura Semestral'
      : p.type === 'anual' ? 'Assinatura Anual'
      : 'Assinatura ' + p.type,
    credits_amount: p.credits_base,
    bonus_credits: p.credits_bonus,
    price_brl: p.price_brl,
    badge_text: p.badge_text,
    features_json: (p.features_json && p.features_json.length > 0)
      ? p.features_json
      : (p.description ? [p.description] : ["Exposição Premium", "Destaque no Marketplace"]),
    is_recommended: p.is_recommended,
    button_label: p.action_label || "ADQUIRIR AGORA",
    category: 'products'
  }));

  const renderSection = (title: string, subtitle: string, tagline: string | null, icon: any, pkgs: any[]) => {
    const Icon = icon;
    
    return (
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
             <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
                <Icon className="w-6 h-6 text-[#FF6A00]" />
             </div>
             <h2 className="text-3xl font-black text-[#F5F7FA] tracking-tighter uppercase">{title}</h2>
          </div>
          <div className="ml-16 space-y-1">
             <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em]">{subtitle}</p>
             {tagline && (
               <p className="text-[#FF6A00] font-black uppercase text-[10px] tracking-widest bg-[#FF6A00]/10 w-fit px-3 py-1 rounded-lg border border-[#FF6A00]/20">
                  {tagline}
               </p>
             )}
          </div>
        </div>

        {pkgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-[#1B1F24] rounded-[32px] border border-dashed border-[#2A3038] text-center space-y-4">
             <p className="text-[#A7B0BE] font-black uppercase tracking-widest text-[10px]">Novos pacotes de {title.toLowerCase()} em breve</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {pkgs.map((p) => (
              <Card key={p.id} className={cn(
                "relative border-2 transition-all duration-500 rounded-[32px] overflow-hidden flex flex-col group/card hover:translate-y-[-8px] min-h-[700px]",
                p.is_recommended
                  ? "border-[#FF6A00] bg-[#1B1F24] ring-4 ring-[#FF6A00]/10 shadow-2xl shadow-black/40"
                  : "border-[#2A3038] bg-[#1B1F24] shadow-xl shadow-black/30 hover:border-[#FF6A00]/30"
              )}>
                {p.badge_text && (
                  <div className="absolute top-0 right-0 z-10">
                     <div className="bg-orange-600 text-white text-[9px] font-black px-5 py-2 rounded-bl-[24px] uppercase tracking-widest">
                        {p.badge_text}
                     </div>
                  </div>
                )}

                <CardHeader className="p-10 pb-4 flex flex-col items-center text-center space-y-6">
                  <div className={cn(
                    "w-28 h-28 rounded-[35px] flex items-center justify-center transition-all duration-500 overflow-hidden bg-white group-hover/card:scale-105",
                    p.is_recommended ? "ring-4 ring-orange-500/20 shadow-xl" : "shadow-sm border border-zinc-100"
                  )}>
                    <img src="/assets/brand/logo-advertiser.jpg" alt="Logo" className="w-full h-full object-contain p-1 rounded-[30px]" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-[32px] font-black uppercase tracking-tight text-[#F5F7FA] leading-none">{p.name}</CardTitle>
                    <p className="text-[13px] text-[#A7B0BE] font-black uppercase tracking-widest">
                      {p.package_type === 'standard' || p.package_type === 'STANDARD' ? 'Padrão'
                       : p.package_type === 'real_estate' || p.package_type === 'REAL_ESTATE' ? 'Imóveis'
                       : p.package_type === 'vehicles' || p.package_type === 'VEHICLES' ? 'Veículos'
                       : p.package_type}
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="p-10 pt-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-8">
                    <div className="space-y-1 text-center">
                      <p className="text-[47px] font-black text-[#F5F7FA] tracking-tighter">
                        {p.price_brl === 0 ? "Grátis" : formatCurrencyBRL(p.price_brl)}
                      </p>
                      <p className="text-[14px] text-white font-black uppercase tracking-widest bg-gradient-to-br from-[#FF6A00] to-[#E55A00] py-3 px-4 text-center rounded-[20px] border border-orange-700 shadow-lg shadow-orange-900/30 mt-4 flex flex-col items-center gap-1">
                        <span className="flex items-center gap-2">
                          <Zap className="w-5 h-5 fill-current text-yellow-200" />
                          <span className="text-white">{p.credits_amount} Créditos de Comunicação</span>
                        </span>
                        {(p.bonus_credits || 0) > 0 && (
                          <span className="text-yellow-200 text-[13px]">+ {p.bonus_credits} Créditos Bônus</span>
                        )}
                        <span className="text-[12px] text-white/80 normal-case tracking-wider">acesso para seus clientes</span>
                      </p>
                    </div>

                    <div className="space-y-6 py-8 border-t border-[#2A3038]">
                      <p className="text-[16px] text-[#A7B0BE] font-bold uppercase tracking-widest ml-1">Benefícios Incluídos</p>
                      <ul className="space-y-5">
                        {Array.isArray(p.features_json) && p.features_json.map((feature: string, i: number) => (
                          <li key={i} className="flex items-start gap-4 text-[16px] font-bold text-[#A7B0BE] leading-tight uppercase tracking-tight">
                            <div className="p-1.5 bg-[#22C55E]/10 rounded-xl">
                              <CheckCircle2 className="w-5 h-5 text-[#22C55E] shrink-0" />
                            </div>
                            <span className="pt-1">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <Button
                    className={cn(
                      "w-full h-16 rounded-[24px] font-black uppercase text-xs tracking-[0.2em] transition-all shadow-2xl gap-3 group/btn mt-8",
                      p.is_recommended
                        ? "bg-yellow-400 text-zinc-900 hover:bg-yellow-300 shadow-yellow-400/30"
                        : "bg-yellow-400 text-zinc-900 hover:bg-yellow-300 shadow-yellow-400/20 border border-yellow-500/40"
                    )}
                    onClick={() => navigate(`/anunciante/checkout/${p.id}`)}
                  >
                    {p.button_label || "ADQUIRIR AGORA"} <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-2 transition-all" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="space-y-20 animate-in fade-in duration-700 pb-20">
      {/* Root Header */}
      <div className="space-y-3">
        <h1 className="text-4xl font-black text-[#F5F7FA] tracking-tighter uppercase flex items-center gap-3">
           <CreditCard className="w-10 h-10 text-[#FF6A00]" />
           Créditos e Faturas
        </h1>
        <p className="text-[#A7B0BE] font-bold uppercase text-xs tracking-widest ml-14 opacity-70">Potencialize seus anúncios em múltiplos segmentos</p>
        
        {/* Chamada Comercial */}
        <div className="ml-14 mt-6 p-4 bg-[#FF6A00]/10 border-l-4 border-[#FF6A00] rounded-r-2xl max-w-2xl animate-in slide-in-from-left-4 duration-1000">
           <p className="text-[#FF6A00] text-lg md:text-xl font-extrabold tracking-tight leading-tight">
             Adquira os planos que mais atendem seu negócio e mantenha seu contato desbloqueado
           </p>
        </div>
      </div>

      {(packagesLoading || merchantLoading) ? (
        <div className="flex flex-col items-center justify-center py-32 bg-[#1B1F24] rounded-[32px] border border-[#2A3038] shadow-xl shadow-black/30">
           <Loader2 className="w-12 h-12 text-[#FF6A00] animate-spin" />
           <p className="mt-4 text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest">Sincronizando Ofertas...</p>
        </div>
      ) : (
        <div className="space-y-24">
          {/* Pacotes Imóveis e Veículos ocultados */}
          {renderSection("Pacotes Mercado", "Créditos de Comunicação", "PACOTES CONFIGURADOS PELO ADMINISTRADOR", Sparkles, productPkgs)}
        </div>
      )}

      {/* Trust and Shield Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t border-[#2A3038]">
          <section className="space-y-6">
            <h3 className="text-xl font-black text-[#F5F7FA] uppercase tracking-tight flex items-center gap-2">
               <History className="w-6 h-6 text-[#A7B0BE]" /> Histórico de Aquisições
            </h3>
            <div className="bg-[#1B1F24] border-2 border-dashed border-[#2A3038] rounded-[32px] p-20 flex flex-col items-center text-center space-y-4 shadow-xl shadow-black/20">
               <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center text-[#2A3038]">
                  <History className="w-8 h-8" />
               </div>
               <p className="text-[#A7B0BE] font-black uppercase tracking-widest text-xs">Nenhum pacote adquirido até o momento</p>
            </div>
         </section>

         <div className="space-y-6">
            <h3 className="text-xl font-black text-[#F5F7FA] uppercase tracking-tight flex items-center gap-2">
               <ShieldCheck className="w-6 h-6 text-[#22C55E]" /> Segurança no Pagamento
            </h3>
            <div className="bg-[#1B1F24] rounded-[32px] p-10 border border-[#2A3038] flex flex-col gap-8 h-full shadow-lg shadow-black/20">
               <div className="flex items-start gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-[#22C55E]/10 flex items-center justify-center text-[#22C55E] shadow-xl shrink-0">
                     <ShieldCheck className="w-8 h-8" />
                  </div>
                  <div className="space-y-1 pt-1">
                     <p className="text-sm font-black text-[#F5F7FA] uppercase tracking-tight">Criptografia Bancária</p>
                     <p className="text-xs text-[#A7B0BE] font-medium leading-relaxed">Usamos criptografia de ponta (SSL) para garantir que seus dados nunca fiquem expostos.</p>
                  </div>
               </div>
               
               <div className="flex items-start gap-6 pt-4 border-t border-[#2A3038]">
                  <div className="w-14 h-14 rounded-2xl bg-[#FF6A00]/10 flex items-center justify-center text-[#FF6A00] shadow-xl shrink-0">
                     <PackageCheck className="w-8 h-8" />
                  </div>
                  <div className="space-y-1 pt-1">
                     <p className="text-sm font-black text-[#F5F7FA] uppercase tracking-tight">Liberação Imediata</p>
                     <p className="text-xs text-[#A7B0BE] font-medium leading-relaxed">Após a confirmação real do Pix ou Cartão, seus créditos entram na hora.</p>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
