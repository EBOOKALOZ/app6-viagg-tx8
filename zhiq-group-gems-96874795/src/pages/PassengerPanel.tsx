import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSoundSettings } from "@/contexts/SoundSettingsContext";
import PassengerHeader from "@/components/passenger/PassengerHeader";
import MapView from "@/components/passenger/MapView";
import RideRequestCard from "@/components/passenger/RideRequestCard";
import RequestRideModal from "@/components/passenger/RequestRideModal";
import RideStatus from "@/components/passenger/RideStatus";
import QuickActions from "@/components/passenger/QuickActions";
import PassengerIncentives from "@/components/passenger/PassengerIncentives";
import { useSoundtrackMusic } from "@/hooks/useSoundtrackMusic";
import backgroundMusic from "@/assets/viagg_search_loop.mp3";
import { ServiceType } from "@/lib/serviceTypes";
import { RidePreviewDataWithPrice } from "@/components/passenger/RequestRideModal";
import { usePassengerRide } from "@/hooks/usePassengerRide";

const PassengerPanel = () => {
  const navigate = useNavigate();
  const { displayName, user } = useAuth();
  const { soundtrackEnabled } = useSoundSettings();
  const [activeTab, setActiveTab] = useState("Início");
  const [balance, setBalance] = useState(3);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Hook ÚNICO para gerenciar corrida usando moto_taxi_corridas
  const {
    currentRide,
    motoTaxiInfo,
    isLoading,
    isCreating,
    rideStatus,
    createRide,
    cancelRide,
  } = usePassengerRide();

  // Trilha sonora controlada - trecho 0:21-0:47, volume 20%, fade-in/out
  // Só toca se o usuário ativou a opção E está em busca
  useSoundtrackMusic({
    src: backgroundMusic,
    startTime: 21,
    endTime: 47,
    volume: 0.2,
    isPlaying: soundtrackEnabled && rideStatus === "searching",
    fadeInDuration: 1000,
    fadeOutDuration: 500,
  });

  // Abrir modal quando clica no card de pedido
  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  // Confirmar corrida - INSERT na tabela correta baseado no tipo de serviço
  const handleConfirmRide = async (
    pickup: string, 
    destination: string, 
    serviceType: ServiceType,
    previewData: RidePreviewDataWithPrice
  ) => {
    if (!user?.id) {
      toast.error("Você precisa estar logado para pedir uma corrida");
      return;
    }

    if (!pickup.trim() || !destination.trim()) {
      toast.error("Preencha origem e destino");
      return;
    }

    const tableName = serviceType === 'motorista' ? 'motorista_corridas' : 'moto_taxi_corridas';
    console.log(`[PassengerPanel] 🚀 Criando corrida em ${tableName}`);
    console.log('[PassengerPanel] - passenger_id:', user.id);
    console.log('[PassengerPanel] - serviceType:', serviceType);
    console.log('[PassengerPanel] - preço:', previewData.estimatedPrice);

    // Usar o hook para criar corrida na tabela correta
    const ride = await createRide({
      serviceType, // NOVO: tipo de serviço determina tabela
      originAddress: pickup.trim(),
      originLat: previewData.pickupLat,
      originLng: previewData.pickupLng,
      destinationAddress: destination.trim(),
      destinationLat: previewData.destinationLat,
      destinationLng: previewData.destinationLng,
      estimatedKm: previewData.distanceKm,
      estimatedTimeMinutes: previewData.durationMin,
      estimatedPrice: previewData.estimatedPrice,
      passengerCount: previewData.passengerCount,
    });

    if (ride) {
      setIsModalOpen(false);
    }
  };

  const handleCancelRide = async () => {
    await cancelRide();
  };

  const handleQuickAction = (action: string) => {
    if (action === "Histórico") {
      navigate("/passenger/history");
      return;
    }
    if (action === "Carteira") {
      navigate("/wallet");
      return;
    }
    if (action === "Editar Perfil") {
      navigate("/profile");
      return;
    }
    if (action === "Suporte") {
      navigate("/support");
      return;
    }
    toast.info(`${action} - Em breve!`, {
      description: "Esta funcionalidade será implementada em breve.",
    });
  };

  const handleTabChange = (tab: string) => {
    if (tab === "Perfil") {
      navigate("/profile");
      return;
    }
    if (tab === "Histórico") {
      navigate("/passenger/history");
      return;
    }
    setActiveTab(tab);
  };

  // Converter dados do hook para formato esperado pelos componentes
  // NOTA: O campo 'status' no banco não armazena tipo de serviço. 
  // Usamos lógica: passenger_count > 0 indica Carro ('motorista')
  const inferredServiceType: ServiceType = currentRide?.passenger_count && currentRide.passenger_count > 0 
    ? 'motorista' 
    : 'mototaxi';

  const currentRideForUI = currentRide ? {
    id: currentRide.id,
    pickup: currentRide.origin_address,
    destination: currentRide.destination_address,
    passengerName: displayName || "Passageiro",
    serviceType: inferredServiceType,
    pickupLat: currentRide.origin_lat,
    pickupLng: currentRide.origin_lng,
    destinationLat: currentRide.destination_lat,
    destinationLng: currentRide.destination_lng,
    // Dados de estimativa para RideStatus
    estimatedKm: currentRide.estimated_km,
    estimatedTimeMinutes: currentRide.estimated_time_minutes,
    // NOVO: Dados financeiros para resumo (Carro)
    passengerCount: currentRide.passenger_count,
    finalPrice: currentRide.estimated_price,
  } : null;

  const driverInfoForUI = motoTaxiInfo ? {
    name: motoTaxiInfo.name,
    car: motoTaxiInfo.vehicleModel || 'Moto',
    plate: motoTaxiInfo.vehiclePlate || '',
    rating: motoTaxiInfo.rating,
    avatarUrl: motoTaxiInfo.avatarUrl,
    vehicleYear: motoTaxiInfo.vehicleYear,
    vehicleColor: motoTaxiInfo.vehicleColor,
    phone: motoTaxiInfo.phone,
  } : undefined;

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      {/* Header - altura fixa */}
      <PassengerHeader passengerName={displayName || "Usuário"} />

      {/* Container principal com altura fixa - mapa e formulário separados */}
      <div className="flex-1 flex flex-col pt-16 overflow-hidden">
        {/* Map Container - altura fixa no mobile (40vh) - z-index baixo para não sobrepor menus */}
        <div className="h-[40vh] min-h-[40vh] max-h-[40vh] flex-shrink-0 relative z-0">
          <MapView 
            rideStatus={rideStatus} 
            currentRide={currentRideForUI}
          />
        </div>

        {/* Form Container - resto da altura, com scroll */}
        <div className="flex-1 overflow-y-auto relative z-10 bg-background">
          {/* Content com padding */}
          <div className="px-4 py-4 space-y-5 pb-24">
            {/* Ride Request or Status */}
            {rideStatus === "idle" ? (
              <div onClick={handleOpenModal} className="cursor-pointer">
                <RideRequestCard 
                  onRequestRide={handleOpenModal as any} 
                  isLoading={isCreating} 
                  balance={balance} 
                />
              </div>
            ) : (
              <RideStatus
                status={rideStatus}
                driverInfo={rideStatus !== "searching" ? driverInfoForUI : undefined}
                rideInfo={currentRideForUI ? {
                  passengerName: currentRideForUI.passengerName,
                  pickup: currentRideForUI.pickup,
                  destination: currentRideForUI.destination,
                  pickupLat: currentRideForUI.pickupLat,
                  pickupLng: currentRideForUI.pickupLng,
                  estimatedKm: currentRideForUI.estimatedKm,
                  estimatedTimeMinutes: currentRideForUI.estimatedTimeMinutes,
                  passengerCount: currentRideForUI.passengerCount,
                  finalPrice: currentRideForUI.finalPrice,
                } : undefined}
                serviceType={currentRideForUI?.serviceType}
                onCancel={rideStatus !== "in_ride" ? handleCancelRide : undefined}
              />
            )}

            {/* Quick Actions */}
            <div className="pt-1">
              <QuickActions onAction={handleQuickAction} />
            </div>

            {/* Incentives Section */}
            <PassengerIncentives />
          </div>
        </div>
      </div>

      {/* Request Ride Modal */}
      <RequestRideModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onConfirm={handleConfirmRide}
        isLoading={isCreating}
      />
    </div>
  );
};

export default PassengerPanel;
