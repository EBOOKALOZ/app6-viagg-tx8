import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Package, LogOut, Loader2, Wallet, ArrowLeft, Bike, Truck, Volume2
} from 'lucide-react';
import ProfileSwitcher from '@/components/ProfileSwitcher';
import { UserAvatar } from '@/components/UserAvatar';
import { toast } from 'sonner';
import { useDeliveryOrder } from '@/hooks/useDeliveryOrder';
import { ActiveDeliveryCard } from '@/components/delivery/ActiveDeliveryCard';
import { DeliveryCallCard, DeliveryCallData } from '@/components/delivery/DeliveryCallCard';
import { supabase } from '@/integrations/supabase/client';
import { EmptyState } from '@/components/EmptyState';
import { useRealtimeCalls, IncomingCall, IncomingDeliveryCall } from '@/hooks/useRealtimeCalls';
import { useCallNotification } from '@/hooks/useCallNotification';
import { IncomingCallModal } from '@/components/IncomingCallModal';
import notificationSound from '@/assets/notification-beep.mp3';


export default function DeliveryCalls() {
  const { clearActiveProfile, user, activeProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isExiting, setIsExiting] = useState(false);
  const [calls, setCalls] = useState<DeliveryCallData[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isAcceptingModal, setIsAcceptingModal] = useState(false);

  const { 
    activeOrder, 
    hasActiveDelivery, 
    isLoading, 
    isValidating,
    validateCode,
    validatePickupCode,
    cancelDelivery,
    refetch 
  } = useDeliveryOrder();

  const isMotoboyContext = activeProfile === 'motoboy' || location.pathname.includes('motoboy');
  const vehicleType = isMotoboyContext ? 'moto' : 'carro';
  const backPath = isMotoboyContext ? '/motoboy' : '/driver';
  const profileLabel = isMotoboyContext ? 'Motoboy' : 'Motorista';
  const ProfileIcon = isMotoboyContext ? Bike : Truck;

  // Notification sound
  const { 
    playNotification,
    stopNotification,
    enableSound, 
    isBlocked: isSoundBlocked 
  } = useCallNotification({
    src: notificationSound,
    volume: 0.12,
  });

  // Handle new incoming call
  const handleNewCall = useCallback((call: IncomingCall) => {
    if (call.type === 'delivery' && !hasActiveDelivery) {
      playNotification();
      setShowModal(true);
    }
  }, [hasActiveDelivery, playNotification]);

  // Realtime subscription
  // ⚠️ Para motoboys, listenDeliveries=false: o GlobalCallContext+useDeliveryOfferListener
  // já gerencia as ofertas de entrega. Manter ativo aqui causaria áudio duplo.
  const { 
    currentCall, 
    removeCall, 
    isConnected,
  } = useRealtimeCalls({
    listenDeliveries: !isMotoboyContext,
    listenRides: false,
    vehicleType: vehicleType,
    onNewCall: handleNewCall,
    enabled: !hasActiveDelivery,
  });

  const handleExitProfile = async () => {
    setIsExiting(true);
    await clearActiveProfile();
    navigate('/select-profile');
  };

  const handleAcceptFromModal = async (callId: string) => {
    if (!user?.id || !currentCall) return;
    
    // 🔇 Parar notificação imediatamente ao aceitar
    stopNotification();
    setIsAcceptingModal(true);
    
    try {
      const deliveryCall = currentCall as IncomingDeliveryCall;

      // Generate delivery code on the server
      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_delivery_code');
      
      if (codeError) throw codeError;

      // Aceitar via RPC accept_service_order (obrigatório pelo banco)
      const { data: accepted, error } = await supabase
        .rpc('accept_service_order', { p_order_id: callId });

      if (error) throw error;
      
      if (!accepted) {
        toast.warning('Entrega já aceita por outro motoboy');
        return;
      }

      toast.success('Entrega aceita! Código gerado para confirmação.');
      removeCall(callId);
      setShowModal(false);
      refetch();
    } catch (error) {
      console.error('Error accepting delivery from modal:', error);
      toast.error('Erro ao aceitar entrega');
    } finally {
      setIsAcceptingModal(false);
    }
  };

  const handleRejectFromModal = (callId: string) => {
    // 🔇 Parar notificação ao rejeitar
    stopNotification();
    removeCall(callId);
    setShowModal(false);
    toast.info('Chamada recusada');
  };

  const handleExpireFromModal = (callId: string) => {
    // 🔇 Parar notificação ao expirar
    stopNotification();
    removeCall(callId);
    setShowModal(false);
    toast.warning('Tempo esgotado');
  };

  const handleAcceptDelivery = async (callId: string) => {
    if (!user?.id) return;
    
    setProcessingId(callId);
    
    try {
      const call = calls.find(c => c.id === callId);
      if (!call) return;

      // Generate delivery code on the server
      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_delivery_code');
      
      if (codeError) throw codeError;

      // Aceitar via RPC accept_service_order (obrigatório pelo banco)
      const { data: accepted, error } = await supabase
        .rpc('accept_service_order', { p_order_id: callId });

      if (error) {
        console.error('[DeliveryCalls] Erro ao aceitar entrega:', error);
        throw error;
      }
      
      if (!accepted) {
        toast.warning('Entrega já aceita por outro motoboy');
        return;
      }
      
      console.log('[DeliveryCalls] ✅ Entrega aceita:', callId);

      // Remove from calls list
      setCalls(prev => prev.filter(c => c.id !== callId));
      toast.success('Entrega aceita! Código gerado para confirmação.');
      
      // Refresh active order
      refetch();
    } catch (error) {
      console.error('Error accepting delivery:', error);
      toast.error('Erro ao aceitar entrega');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectDelivery = async (callId: string) => {
    setProcessingId(callId);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setCalls(prev => prev.filter(c => c.id !== callId));
    toast.info('Entrega recusada');
    setProcessingId(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Incoming Call Modal */}
      <IncomingCallModal
        call={currentCall}
        isOpen={showModal && currentCall !== null}
        onAccept={handleAcceptFromModal}
        onReject={handleRejectFromModal}
        onExpire={handleExpireFromModal}
        countdownSeconds={15}
        isAccepting={isAcceptingModal}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(backPath)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-500" />
              <span className="font-semibold">Entregas</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Sound status indicator */}
            {isSoundBlocked && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={enableSound}
                className="text-yellow-500"
              >
                <Volume2 className="h-5 w-5" />
              </Button>
            )}
            <Badge variant="secondary" className="bg-primary/10">
              <ProfileIcon className="h-3 w-3 mr-1" />
              {profileLabel}
            </Badge>
            {/* Realtime status */}
            <Badge 
              variant="secondary" 
              className={isConnected ? "bg-green-500/10 text-green-600" : "bg-yellow-500/10 text-yellow-600"}
            >
              <span className={`mr-1.5 h-2 w-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
              {isConnected ? 'Online' : 'Conectando...'}
            </Badge>
            <Button variant="ghost" size="icon" onClick={() => navigate('/wallet')}>
              <Wallet className="h-5 w-5" />
            </Button>
            <UserAvatar size="sm" />
            <ProfileSwitcher />
            <Button variant="ghost" size="icon" onClick={handleExitProfile} disabled={isExiting}>
              {isExiting ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 pb-20 space-y-4">
        {/* Status indicator */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">
            {hasActiveDelivery ? 'Entrega em Andamento' : 'Entregas Disponíveis'}
          </h1>
        </div>

        {/* Active Delivery */}
        {activeOrder && (
          <ActiveDeliveryCard
            order={activeOrder}
            onValidateCode={validateCode}
            onValidatePickup={validatePickupCode}
            onCancel={cancelDelivery}
            isValidating={isValidating}
          />
        )}

        {/* Available Calls */}
        {!hasActiveDelivery && calls.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nenhuma entrega no momento"
            description="Novas entregas aparecerão aqui automaticamente"
          />
        ) : !hasActiveDelivery && (
          <>
            <p className="text-sm text-muted-foreground">
              {calls.length} entrega{calls.length !== 1 ? 's' : ''} disponíve{calls.length !== 1 ? 'is' : 'l'}
            </p>
            {calls.map((call) => (
              <DeliveryCallCard
                key={call.id}
                call={call}
                onAccept={handleAcceptDelivery}
                onReject={handleRejectDelivery}
                isProcessing={processingId === call.id}
                hasActiveDelivery={hasActiveDelivery}
              />
            ))}
          </>
        )}

        {/* Info about delivery code */}
        {hasActiveDelivery && (
          <Card className="border-muted">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground text-center">
                💡 Ao entregar, solicite o código de 6 dígitos ao cliente para confirmar e liberar o pagamento.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
