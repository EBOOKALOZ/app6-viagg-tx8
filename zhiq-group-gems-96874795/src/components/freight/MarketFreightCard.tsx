import React from 'react';
import { MapPin, Route, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CardTopBar } from '@/components/ui/CardTopBar';
import { useCardTopBarActions } from '@/hooks/useCardTopBarActions';
import {
  CardDark,
  CardHighlight,
  CardInfo,
  CardImageOverlay,
  DarkBadge,
  DarkButton,
} from '@/components/ui/dark-card';
import { formatCurrencyBRL } from '@/lib/utils';
import { resolveFreightVehicleIcon } from '@/lib/freight/vehicleTypes';
import { publicAdvertiserPath } from '@/lib/business-modules';

interface MarketFreightCardProps {
  freight: {
    id: string;
    title: string;
    vehicle_type: string;
    price_label?: string | null;
    price_per_km?: number | null;
    coverage_routes?: string | null;
    city: string;
    state: string;
    thumbnail_url?: string;
    owner_user_id?: string | null;
    is_featured?: boolean;
    // ── Sinais institucionais (só exibem badge quando VIEREM do banco) ──
    ai_status?: string | null;        // moderação IA → "Verificado"
    ai_verdict?: string | null;
    is_premium?: boolean | null;      // preparado p/ ativação futura (campo ainda não existe)
    responds_fast?: boolean | null;   // idem
  };
}

interface CardFeature {
  icon: React.ReactNode;
  label: string | number;
}

interface CardBadge {
  label: string;
  tone: 'green' | 'orange' | 'red' | 'gray';
}

