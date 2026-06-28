import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  LogOut, Loader2, Wallet, Phone, MapPin, Navigation, 
  Clock, DollarSign, Star, User, Check, X, ArrowLeft, Car, Volume2, Trash2
} from 'lucide-react';
import ProfileSwitcher from '@/components/ProfileSwitcher';
import { UserAvatar } from '@/components/UserAvatar';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { useRealtimeCalls, IncomingCall } from '@/hooks/useRealtimeCalls';
import { useDriverCalls } from '@/hooks/useDriverCalls';
import { useCallNotification } from '@/hooks/useCallNotification';
import { IncomingCallModal } from '@/components/IncomingCallModal';
import notificationSound from '@/assets/notification-beep.mp3';

export default function DriverCalls() {
  const { clearActiveProfile } = useAuth();
  const navigate = useNavigate();
  const [isExiting, setIsExiting] = useState(false);

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

  // ARQUITETURA: Estado local soberano para chamadas
  const {
    activeCall,
    showModal,
    history,
    isProcessing: isAcceptingCall,
    isReserva,
    receiveCall,
    closeModal,
    acceptCall,
    rejectCall,
    clearHistory,
    enterReservaMode,
  } = useDriverCalls({
    onCallReceived: playNotification,
    onReservaMode: stopNotification, // Para o BIP quando entra em modo reserva
  });

  // Handle new incoming call from realtime
  const handleRealtimeCall = useCallback((call: IncomingCall) => {
    console.log('[DriverCalls] Chamada recebida do realtime:', call.id);
    // Passar chamada para o estado local soberano
    receiveCall(call);
  }, [receiveCall]);

  // Handle call status change to 'reserva' from realtime (via UPDATE event)
  const handleCallStatusChange = useCallback((callId: string, newStatus: string) => {
    if (newStatus === 'reserva') {
      console.log('[DriverCalls] 📦 Realtime: corrida mudou para reserva:', callId);
      enterReservaMode();
    }
  }, [enterReservaMode]);

  // Realtime subscription - APENAS como gatilho de evento
  const { isConnected } = useRealtimeCalls({
    listenDeliveries: false,
    listenRides: true,
    onNewCall: handleRealtimeCall,
    onStatusChange: handleCallStatusChange,
    enabled: true,
  });

  const handleExitProfile = async () => {
    setIsExiting(true);
    await clearActiveProfile();
    navigate('/select-profile');
  };

  // Modal: Aceitar chamada
  const handleAcceptFromModal = async (callId: string) => {
    // O acceptCall já faz o update no banco e gerencia isProcessing
    await acceptCall(callId);
  };

  // Modal: Recusar chamada
  const handleRejectFromModal = (callId: string) => {
    rejectCall(callId);
    toast.info('Chamada recusada');
  };

  // Modal: Tempo esgotado - atualiza status para 'reserva' e fecha modal
  const handleExpireFromModal = async () => {
    console.log('[DriverCalls] Modal expirou - atualizando para reserva');
    const callId = activeCall?.id;
    await closeModal(callId);
    toast.info('Corrida em reserva - ainda disponível para aceitar', {
      duration: 4000,
      icon: '⏰',
    });
  };

  // Lista: Aceitar chamada
  const handleAcceptRide = async (callId: string) => {
    // O acceptCall já faz o update no banco e gerencia isProcessing
    await acceptCall(callId);
  };

  // Lista: Recusar chamada
  const handleRejectRide = (callId: string) => {
    rejectCall(callId);
    toast.info('Corrida recusada');
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3.5 w-3.5 ${
              star <= Math.round(rating)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/30'
            }`}
          />
        ))}
        <span className="ml-1 text-sm font-medium">{rating.toFixed(1)}</span>
      </div>
    );
  };

  // Helper para obter nome do passageiro/cliente
  const getCallName = (call: IncomingCall) => {
    if (call.type === 'delivery') {
      return call.customer_name || 'Cliente';
    }
    // Rides don't have passenger name in the current schema
    return 'Passageiro';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Incoming Call Modal - usa estado local */}
      <IncomingCallModal
        call={activeCall}
        isOpen={showModal && activeCall !== null}
        onAccept={handleAcceptFromModal}
        onReject={handleRejectFromModal}
        onExpire={handleExpireFromModal}
        countdownSeconds={15}
        isAccepting={isAcceptingCall}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/driver')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              <span className="font-semibold">Chamadas</span>
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
            {isReserva ? 'Corrida em Espera' : 'Chamadas Pendentes'}
          </h1>
          {activeCall && (
            <Badge 
              variant="default" 
              className={isReserva ? 'bg-blue-600' : 'bg-primary animate-pulse'}
            >
              {isReserva ? '⏳ Reserva' : '1 ativa'}
            </Badge>
          )}
        </div>

        {/* Chamada Ativa */}
        {activeCall && activeCall.type === 'ride' && (
          <Card className={`overflow-hidden shadow-lg ${isReserva ? 'border-blue-600/50' : 'border-primary/50'}`}>
            <CardHeader className={`pb-3 ${isReserva ? 'bg-gradient-to-r from-blue-600/10 to-transparent' : 'bg-gradient-to-r from-primary/10 to-transparent'}`}>
              <div className="flex items-center justify-between">
                <Badge variant="default" className={isReserva ? 'bg-blue-600' : 'bg-primary'}>
                  {isReserva ? '⏳ Modo Espera' : 'Chamada Ativa'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {isReserva ? 'Ainda disponível para aceitar' : 'Aguardando resposta'}
                </span>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4 pt-4">
              {/* Passenger Info */}
              <div className="flex items-start gap-3">
                <Avatar className="h-14 w-14 border-2 border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getCallName(activeCall).charAt(0)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold">{getCallName(activeCall)}</h3>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>Corrida</span>
                  </div>
                  
                  {renderStars(4.5)}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Ride Info */}
              <div className="space-y-3">
                {/* Pickup */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-green-500/10 p-1.5">
                    <MapPin className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Embarque</p>
                    <p className="text-sm font-medium">{activeCall.pickup_location}</p>
                  </div>
                </div>

                {/* Destination */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-red-500/10 p-1.5">
                    <Navigation className="h-4 w-4 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Destino</p>
                    <p className="text-sm font-medium">{activeCall.destination}</p>
                  </div>
                </div>
              </div>

              {/* Ride Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <Car className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Distância</p>
                  <p className="text-sm font-semibold">--</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Tempo</p>
                  <p className="text-sm font-semibold">--</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-3 text-center">
                  <DollarSign className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="text-sm font-semibold text-primary">
                    R$ {activeCall.estimated_value.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => handleRejectRide(activeCall.id)}
                  disabled={isAcceptingCall}
                >
                  <X className="h-4 w-4 mr-2" />
                  Recusar
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => handleAcceptRide(activeCall.id)}
                  disabled={isAcceptingCall}
                >
                  {isAcceptingCall ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Aceitar
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State - apenas quando não há chamada ativa */}
        {!activeCall && (
          <EmptyState
            icon={Phone}
            title="Nenhuma chamada no momento"
            description="Novas chamadas aparecerão aqui automaticamente"
          />
        )}

        {/* Histórico de Chamadas */}
        {history.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Histórico Recente</h2>
              <Button variant="ghost" size="sm" onClick={clearHistory}>
                <Trash2 className="h-4 w-4 mr-1" />
                Limpar
              </Button>
            </div>
            {history.slice(0, 5).map((call) => (
              <Card key={call.id} className="opacity-60">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-2 ${
                        (call as any)._status === 'accepted' 
                          ? 'bg-green-500/10' 
                          : 'bg-red-500/10'
                      }`}>
                        {(call as any)._status === 'accepted' 
                          ? <Check className="h-4 w-4 text-green-600" />
                          : <X className="h-4 w-4 text-red-600" />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {getCallName(call)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(call as any)._status === 'accepted' ? 'Aceita' : 'Recusada'}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">
                      R$ {call.estimated_value.toFixed(2)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
