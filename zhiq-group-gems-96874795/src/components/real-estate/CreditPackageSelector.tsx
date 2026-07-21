import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Sparkles, Zap } from 'lucide-react';
import { cn } from "@/lib/utils";

interface CreditPackage {
  id: string;
  name: string;
  credits_amount: number;
  bonus_credits: number;
  price_brl: number;
  is_featured: boolean;
  description: string;
  badge_text?: string;
  button_label?: string;
  features_json?: string[];
}

interface CreditPackageSelectorProps {
  selectedPackageId: string | null;
  onSelect: (pkg: CreditPackage) => void;
}

export const CreditPackageSelector: React.FC<CreditPackageSelectorProps> = ({
  selectedPackageId,
  onSelect
}) => {
  // 🗑️ REMOVIDO (FASE 2/3 — Carteira de Créditos): pacotes "Premium Auto" de
  // comunicação de imóveis não são mais comercializados. Desbloqueio = 2% da
  // carteira. Componente desativado (será apagado na limpeza final).
  return null;
  // eslint-disable-next-line no-unreachable
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const { data, error } = await supabase
          .from('real_estate_credit_packages' as any)
          .select('*')
          .eq('is_active', true)
          .gt('credits_amount', 0)
          .order('sort_order', { ascending: true })
          .order('is_featured', { ascending: false })
          .order('credits_amount', { ascending: true });

        if (error) throw error;
        setPackages(data as any || []);
      } catch (err) {
        console.error('Error fetching packages:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPackages();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#FF6A00]" />
        <p className="text-sm text-zinc-500 font-bold uppercase tracking-widest">Sincronizando planos...</p>
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="p-12 text-center bg-zinc-50 rounded-[32px] border-2 border-dashed border-zinc-200">
        <Sparkles className="w-10 h-10 text-zinc-300 mx-auto mb-4" />
        <h4 className="font-black text-zinc-900 uppercase">Nenhum plano disponível</h4>
        <p className="text-zinc-500 text-xs font-medium max-w-xs mx-auto mt-2">
          Entre em contato com o suporte para adquirir créditos de comunicação.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-900 text-white text-[10px] font-black uppercase tracking-widest mb-2 shadow-xl shadow-zinc-200">
          <Zap className="w-3.5 h-3.5 text-[#FF6A00]" /> Pacotes Premium Auto
        </div>
        <h3 className="text-3xl font-black text-zinc-900 tracking-tight uppercase">
          Turbine sua Visibilidade
        </h3>
        <p className="text-sm text-zinc-500 font-medium max-w-lg mx-auto leading-relaxed">
          Escolha o pacote ideal para destacar seu anúncio para milhares de compradores diários em toda a rede Viagg-TX8.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 items-stretch">
        {packages.map((pkg) => {
          const isSelected = selectedPackageId === pkg.id;
          const isFeatured = pkg.is_featured;

          return (
            <Card 
              key={pkg.id}
              className={cn(
                "relative cursor-pointer transition-all duration-500 rounded-[32px] flex flex-col group overflow-hidden bg-white",
                isSelected 
                  ? "border-[#FF6A00] shadow-2xl shadow-orange-500/20 ring-4 ring-orange-50 scale-[1.03] z-20" 
                  : "border-zinc-200 hover:border-zinc-300 shadow-xl shadow-zinc-200/40 hover:shadow-2xl hover:shadow-zinc-300/40 hover:-translate-y-1",
                isFeatured && !isSelected ? "md:scale-[1.02] z-10 border-zinc-900 ring-4 ring-zinc-50 shadow-2xl shadow-zinc-300/50" : ""
              )}
              onClick={() => onSelect(pkg)}
            >
              {/* Featured Badge */}
              {pkg.badge_text && (
                <div className="absolute top-0 left-0 w-full flex justify-center z-20 -translate-y-1/2">
                  <Badge className={cn(
                    "font-black px-5 py-1.5 rounded-full shadow-lg text-[10px] uppercase tracking-widest whitespace-nowrap",
                    isFeatured ? "bg-zinc-900 text-white border border-zinc-700" : "bg-[#FF6A00] text-white border border-[#e65c00]"
                  )}>
                    {pkg.badge_text}
                  </Badge>
                </div>
              )}

              {/* Background Glow Effect for Featured */}
              {isFeatured && (
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-50 to-white pointer-events-none -z-10" />
              )}

              <CardHeader className={cn(
                "text-center space-y-2 pb-0",
                pkg.badge_text ? "pt-10" : "pt-8"
              )}>
                <CardTitle className={cn(
                  "text-sm font-black tracking-widest uppercase",
                  isFeatured ? "text-zinc-900" : "text-zinc-500"
                )}>
                  {pkg.name}
                </CardTitle>
                <CardDescription className="sr-only">{pkg.description}</CardDescription>
              </CardHeader>

              <CardContent className="pt-6 pb-8 px-8 flex-1 flex flex-col">
                <div className="space-y-3 text-center">
                  <div className="flex items-end justify-center gap-1">
                    <span className="text-6xl font-black text-zinc-900 tracking-tighter leading-none">
                      {pkg.credits_amount}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 font-bold uppercase tracking-widest">
                    Créditos Totais
                  </div>
                  
                  {pkg.bonus_credits > 0 && (
                     <div className="mt-3">
                       <span className="inline-flex py-1 px-3 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                         + {pkg.bonus_credits} Bônus Grátis
                       </span>
                     </div>
                  )}
                </div>

                <div className="my-8 w-full h-[1px] bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />

                <div className="text-center mb-8">
                  <span className="text-sm font-black text-zinc-400 align-top">R$</span>
                  <span className="text-4xl font-black text-zinc-900 tracking-tighter mx-1">
                    {pkg.price_brl.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-3.5 mb-8 flex-1">
                  {pkg.features_json && pkg.features_json.length > 0 ? (
                    pkg.features_json.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <Check className={cn(
                          "w-4 h-4 shrink-0 mt-0.5",
                          isFeatured ? "text-[#FF6A00]" : "text-emerald-500"
                        )} />
                        <span className="text-xs font-semibold text-zinc-600 text-left leading-tight">
                          {feature}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-zinc-400 font-medium italic text-center">Benefícios completos inclusos</p>
                  )}
                </div>

                <div className="mt-auto">
                  <Button 
                    className={cn(
                      "w-full h-14 rounded-[20px] font-black transition-all uppercase tracking-widest text-[11px]",
                      isSelected 
                        ? "bg-[#FF6A00] hover:bg-[#e65c00] text-white shadow-xl shadow-orange-500/30 ring-2 ring-orange-200 ring-offset-2" 
                        : isFeatured 
                          ? "bg-zinc-900 hover:bg-zinc-800 text-white shadow-lg shadow-zinc-900/20"
                          : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900 shadow-sm"
                    )}
                  >
                    {isSelected ? "Plano Selecionado" : (pkg.button_label || "Escolher Este Plano")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
