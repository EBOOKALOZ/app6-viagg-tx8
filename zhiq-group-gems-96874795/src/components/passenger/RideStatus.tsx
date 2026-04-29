import { useState } from "react";
import { Clock, Car, MapPin, CheckCircle2, X, Snowflake, CreditCard, User, Route, Timer, Bike, Users, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ServiceType, getWaitingText, getWaitingSubtitle } from "@/lib/serviceTypes";
import { useAuth } from "@/contexts/AuthContext";
import motoTaxiImage from "@/assets/moto-taxi-waiting-official.png";
import motoTaxiFallback from "@/assets/moto-taxi-waiting.png";
import motoristaWaitingImage from "@/assets/motorista-waiting.png";

// Helper para formatar preço
const formatPrice = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'R$ --';
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
};

type RideStatusType = "idle" | "searching" | "driver_coming" | "in_ride";

interface DriverInfo {
  name: string;
  car: string;
  plate: string;
  rating: number;
  eta?: string;
  // Novos campos
  age?: number;
  avatarUrl?: string;
  vehicleYear?: number;
  vehicleColor?: string;
  vehicleType?: "Hatch" | "Sedan" | "SUV" | "Picape" | "Van";
  hasAirConditioning?: boolean;
  cnhCategory?: string;
}

interface RideInfo {
  passengerName: string;
  pickup: string;
  destination: string;
  pickupLat?: number;
  pickupLng?: number;
  passengerAvatarUrl?: string;
  // Campos para estimativas
  estimatedKm?: number | null;
  estimatedTimeMinutes?: number | null;
  // NOVO: Campos para resumo financeiro (Carro)
  passengerCount?: number | null;
  finalPrice?: number | null;
}

interface RideStatusProps {
  status: RideStatusType;
  driverInfo?: DriverInfo;
  rideInfo?: RideInfo;
  serviceType?: ServiceType;
  onCancel?: () => void;
}

// Dynamic status config based on service type
const getStatusConfig = (serviceType?: ServiceType) => ({
  idle: {
    icon: Clock,
    title: "Nenhuma corrida em andamento",
    subtitle: "Peça uma corrida para começar",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
  },
  searching: {
    icon: Car,
    title: serviceType ? getWaitingText(serviceType) : "Aguardando...",
    subtitle: serviceType ? getWaitingSubtitle(serviceType) : "Sua solicitação foi enviada. Aguarde a confirmação.",
    color: "text-zhiq-gold",
    bgColor: "bg-zhiq-gold/10",
  },
  driver_coming: {
    icon: MapPin,
    title: serviceType === 'motorista' ? "Motorista a caminho" : serviceType === 'mototaxi' ? "Moto-táxi a caminho" : "Motoboy a caminho",
    subtitle: serviceType === 'motorista' ? "Seu motorista está indo até você" : "Seu prestador está indo até você",
    color: "text-zhiq-teal",
    bgColor: "bg-zhiq-teal/10",
  },
  in_ride: {
    icon: CheckCircle2,
    title: "Em corrida",
    subtitle: "Aproveite a viagem!",
    color: "text-zhiq-green",
    bgColor: "bg-zhiq-green/10",
  },
});

