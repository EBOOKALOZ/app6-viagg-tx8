import React, { useState } from 'react';
import { CheckCircle2, ArrowRight, Car, Zap, Crown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealEstatePackages, type RealEstatePackage } from '@/hooks/useRealEstatePackages';

/* ═══════════════════════════════════════════════════════
   Vehicle Auto Packages — Premium Dark Pricing Section
   Busca pacotes category='vehicles' do banco de dados.
   Checkout via /anunciante/checkout/:id (mesmo pipeline).
   ═══════════════════════════════════════════════════════ */

export interface VehiclePackage {
  id: string;
  name: string;
  subtitle: string;
  price: string;
  priceValue: number;
  credits: number;
  badge: string;
  bonusCredits: number;
  featured: boolean;
  icon: React.ElementType;
  benefits: string[];
}

/** Mapeia pacote do banco (RealEstatePackage) para o formato visual */
function mapDbPackage(p: RealEstatePackage, index: number): VehiclePackage {
  const icons = [Car, Zap, Crown];
  const subtitles: Record<string, string> = {
    'basico-auto': 'AVULSO',
    'turbo-auto': 'MENSAL',
    'revenda-auto': 'MENSAL',
  };

  return {
    id: p.id,
    name: p.name,
    subtitle: subtitles[p.slug] || (p.package_type === 'standard' ? 'AVULSO' : 'MENSAL'),
    price: p.price_brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    priceValue: p.price_brl,
    credits: p.credits_amount,
    bonusCredits: p.credits_bonus || 0,
    badge: `${p.credits_amount} CRÉDITOS DE COMUNICAÇÃO`,
    featured: p.is_featured || p.is_recommended,
    icon: icons[index] || Car,
    benefits: p.features_json.length > 0
      ? p.features_json
      : [
          'DIVULGAÇÃO GRATUITA',
          'ADQUIRA QUANDO PRECISAR',
          'DE PREFERÊNCIA A FOTOS REAIS',
          'PROTEÇÃO AUTOMÁTICA',
          '1 CRÉDITO PARA O COMPRADOR CLICAR NO TEU ANÚNCIO',
          '3 CRÉDITOS PARA O USUÁRIO VER O PRODUTO COM DETALHE',
          '5 CRÉDITOS PARA O USUÁRIO ENVIAR UM WHATSAPP',
        ],
  };
}

interface VehicleAutoPackagesProps {
  onSelect?: (pkg: VehiclePackage) => void;
  selectedId?: string | null;
}

