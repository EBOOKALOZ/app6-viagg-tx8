import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Truck, Phone, Package } from 'lucide-react';
import { PanelHeader } from '@/components/PanelHeader';
import DriverProfileForm from '@/components/driver/DriverProfileForm';
import DriverWhatsAppGroups from '@/components/driver/DriverWhatsAppGroups';
import DriverIncentives from '@/components/driver/DriverIncentives';
import DriverActiveCallCard from '@/components/driver/DriverActiveCallCard';
import { useDeliveryOrder } from '@/hooks/useDeliveryOrder';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalCall } from '@/contexts/GlobalCallContext';

export default function DriverPanel() {
  const navigate = useNavigate();
  const { user, activeProfile, providerRole } = useAuth();
  const { hasActiveDelivery } = useDeliveryOrder();

  // Usar contexto global de chamadas
  const {
    activeCall,
    showModal,
    hasActiveCall,
    isProcessing,
    isConnected,
    isSoundBlocked,
    acceptCall,
    rejectCall,
    enableSound,
  } = useGlobalCall();

  // Debug
  console.log('[DriverPanel] Auth state - user:', user?.id, 'activeProfile:', activeProfile);
  console.log('[DriverPanel] hasActiveCall:', hasActiveCall, 'showModal:', showModal);

  // Mapa de exibição do provider_role
  const PROVIDER_DISPLAY = {
    motorista: { icon: '🚗', label: 'Motorista' },
    motoboy: { icon: '🛵', label: 'Motoboy' },
    mototaxi: { icon: '🏍️', label: 'Moto-táxi' },
  };
  const currentProvider = PROVIDER_DISPLAY[providerRole || 'motorista'];

  return (
    <div className="flex flex-col flex-1">
      <PanelHeader icon={Truck} label="Motorista">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/driver/calls')} 
          className="relative"
          title="Chamados"
        >
          <Phone className="h-5 w-5" />
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
            2
          </span>
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/driver/deliveries')} 
          className="relative"
          title="Entregas"
        >
          <Package className="h-5 w-5" />
          {hasActiveDelivery && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-accent animate-pulse" />
          )}
        </Button>
        {/* Indicador de conexão */}
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} title={isConnected ? 'Online' : 'Conectando...'} />
      </PanelHeader>

      <main className="p-4 pb-20 space-y-4">
        {/* Card fixo de chamada ativa - aparece quando há chamada e modal NÃO está aberto */}
        {hasActiveCall && !showModal && activeCall && (
          <DriverActiveCallCard
            call={activeCall}
            onAccept={acceptCall}
            onReject={rejectCall}
            isAccepting={isProcessing}
          />
        )}

        <DriverProfileForm />
        <DriverWhatsAppGroups />
        <DriverIncentives />
      </main>
    </div>
  );
}
