import { useEffect, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalCall } from '@/contexts/GlobalCallContext';
import { toast } from 'sonner';
import { useMotoboyCommission } from '@/hooks/useMotoboyCommission';
import { supabase } from '@/integrations/supabase/client';
import { MapPin } from 'lucide-react';

// Premium components
import { 
  HeroCommissionCard, 
  QuickMetricsRow, 
  EconomicRadarCard,
  CommissionTiersCard 
} from '@/components/motoboy/premium';
import { MotoboyCallsButton } from '@/components/motoboy/MotoboyCallsButton';

// Existing components for active states
import MotoboyActiveCallCard from '@/components/motoboy/MotoboyActiveCallCard';
import ActiveRideCard from '@/components/motoboy/ActiveRideCard';
import { useMotoTaxiRides } from '@/hooks/useMotoTaxiRides';

// Card de oferta de entrega (lazy para não bloquear o dashboard)
const DeliveryOfferCard = lazy(() => import('@/components/motoboy/DeliveryOfferCard'));

/**
 * Motoboy Panel Content — Premium Dashboard
 * Renderiza dentro do MotoboyLayout.
 *
 * Prioridades de renderização:
 *  1. [motoboy] Entrega pendente → DeliveryOfferCard (overlay fullscreen)
 *  2. [mototaxi] Corrida ativa → ActiveRideCard
 *  3. [mototaxi] Chamada pendente → MotoboyActiveCallCard
 *  4. Dashboard premium (padrão)
 */
