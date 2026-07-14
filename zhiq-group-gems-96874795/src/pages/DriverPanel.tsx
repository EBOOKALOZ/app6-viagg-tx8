import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalCall } from '@/contexts/GlobalCallContext';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Phone, ArrowRight } from 'lucide-react';
import { useDriverCommission } from '@/hooks/useDriverCommission';
import {
  HeroCommissionCard,
  QuickMetricsRow,
  EconomicRadarCard,
} from '@/components/motoboy/premium';
import DriverActiveCallCard from '@/components/driver/DriverActiveCallCard';

export default function DriverPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    commissionRate,
    activeGroups,
    isOnline,
    toggleOnline,
    isLoading,
  } = useDriverCommission(user?.id);

  const [driverLocation, setDriverLocation] = useState<{ cidade: string; estado: string } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('driver_profiles')
      .select('cidade, estado')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && (data.cidade || data.estado)) {
          setDriverLocation({ cidade: data.cidade || '', estado: data.estado || '' });
        }
      });
  }, [user?.id]);

  const {
    activeCall,
    showModal,
    hasActiveCall,
    isProcessing,
    acceptCall,
    rejectCall,
  } = useGlobalCall();

  const handleToggleOnline = async () => {
    if (isProcessing) return;
    try {
      await toggleOnline();
      toast.success(!isOnline ? 'Você está ONLINE! 🚗' : 'Você está OFFLINE.');
    } catch {
      toast.error('Erro ao mudar status');
    }
  };

  if (hasActiveCall && !showModal && activeCall) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <DriverActiveCallCard
          call={activeCall}
          onAccept={acceptCall}
          onReject={rejectCall}
          isAccepting={isProcessing}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-3 space-y-4 overflow-y-auto">
      {/* Card de comissão principal */}
      <div onClick={() => navigate('/driver/comissao')} className="cursor-pointer transition-transform active:scale-[0.99]">
        <HeroCommissionCard
          commissionRate={commissionRate}
          activeGroups={activeGroups}
          isLoading={isLoading}
        />
      </div>

      {/* Métricas rápidas — clique para toggle online */}
      <div onClick={handleToggleOnline} className="cursor-pointer">
        <QuickMetricsRow
          activeGroups={activeGroups}
          maxGroups={3}
          isOnline={isOnline}
          isLoading={isLoading}
        />
      </div>

      {/* Radar econômico */}
      <div onClick={() => navigate('/driver/comissao')} className="cursor-pointer transition-transform active:scale-[0.99]">
        <EconomicRadarCard
          commissionRate={commissionRate}
          isLoading={isLoading}
        />
      </div>

      {/* Localização cadastrada */}
      {driverLocation && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-blue-500/10 to-blue-500/5 border border-blue-500/20">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
            <MapPin className="h-4 w-4 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Localização Atual (Cadastro)</p>
            <p className="text-sm font-bold text-foreground truncate">
              {[driverLocation.cidade, driverLocation.estado].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Botão de corridas */}
      <div className="pt-2 px-1">
        <button
          onClick={() => { window.location.href = '/driver/calls'; }}
          className={`relative w-full h-14 text-lg font-bold rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-lg shadow-blue-700/30 ${hasActiveCall ? 'animate-pulse' : ''}`}
        >
          <Phone className="h-5 w-5" />
          <span>VER CORRIDAS</span>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