export const VehicleAutoPackages: React.FC<VehicleAutoPackagesProps> = ({
  onSelect,
  selectedId,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { data: allPackages, isLoading } = useRealEstatePackages();

   // Filtra apenas pacotes de veículos
   const vehicleDbPkgs = (allPackages || []).filter(p => p.category === 'vehicles');
  const packages: VehiclePackage[] = vehicleDbPkgs.map((p, i) => mapDbPackage(p, i));

  if (isLoading) {
    return (
      <section className="w-full py-16 md:py-24 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-[#FF6A00] animate-spin" />
        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Carregando pacotes...</p>
      </section>
    );
  }

  if (packages.length === 0) {
    return (
      <section className="w-full py-16 md:py-24">
        <div className="text-center mb-14 md:mb-20 space-y-4 px-4">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#FF6A00]/10 border border-[#FF6A00]/20 mb-4">
            <Zap className="w-4 h-4 text-[#FF6A00]" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FF6A00]">
              Pacotes Automotivos
            </span>
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white uppercase leading-tight">
            Escolha seu <span className="text-[#FF6A00]">Plano</span>
          </h2>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest max-w-xl mx-auto leading-relaxed">
            Novos pacotes de veículos em breve
          </p>
        </div>
        <div className="flex items-center justify-center py-16 bg-white/[0.02] rounded-[32px] border border-dashed border-white/[0.06] mx-4">
          <p className="text-zinc-600 font-black uppercase tracking-widest text-[10px]">Pacotes sendo preparados pelo administrador</p>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full py-16 md:py-24">
      {/* ── Section Header ── */}
      <div className="text-center mb-14 md:mb-20 space-y-4 px-4">
        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#FF6A00]/10 border border-[#FF6A00]/20 mb-4">
          <Zap className="w-4 h-4 text-[#FF6A00]" />
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FF6A00]">
            Pacotes Automotivos
          </span>
        </div>
        <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white uppercase leading-tight">
          Escolha seu <span className="text-[#FF6A00]">Plano</span>
        </h2>
        <p className="text-zinc-500 text-xs md:text-sm font-bold uppercase tracking-widest max-w-xl mx-auto leading-relaxed">
          Potencialize seus anúncios de veículos com créditos de comunicação
        </p>
      </div>

      {/* ── Cards Grid ── */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">
        {packages.map((pkg) => {
          const isActive = selectedId === pkg.id;
          const isHovered = hoveredId === pkg.id;

          return (
            <div
              key={pkg.id}
              onMouseEnter={() => setHoveredId(pkg.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={cn(
                'relative flex flex-col rounded-[32px] transition-all duration-500 group',
                pkg.featured
                  ? 'bg-gradient-to-b from-[#1a1a1f] to-[#111115] ring-2 ring-[#FF6A00] shadow-[0_0_60px_-10px_rgba(255,106,0,0.3)]'
                  : 'bg-gradient-to-b from-[#1a1a1f] to-[#0f0f12] ring-1 ring-white/[0.06]',
                isHovered && 'md:-translate-y-2',
                isActive && 'ring-2 ring-[#FF6A00]',
              )}
            >
              {pkg.featured && (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-[#FF6A00] to-transparent rounded-full blur-sm opacity-80" />
              )}

              <div className="flex flex-col flex-1 p-8 md:p-9 lg:p-10">

                {/* Icon */}
                <div className={cn(
                  'w-14 h-14 rounded-2xl flex items-center justify-center mb-7',
                  pkg.featured
                    ? 'bg-[#FF6A00]/15 ring-1 ring-[#FF6A00]/30'
                    : 'bg-white/[0.04] ring-1 ring-white/[0.06]',
                )}>
                  <pkg.icon className={cn(
                    'w-6 h-6',
                    pkg.featured ? 'text-[#FF6A00]' : 'text-zinc-400',
                  )} />
                </div>

                {/* Name + Subtitle */}
                <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight leading-none">
                  {pkg.name}
                </h3>
                <p className={cn(
                  'text-[10px] font-bold uppercase tracking-[0.25em] mt-1.5 mb-6',
                  pkg.featured ? 'text-[#FF6A00]/70' : 'text-zinc-600',
                )}>
                  {pkg.subtitle}
                </p>

                 {/* Price */}
                 <div className="mb-8">
                   <span className={cn(
                     'text-4xl md:text-[42px] font-black tracking-tighter',
                     pkg.featured ? 'text-white' : 'text-zinc-100',
                   )}>
                     {pkg.price}
                   </span>
                 </div>

                 {/* Credits Badge */}
                 <div className={cn(
                   'flex items-center gap-2.5 px-4 py-3 rounded-xl mb-10',
                   pkg.featured
                     ? 'bg-[#FF6A00]/10 border border-[#FF6A00]/20'
                     : 'bg-emerald-500/[0.06] border border-emerald-500/10',
                 )}>
                   <ArrowRight className={cn(
                     'w-3.5 h-3.5 flex-shrink-0',
                     pkg.featured ? 'text-[#FF6A00]' : 'text-emerald-500',
                   )} />
                   <div className="flex flex-col gap-0.5">
                     <span className={cn(
                       'text-[9px] md:text-[10px] font-black uppercase tracking-wider leading-tight',
                       pkg.featured ? 'text-[#FF6A00]' : 'text-emerald-400',
                     )}>
                       {pkg.badge}
                     </span>
                     {pkg.bonusCredits > 0 && (
                       <span className="text-emerald-400 text-[9px] font-black uppercase tracking-wider">
                         + {pkg.bonusCredits} CRÉDITOS BÔNUS
                       </span>
                     )}
                     <span className="text-zinc-500 text-[8px] font-bold uppercase tracking-wider">acesso para seus clientes</span>
                   </div>
                 </div>

                 {/* Benefits Header */}
                 <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-6">
                   Benefícios Incluídos
                 </p>

                 {/* Benefits List */}
                  <ul className="space-y-3 flex-1">
                   {pkg.benefits.map((benefit, idx) => (
                     <li key={idx} className="flex items-start gap-3">
                       <CheckCircle2 className={cn(
                         'w-5 h-5 flex-shrink-0 mt-0.5',
                         pkg.featured ? 'text-emerald-400' : 'text-emerald-500/60',
                       )} />
                       <span className={cn(
                         'text-sm font-bold uppercase tracking-wider leading-relaxed',
                         pkg.featured ? 'text-zinc-200' : 'text-zinc-400',
                       )}>
                         {benefit}
                       </span>
                     </li>
                   ))}
                 </ul>

                {/* CTA Button */}
                 <button
                   onClick={() => onSelect?.(pkg)}
                   className={cn(
                     'mt-12 w-full flex items-center justify-center gap-3',
                     'h-14 md:h-16 rounded-2xl font-black uppercase text-xs md:text-sm tracking-[0.2em]',
                     'transition-all duration-300 active:scale-[0.97]',
                     pkg.featured
                       ? 'bg-[#FF6A00] hover:bg-[#FF7A1A] text-white shadow-xl shadow-[#FF6A00]/20 hover:shadow-[#FF6A00]/40'
                       : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.08] hover:border-white/[0.15]',
                   )}
                 >
                  SELECIONAR
                  <ArrowRight className={cn(
                    'w-4 h-4 transition-transform group-hover:translate-x-1',
                    pkg.featured ? 'text-white/80' : 'text-zinc-500',
                  )} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default VehicleAutoPackages;