export default function MotoboyPanelContent() {
  const navigate = useNavigate();
  const { user, activeProfile } = useAuth();
  const isMototaxi = activeProfile === 'mototaxi';
  const isMotoboy  = activeProfile === 'motoboy';
  const basePath    = isMototaxi ? '/mototaxi' : '/motoboy';

  // ── Dados de comissão (backend-driven) ──
  const { 
    commissionRate, 
    activeGroups, 
    isOnline,
    toggleOnline,
    isLoading 
  } = useMotoboyCommission(user?.id);

  // ── Localização cadastral do motoboy ──
  const [motoboyLocation, setMotoboyLocation] = useState<{ cidade: string; estado: string; bairro: string } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('motoboy_profiles')
      .select('cidade, estado, bairro')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && (data.cidade || data.estado || data.bairro)) {
          setMotoboyLocation({
            cidade: data.cidade || '',
            estado: data.estado || '',
            bairro: data.bairro || '',
          });
        }
      });
  }, [user?.id]);

  // ── [MOTOTAXI/MOTOBOY] Contexto global de chamadas de corrida e entregas ──
  const {
    activeCall,
    showModal,
    hasActiveCall,
    isProcessing,
    acceptCall,
    rejectCall,
    lastAcceptedRideId,
    clearLastAcceptedRideId,
    deliveryOffer,
    deliveryPhase,
    acceptDeliveryOffer,
    dismissDeliveryOffer,
  } = useGlobalCall();

  const handleToggleOnline = async () => {
    if (isProcessing) return;
    try {
      await toggleOnline();
      toast.success(!isOnline ? 'Você está ONLINE! 🛵' : 'Você está OFFLINE.');
    } catch (err) {
      toast.error('Erro ao mudar status');
    }
  };

  // ── Corridas ativas de moto-táxi ──
  const motoTaxiRidesHook = useMotoTaxiRides();
  const hasActiveRide = isMototaxi && motoTaxiRidesHook.hasActiveRide;
  const activeRide    = isMototaxi ? motoTaxiRidesHook.activeRide : null;

  // Recarregar corrida ao sair de processamento
  useEffect(() => {
    if (!isProcessing && isMototaxi && !hasActiveCall) {
      const timeout = setTimeout(() => {
        if (lastAcceptedRideId) {
          motoTaxiRidesHook.refresh(lastAcceptedRideId);
          clearLastAcceptedRideId();
        } else {
          motoTaxiRidesHook.refresh();
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [isProcessing, isMototaxi, hasActiveCall, lastAcceptedRideId, clearLastAcceptedRideId]);

  // ══════════════════════════════════════════════════════════
  // PRIORIDADE 1 — [MOTOBOY] Oferta de entrega pendente
  // Exibida como overlay fullscreen sobre tudo o mais
  // ══════════════════════════════════════════════════════════
  if (isMotoboy && deliveryPhase === 'ringing' && deliveryOffer) {
    return (
      <div className="flex-1 relative bg-background/50 backdrop-blur-sm">
        {/* O card é renderizado globalmente pelo GlobalCallContext */}
        <div className="flex-1 px-4 py-3 space-y-4 overflow-hidden opacity-30 pointer-events-none select-none">
          <HeroCommissionCard
            commissionRate={commissionRate}
            activeGroups={activeGroups}
            isLoading={isLoading}
          />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // PRIORIDADE 2 — [MOTOTAXI] Corrida ativa
  // ══════════════════════════════════════════════════════════
  if (hasActiveRide && activeRide) {
    return (
      <div className="flex-1 px-4 py-4">
        <ActiveRideCard
          ride={activeRide}
          passengerInfo={motoTaxiRidesHook.passengerInfo}
          isLoadingPassenger={motoTaxiRidesHook.isLoadingPassenger}
          onStart={motoTaxiRidesHook.startRide}
          onComplete={motoTaxiRidesHook.completeRide}
          onCancel={motoTaxiRidesHook.cancelRide}
          routeData={motoTaxiRidesHook.routeData}
          isCalculatingRoute={motoTaxiRidesHook.isCalculatingRoute}
          motoboyPosition={motoTaxiRidesHook.motoTaxiPosition}
        />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // PRIORIDADE 3 — [MOTOTAXI] Chamada pendente de corrida
  // ══════════════════════════════════════════════════════════
  const showPendingCall = hasActiveCall && !showModal && activeCall && !hasActiveRide;
  if (showPendingCall && activeCall) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <MotoboyActiveCallCard
          call={activeCall}
          onAccept={acceptCall}
          onReject={rejectCall}
          isAccepting={isProcessing}
        />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // PADRÃO — Dashboard premium
  // ══════════════════════════════════════════════════════════
  return (
    <div className="flex-1 px-4 py-3 space-y-4 overflow-y-auto bg-[hsl(var(--motoboy-dashboard-bg))]">
      {/* Hero Commission Card */}
      <HeroCommissionCard
        commissionRate={commissionRate}
        activeGroups={activeGroups}
        isLoading={isLoading}
      />

      {/* Quick Metrics Row (clique para toggle online) */}
      <div onClick={handleToggleOnline} className="cursor-pointer">
        <QuickMetricsRow
          activeGroups={activeGroups}
          maxGroups={3}
          isOnline={isOnline}
          isLoading={isLoading}
        />
      </div>

      {/* Radar e Tiers em grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EconomicRadarCard
          commissionRate={commissionRate}
          isLoading={isLoading}
        />
        <CommissionTiersCard
          commissionRate={commissionRate}
          isLoading={isLoading}
        />
      </div>

      {/* Localização do Motoboy (baseada no cadastro) */}
      {motoboyLocation && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/20">
          <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
            <MapPin className="h-4.5 w-4.5 text-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Localização Atual (Cadastro)</p>
            <p className="text-sm font-bold text-foreground truncate">
              {[motoboyLocation.bairro, motoboyLocation.cidade, motoboyLocation.estado].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* CTA Principal */}
      <div className="pt-2 pb-4">
        <MotoboyCallsButton
          onClick={() => navigate(`${basePath}/rides`)}
          hasActiveCalls={hasActiveCall || (isMotoboy && deliveryPhase === 'ringing')}
        />
      </div>
    </div>
  );
}