const RideStatus = ({ status, driverInfo, rideInfo, serviceType, onCancel }: RideStatusProps) => {
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);
  const config = getStatusConfig(serviceType)[status];
  const Icon = config.icon;
  
  // CORREÇÃO: Resolver avatar do passageiro (usuário logado)
  const passengerAvatar = rideInfo?.passengerAvatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const passengerInitial = rideInfo?.passengerName?.charAt(0)?.toUpperCase() || 'P';
  
  // Fonte da imagem do moto-táxi com fallback
  const motoTaxiSrc = imageError ? motoTaxiFallback : motoTaxiImage;

  // Estado de busca com UI destacada
  // Formatadores de distância e tempo
  const formatDistance = (km?: number | null) => {
    if (km === undefined || km === null) return '-- km';
    return `${km.toFixed(1).replace('.', ',')} km`;
  };

  const formatTime = (minutes?: number | null) => {
    if (minutes === undefined || minutes === null) return '-- min';
    return `${Math.round(minutes)} min`;
  };

  // Flag para identificar se é serviço de Carro
  const isCarService = serviceType === 'motorista';

  if (status === "searching") {
    return (
      <div className="rounded-2xl p-6 bg-gradient-to-br from-zhiq-gold/20 to-zhiq-gold/5 border-2 border-zhiq-gold/30 shadow-lg">
        {/* Indicador principal */}
        <div className="flex flex-col items-center text-center space-y-4">
          
          {/* Ícone/Imagem dinâmico por tipo de serviço */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            {isCarService ? (
              // Imagem do motorista para serviço Carro
              <img 
                src={motoristaWaitingImage} 
                alt="Motorista" 
                className="w-28 h-28 object-cover rounded-full z-10 border-2 border-zhiq-gold/30"
              />
            ) : (
              // Imagem do moto-táxi com fallback
              <>
                <img 
                  src={motoTaxiSrc} 
                  alt="Moto-táxi" 
                  className="w-28 h-28 object-contain z-10"
                  onError={() => {
                    console.log('[RideStatus] Erro ao carregar imagem, usando fallback');
                    setImageError(true);
                  }}
                />
                {imageError && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Bike className="w-16 h-16 text-zhiq-gold animate-pulse" />
                  </div>
                )}
              </>
            )}
            {/* Anel animado ao redor */}
            <div className="absolute inset-0 border-4 border-zhiq-gold/20 border-t-zhiq-gold rounded-full animate-spin" />
          </div>

          {/* Texto dinâmico */}
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-zhiq-gold">{config.title}</h3>
            <p className="text-sm text-muted-foreground">{config.subtitle}</p>
          </div>

          {/* Indicador de pontos */}
          <div className="flex items-center gap-1 py-2">
            <span className="w-2 h-2 bg-zhiq-gold rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-zhiq-gold rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-zhiq-gold rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>

          {/* CARD RESUMO - Exclusivo para serviço Carro */}
          {isCarService && rideInfo && (
            <div className="w-full p-4 bg-background/80 rounded-xl border border-zhiq-teal/30 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Car className="h-4 w-4 text-zhiq-teal" />
                Resumo da Corrida
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Tipo */}
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <Car className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Tipo</p>
                    <p className="text-sm font-medium text-foreground">Carro</p>
                  </div>
                </div>
                
                {/* Passageiros */}
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Passageiros</p>
                    <p className="text-sm font-medium text-foreground">{rideInfo.passengerCount || 1}</p>
                  </div>
                </div>
                
                {/* Distância */}
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <Route className="h-4 w-4 text-zhiq-teal" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Distância</p>
                    <p className="text-sm font-medium text-foreground">{formatDistance(rideInfo.estimatedKm)}</p>
                  </div>
                </div>
                
                {/* Tempo */}
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <Timer className="h-4 w-4 text-zhiq-gold" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Tempo</p>
                    <p className="text-sm font-medium text-foreground">{formatTime(rideInfo.estimatedTimeMinutes)}</p>
                  </div>
                </div>
              </div>
              
              {/* Valor Total - Destaque */}
              <div className="flex items-center justify-between p-3 bg-zhiq-teal/10 rounded-lg border border-zhiq-teal/30">
                <div className="flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-zhiq-teal" />
                  <span className="text-sm font-medium text-foreground">Total</span>
                </div>
                <span className="text-xl font-bold text-zhiq-teal">{formatPrice(rideInfo.finalPrice)}</span>
              </div>
            </div>
          )}

          {/* Distância e Tempo Estimado - Layout tradicional (Moto-Táxi) */}
          {!isCarService && rideInfo && (
            <div className="flex items-center justify-center gap-6 py-2 px-4 bg-background/60 rounded-xl border border-border/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-zhiq-teal/10 flex items-center justify-center">
                  <Route className="h-4 w-4 text-zhiq-teal" />
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">Distância</p>
                  <p className="text-sm font-semibold text-foreground">{formatDistance(rideInfo.estimatedKm)}</p>
                </div>
              </div>
              
              <div className="w-px h-8 bg-border/50" />
              
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-zhiq-gold/10 flex items-center justify-center">
                  <Timer className="h-4 w-4 text-zhiq-gold" />
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">Tempo médio</p>
                  <p className="text-sm font-semibold text-foreground">{formatTime(rideInfo.estimatedTimeMinutes)}</p>
                </div>
              </div>
            </div>
          )}

            {/* Dados da solicitação COM FOTO DO PASSAGEIRO */}
            {rideInfo && (
              <div className="w-full bg-background/60 rounded-xl p-4 text-left space-y-3 border border-border/50">
                {/* Avatar + Nome do passageiro */}
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12 border-2 border-zhiq-teal/30 shadow-md">
                    <AvatarImage src={passengerAvatar || undefined} alt={rideInfo.passengerName} />
                    <AvatarFallback className="bg-gradient-to-br from-zhiq-teal to-zhiq-green text-white font-bold text-lg">
                      {passengerInitial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{rideInfo.passengerName}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 text-zhiq-teal" />
                      <span>Minha localização atual</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2 pt-2 border-t border-border/30">
                  <div className="flex items-start gap-2">
                    <div className="w-4 h-4 flex items-center justify-center mt-0.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-zhiq-green border-2 border-zhiq-green/30" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Origem</p>
                      <p className="text-sm font-medium text-foreground">{rideInfo.pickup}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <div className="w-4 h-4 flex items-center justify-center mt-0.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-zhiq-gold border-2 border-zhiq-gold/30" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Destino</p>
                      <p className="text-sm font-medium text-foreground">{rideInfo.destination}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

          {/* Botão Cancelar */}
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              className="mt-2 border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive"
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar Corrida
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Estado aceito ou em corrida - UI completa com dados do motorista
  return (
    <div className="rounded-2xl overflow-hidden border-2 border-zhiq-teal/30 shadow-lg bg-gradient-to-br from-zhiq-teal/10 to-background">
      {/* Header com status */}
      <div className="px-4 py-3 bg-zhiq-teal/10 border-b border-zhiq-teal/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zhiq-teal/20 flex items-center justify-center">
            <Icon className="h-5 w-5 text-zhiq-teal" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-zhiq-teal">{config.title}</p>
            <p className="text-sm text-muted-foreground">{config.subtitle}</p>
          </div>
          {status === "driver_coming" && onCancel && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCancel}
              className="text-destructive hover:bg-destructive/10"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Dados do passageiro COM FOTO - Minha localização */}
        {rideInfo && (
          <div className="bg-background/60 rounded-xl p-4 border border-border/50 space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="w-12 h-12 border-2 border-zhiq-green/30 shadow-md">
                <AvatarImage src={passengerAvatar || undefined} alt={rideInfo.passengerName} />
                <AvatarFallback className="bg-gradient-to-br from-zhiq-teal to-zhiq-green text-white font-bold text-lg">
                  {passengerInitial}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-semibold text-foreground">{rideInfo.passengerName}</p>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-zhiq-teal" />
                  <span>Minha localização atual</span>
                </div>
              </div>
            </div>
            
            {/* Origem e destino */}
            <div className="space-y-2 pt-2 border-t border-border/30">
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 flex items-center justify-center mt-0.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-zhiq-teal border-2 border-zhiq-teal/30" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Origem</p>
                  <p className="text-sm font-medium text-foreground">{rideInfo.pickup}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 flex items-center justify-center mt-0.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-zhiq-gold border-2 border-zhiq-gold/30" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Destino</p>
                  <p className="text-sm font-medium text-foreground">{rideInfo.destination}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Driver info - Enhanced */}
        {driverInfo && (
          <div className="bg-background/60 rounded-xl p-4 border border-border/50 space-y-4">
            {/* Header com foto e dados básicos */}
            <div className="flex items-center gap-3">
              <Avatar className="w-14 h-14 border-2 border-zhiq-teal/30">
                <AvatarImage src={driverInfo.avatarUrl} alt={driverInfo.name} />
                <AvatarFallback className="bg-gradient-to-br from-zhiq-teal to-zhiq-green text-white font-bold text-lg">
                  {driverInfo.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{driverInfo.name}</p>
                  {driverInfo.age && (
                    <span className="text-xs text-muted-foreground">
                      {driverInfo.age} anos
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-sm font-medium text-zhiq-gold">⭐ {driverInfo.rating}</span>
                  {driverInfo.eta && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{driverInfo.eta}</span>
                    </>
                  )}
                </div>
              </div>
              {driverInfo.cnhCategory && (
                <Badge variant="outline" className="text-xs border-zhiq-teal/50 text-zhiq-teal">
                  <CreditCard className="h-3 w-3 mr-1" />
                  CNH {driverInfo.cnhCategory}
                </Badge>
              )}
            </div>

            <Separator className="bg-border/50" />

            {/* Dados do veículo */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide font-medium">
                <Car className="h-3.5 w-3.5" />
                Veículo
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Modelo e placa */}
                <div className="bg-muted/30 rounded-lg p-2.5">
                  <p className="text-sm font-medium text-foreground">{driverInfo.car}</p>
                  <p className="text-xs text-muted-foreground">
                    {driverInfo.plate}
                  </p>
                </div>

                {/* Ano e cor */}
                <div className="bg-muted/30 rounded-lg p-2.5">
                  <div className="flex items-center gap-2">
                    {driverInfo.vehicleColor && (
                      <span className="text-sm font-medium text-foreground">
                        {driverInfo.vehicleColor}
                      </span>
                    )}
                    {driverInfo.vehicleYear && (
                      <span className="text-xs text-muted-foreground">
                        • {driverInfo.vehicleYear}
                      </span>
                    )}
                  </div>
                  {driverInfo.vehicleType && (
                    <p className="text-xs text-muted-foreground">{driverInfo.vehicleType}</p>
                  )}
                </div>
              </div>

              {/* Conforto */}
              {driverInfo.hasAirConditioning !== undefined && (
                <div className="flex items-center gap-2 pt-1">
                  <div 
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      driverInfo.hasAirConditioning 
                        ? "bg-zhiq-teal/10 text-zhiq-teal" 
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Snowflake className="h-3.5 w-3.5" />
                    {driverInfo.hasAirConditioning ? "Com Ar-condicionado" : "Sem Ar-condicionado"}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mensagem quando não tem driverInfo ainda - UI mais rica */}
        {!driverInfo && status === "driver_coming" && (
          <div className="bg-gradient-to-br from-zhiq-teal/10 to-background rounded-xl p-6 border-2 border-zhiq-teal/30 text-center space-y-4">
            {/* Spinner com ícone */}
            <div className="flex items-center justify-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-zhiq-teal/20 border-t-zhiq-teal rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Bike className="h-6 w-6 text-zhiq-teal" />
                </div>
              </div>
            </div>
            
            {/* Texto informativo */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Conectando com seu moto-táxi...</p>
              <p className="text-xs text-muted-foreground">Buscando foto, nome e dados do veículo</p>
            </div>
            
            {/* Indicador de progresso */}
            <div className="flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 bg-zhiq-teal rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-zhiq-teal rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-zhiq-teal rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RideStatus;