export const MarketFreightCard: React.FC<MarketFreightCardProps> = ({ freight }) => {
  const navigate = useNavigate();
  const { favorited, onShare, onFavorite } = useCardTopBarActions(
    freight.title,
    `${window.location.origin}/fretes/${freight.id}`,
    { id: freight.id }
  );

  const TypeIcon = resolveFreightVehicleIcon(freight.vehicle_type);

  const handleNavigate = () => {
    // Novo fluxo: abre a página pública da EMPRESA DE FRETES com o anúncio em
    // destaque; sem dono conhecido, cai na página de detalhe isolada.
    if (freight.owner_user_id) {
      navigate(publicAdvertiserPath('freteiro', freight.owner_user_id, freight.id));
    } else {
      navigate(`/fretes/${freight.id}`);
    }
  };

  const features: CardFeature[] = [];
  if (freight.price_per_km) {
    features.push({
      icon: <Truck className="w-full h-full" />,
      label: `R$ ${Number(freight.price_per_km).toFixed(2)}/km`
    });
  }
  if (freight.coverage_routes) {
    features.push({
      icon: <Route className="w-full h-full" />,
      label: freight.coverage_routes
    });
  }

  // Badges institucionais — SÓ quando há dado real que os justifique.
  // (Verificado agora vai no Header Universal via prop `verified`.)
  const badges: CardBadge[] = [];
  // ⭐ Premium (campo ainda não existe no banco → nunca dispara hoje; pronto p/ futuro)
  if (freight.is_premium) badges.push({ label: '⭐ Premium', tone: 'orange' });
  // ✅ Verificado — só se a moderação IA aprovou de fato
  const aiOk = (freight.ai_status && ['approved', 'aprovado', 'verified', 'ok'].includes(String(freight.ai_status).toLowerCase()))
    || (freight.ai_verdict && ['approved', 'aprovado', 'safe', 'ok'].includes(String(freight.ai_verdict).toLowerCase()));
  // 🔥 Em Destaque
  if (freight.is_featured) badges.push({ label: '🔥 Destaque', tone: 'orange' });
  // 🚀 Responde Rápido (campo ainda não existe → pronto p/ futuro)
  if (freight.responds_fast) badges.push({ label: '🚀 Responde Rápido', tone: 'green' });
  // 🇧🇷 Atendimento Nacional — derivado de coverage_routes real
  if (freight.coverage_routes && /nacional|brasil|todo o pa[ií]s|interestadual/i.test(freight.coverage_routes)) {
    badges.push({ label: '🇧🇷 Nacional', tone: 'gray' });
  }

  let parsedPrice: number | null = null;
  if (freight.price_label) {
    const numericMatch = freight.price_label.replace(/\./g, '').replace(',', '.').match(/\d+(\.\d+)?/);
    if (numericMatch) {
      parsedPrice = parseFloat(numericMatch[0]);
    }
  }

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-md">
        <CardDark
          onClick={handleNavigate}
          className="group relative flex flex-col w-full cursor-pointer transition-all duration-300 ease-out hover:shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          {/* ─── 1. IMAGEM ─── */}
          <div className="relative w-full aspect-square overflow-hidden bg-[#252B33] shrink-0">
            {freight.thumbnail_url ? (
              <img
                src={freight.thumbnail_url}
                alt={freight.title}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#8E98A3]">
                <Truck className="w-12 h-12 text-[#8E98A3]" />
              </div>
            )}

            {/* Header Universal do card (logo + modalidade + verificado + ações) */}
            <CardTopBar
              modality="venda"
              verified={!!aiOk}
              favorited={favorited}
              onShare={onShare}
              onFavorite={onFavorite}
            />

            {/* Badges extras data-driven (Premium/Destaque/Nacional) — abaixo da barra */}
            {badges.length > 0 && (
              <div className="absolute top-16 right-3 flex flex-col items-end flex-wrap gap-1.5 z-10 pointer-events-none">
                {badges.map((badge, idx) => (
                  <DarkBadge key={idx} tone={badge.tone}>{badge.label}</DarkBadge>
                ))}
              </div>
            )}

            {/* Watermark VX */}
            <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[5]">
              <span className="font-black tracking-tighter text-white/[0.07] mix-blend-overlay text-6xl sm:text-7xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
                VX
              </span>
            </div>

            {/* Selo institucional */}
            <div className="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-1 rounded-full bg-black/70 backdrop-blur-md px-2.5 py-1 pointer-events-none shadow-md ring-1 ring-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00C58E] shrink-0" aria-hidden="true" />
              <span className="text-[9px] font-black uppercase tracking-wider text-white/95">Oficial Viagg-TX8</span>
            </div>

            <CardImageOverlay />
          </div>

          {/* ─── CORPO ─── */}
          <div className="flex flex-col flex-1 p-4 sm:p-5 space-y-3">
            {/* 2. Título */}
            <h3 className="text-base sm:text-lg font-black text-white leading-snug line-clamp-2 group-hover:text-[#FF7A00] transition-colors">
              {freight.title}
            </h3>

            {/* 3. Preço */}
            {parsedPrice !== null ? (
              <CardHighlight
                label="Preço"
                value={
                  <>
                    <span className="mr-1 text-xs font-bold">{freight.price_label && !parsedPrice ? freight.price_label : 'R$'}</span>
                    {formatCurrencyBRL(parsedPrice).replace('R$', '').trim()}
                  </>
                }
              />
            ) : (
              <CardInfo>
                <p className="text-sm font-bold text-[#B8C2CC] uppercase tracking-wide">Preço sob consulta</p>
              </CardInfo>
            )}

            {/* 4. Categoria */}
            <div className="pt-1">
              <DarkBadge tone="gray">{freight.vehicle_type}</DarkBadge>
            </div>

            {/* 5. Localização — ícone verde + texto cinza claro */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <MapPin className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
              <span className="text-xs font-medium text-[#B8C2CC] truncate">{`${freight.city}, ${freight.state}`}</span>
            </div>

            {/* 6. Especificações */}
            {features.length > 0 && (
              <div className="flex items-center flex-wrap gap-2 pt-1.5">
                {features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 rounded-xl bg-[#252B33] border border-[#323A45] px-2.5 py-1">
                    <span className="text-[#00C58E] w-3.5 h-3.5 flex items-center justify-center shrink-0">{feature.icon}</span>
                    <span className="text-xs font-semibold text-[#B8C2CC] truncate max-w-[140px]">{feature.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1" />

            {/* 7. Botão */}
            <div className="pt-3 border-t border-[#323A45] mt-auto">
              <DarkButton
                onClick={(e) => { e.stopPropagation(); handleNavigate(); }}
                className="w-full h-11 py-0 text-xs flex items-center justify-center"
              >
                Tenho Interesse
              </DarkButton>

              {/* Rodapé institucional */}
              <div className="mt-2.5 flex items-center justify-center gap-1.5 select-none pointer-events-none opacity-80">
                <img
                  src="/viagg-logo.png"
                  alt=""
                  aria-hidden="true"
                  width={16}
                  height={16}
                  loading="lazy"
                  decoding="async"
                  className="h-4 w-4 rounded object-cover"
                />
                <span className="text-[9px] font-bold tracking-wide text-[#8E98A3]">Marketplace Oficial Viagg-TX8™</span>
              </div>
            </div>
          </div>
        </CardDark>
      </div>
    </div>
  );
};
