import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Bike, Package, Users } from 'lucide-react';
import { PanelHeader } from '@/components/PanelHeader';
import { Footer } from '@/components/Footer';
import MotoboyStatusCard from '@/components/motoboy/MotoboyStatusCard';
import MotoboyIncentives from '@/components/motoboy/MotoboyIncentives';
import MotoboyActiveCallCard from '@/components/motoboy/MotoboyActiveCallCard';
import AvailableDeliveries from '@/components/motoboy/AvailableDeliveries';
import ActiveRideCard from '@/components/motoboy/ActiveRideCard';
import MissedCallsSection from '@/components/motoboy/MissedCallsSection';
import { OperationalWeatherCard } from '@/components/motoboy/OperationalWeatherCard';
import { MototaxiRideHistoryCard } from '@/components/motoboy/MototaxiRideHistoryCard';
import MapView from '@/components/passenger/MapView';
import { useDeliveryOrder } from '@/hooks/useDeliveryOrder';
import { useMotoTaxiRides } from '@/hooks/useMotoTaxiRides';
import { useMototaxiHistory } from '@/hooks/useMototaxiHistory';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalCall } from '@/contexts/GlobalCallContext';
import DeliveryOfferCard from '@/components/motoboy/DeliveryOfferCard';

export default function MotoboyPanel() {
  const navigate = useNavigate();
  const { user, activeProfile, providerRole } = useAuth();
  
  // ISOLAMENTO: Hooks só são usados se perfil é mototaxi
  // Isso evita efeitos colaterais quando perfil motoboy está ativo
  const isMototaxi = activeProfile === 'mototaxi';
  
  // Hooks condicionais - só executam para mototaxi
  const deliveryHook = useDeliveryOrder();
  
  // CORREÇÃO: Usar useMotoTaxiRides para moto-táxi (tabela moto_taxi_corridas)
  const motoTaxiRidesHook = useMotoTaxiRides();
  
  // Hook de histórico com paginação (apenas para mototaxi)
  const historyHook = useMototaxiHistory();
  
  // Valores só são usados se mototaxi ativo
  const hasActiveDelivery = isMototaxi ? deliveryHook.hasActiveDelivery : false;
  const refetchDelivery = deliveryHook.refetch;
  const hasActiveRide = isMototaxi ? motoTaxiRidesHook.hasActiveRide : false;
  const activeRide = isMototaxi ? motoTaxiRidesHook.activeRide : null;
  const isMotoTaxi = isMototaxi ? motoTaxiRidesHook.isMotoTaxi : false;
  
  // Usar contexto global de chamadas
  const {
    activeCall,
    showModal,
    hasActiveCall,
    isProcessing,
    isConnected,
    isSoundBlocked,
    missedCalls,
    lastAcceptedRideId,
    clearMissedCalls,
    removeMissedCall,
    acceptCall,
    rejectCall,
    enableSound,
    clearLastAcceptedRideId,
    deliveryOffer,
    deliveryPhase,
    acceptDeliveryOffer,
    dismissDeliveryOffer,
  } = useGlobalCall();

  // CORREÇÃO CRÍTICA: Recarregar corrida ativa quando o estado de processing terminar
  // Usa o ID específico da corrida aceita para evitar buscar corrida errada
  useEffect(() => {
    if (!isProcessing && isMototaxi && !hasActiveCall) {
      // Pequeno delay para garantir que o banco já atualizou
      const timeout = setTimeout(() => {
        // Passar o ID específico da corrida aceita
        if (lastAcceptedRideId) {
          console.log('[MotoboyPanel] Recarregando corrida específica:', lastAcceptedRideId);
          motoTaxiRidesHook.refresh(lastAcceptedRideId);
          // Limpar após uso para evitar reutilização acidental
          clearLastAcceptedRideId();
        } else {
          motoTaxiRidesHook.refresh();
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [isProcessing, isMototaxi, hasActiveCall, lastAcceptedRideId, clearLastAcceptedRideId]);

  // Debug
  console.log('[MotoboyPanel] Auth state - user:', user?.id, 'activeProfile:', activeProfile, 'isMototaxi:', isMototaxi);
  console.log('[MotoboyPanel] hasActiveCall:', hasActiveCall, 'showModal:', showModal, 'hasActiveRide:', hasActiveRide, 'isProcessing:', isProcessing);

  // ISOLAMENTO: Motoboy mostra UI específica de entrega
  // Mototaxi mostra apenas UI de corridas
  const isMotoboy = activeProfile === 'motoboy';
  
  // Mapa de exibição do perfil ativo
  const PROVIDER_DISPLAY: Record<string, { icon: string; label: string }> = {
    motorista: { icon: '🚗', label: 'Motorista' },
    motoboy: { icon: '🛵', label: 'Motoboy' },
    mototaxi: { icon: '🏍️', label: 'Moto-táxi' },
  };
  const currentProvider = PROVIDER_DISPLAY[activeProfile || 'motoboy'];

  // Determinar o que renderizar na área principal
  // Prioridade: 1. Corrida ativa, 2. Chamada pendente, 3. Conteúdo padrão
  const showActiveRide = isMototaxi && activeRide && hasActiveRide;
  const showPendingCall = hasActiveCall && !showModal && activeCall && !showActiveRide;
  // Nova prioridade: oferta de entrega para motoboy
  const showDeliveryOffer = isMotoboy && deliveryPhase === 'ringing' && !!deliveryOffer;

  // Não precisamos mais adaptar - o ActiveRideCard agora aceita MotoTaxiRide diretamente

  return (
    <div className="min-h-screen bg-background flex flex-col w-full max-w-full overflow-x-hidden">
      <PanelHeader icon={Bike} label="Motoboy">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/motoboy/rides')} 
          className="relative"
          title={isMotoTaxi ? "Corridas" : "Entregas"}
        >
          {isMotoTaxi ? (
            <Users className="h-5 w-5" />
          ) : (
            <Package className="h-5 w-5" />
          )}
          {(hasActiveDelivery || hasActiveRide) && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-accent animate-pulse" />
          )}
        </Button>
        {/* Indicador de conexão */}
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} title={isConnected ? 'Online' : 'Conectando...'} />
      </PanelHeader>

      {/* PRIORIDADE 0: Oferta de entrega (overlay global) — removido localmente */}
      {showDeliveryOffer && deliveryOffer ? (
        <main className="flex-1 flex items-center justify-center bg-background/50 backdrop-blur-sm">
           {/* O card agora é renderizado pelo GlobalCallContext para evitar duplicidade */}
        </main>
      ) : showActiveRide && activeRide ? (
        <main className="flex-1 pb-20">
          {/* Desktop: mapa wide à esquerda + painel à direita */}
          <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-64px)]">
            {/* Mapa expandido - 65% no desktop */}
            <div className="h-[35vh] lg:h-full lg:flex-[65] relative">
              <MapView 
                rideStatus="driver_coming" 
                motoboyLocation={motoTaxiRidesHook.motoTaxiPosition}
                currentRide={{
                  pickupLat: activeRide.origin_lat,
                  pickupLng: activeRide.origin_lng,
                  destinationLat: activeRide.destination_lat,
                  destinationLng: activeRide.destination_lng,
                }}
              />
            </div>
            {/* Painel lateral no desktop, abaixo no mobile */}
            <div className="lg:flex-[35] lg:overflow-y-auto lg:border-l border-border">
              <div className="px-3 sm:px-4 py-4 space-y-4">
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
                  hideMap
                />
              </div>
            </div>
          </div>
        </main>
      ) : showPendingCall && activeCall ? (
        /* PRIORIDADE 2: Chamada pendente (antes do aceite) */
        <main className="flex-1 flex items-center justify-center p-4">
          <MotoboyActiveCallCard
            call={activeCall}
            onAccept={acceptCall}
            onReject={rejectCall}
            isAccepting={isProcessing}
          />
        </main>
      ) : (
        /* PRIORIDADE 3: Conteúdo padrão — desktop split, mobile stacked */
        <main className="flex-1 pb-20">
          <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-64px)]">
            {/* Mapa — ocupa topo no mobile, 65% no desktop */}
            <div className="h-[35vh] lg:h-full lg:flex-[65] relative">
              <MapView rideStatus={hasActiveDelivery || hasActiveRide ? 'driver_coming' : 'idle'} />
            </div>

            {/* Painel de conteúdo */}
            <div className="lg:flex-[35] lg:overflow-y-auto lg:border-l border-border">
              {/* Card de clima operacional — acima de tudo */}
              <OperationalWeatherCard />
              <div className="px-3 sm:px-4 py-4 space-y-4 w-full max-w-full">
                {/* ISOLAMENTO: Componentes de ENTREGA apenas para perfil motoboy */}
                {isMotoboy && (
                  <>
                    <AvailableDeliveries onAccept={refetchDelivery} />
                    <MotoboyIncentives />
                  </>
                )}

                {/* Status card comum */}
                <MotoboyStatusCard />
                
                {/* Moto-táxi: mensagem informativa e chamadas perdidas */}
                {isMototaxi && (
                  <>
                    <div className="p-4 rounded-lg border bg-muted/50">
                      <p className="text-sm text-muted-foreground">
                        🏍️ <strong>Moto-táxi ativo</strong> - Você receberá corridas de passageiros.
                      </p>
                    </div>
                    
                    <MototaxiRideHistoryCard
                      items={historyHook.history}
                      isLoading={historyHook.isLoading}
                      currentPage={historyHook.currentPage}
                      totalPages={historyHook.totalPages}
                      totalEarnings={historyHook.totalEarnings}
                      onPageChange={historyHook.goToPage}
                    />
                    
                    <MissedCallsSection 
                      missedCalls={missedCalls} 
                      onClear={clearMissedCalls}
                      onRemoveCall={removeMissedCall}
                      onAccepted={(callId) => {
                        removeMissedCall(callId);
                        motoTaxiRidesHook.refresh();
                      }}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      <Footer />

      {/* Modal de chamada agora é global (GlobalCallProvider) */}
    </div>
  );
}
