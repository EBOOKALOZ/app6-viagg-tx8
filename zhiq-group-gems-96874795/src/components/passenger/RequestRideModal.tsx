import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { MapPin, Navigation, X, Loader2, Clock, Route, AlertCircle, AlertTriangle, Edit3, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { ServiceType, RIDE_SERVICE_OPTIONS } from "@/lib/serviceTypes";
import { useRidePreview, RidePreviewData } from "@/hooks/useRidePreview";
import { useGeolocation } from "@/hooks/useGeolocation";
import { calculateRidePrice, formatRidePrice, RIDE_PRICING, GLOBAL_MAX_DISTANCE_KM } from "@/lib/ridePricing";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
// NOTA: SimpleMap removido - o modal usa Leaflet diretamente para ajuste de pins
// O mapa principal (MapView) no PassengerPanel é atualizado via props

// Interface estendida para incluir preço calculado, source e passenger count
export interface RidePreviewDataWithPrice extends RidePreviewData {
  estimatedPrice: number;
  destinationSource?: 'geocode' | 'manual';
  passengerCount?: number; // Número de passageiros (para Carro)
}

interface RequestRideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    pickup: string, 
    destination: string, 
    serviceType: ServiceType,
    previewData: RidePreviewDataWithPrice
  ) => Promise<void>;
  isLoading?: boolean;
}

// Estados do fluxo
type FlowState = 
  | 'input'              // Usuário digitando destino
  | 'geocoding'          // Geocodificando endereço
  | 'pickup_adjust'      // NOVO: Ajustando embarque no mapa
  | 'pin_adjust'         // Mapa aberto, pin arrastável para destino
  | 'calculating'        // Calculando rota real após confirmar pin
  | 'ready'              // Rota calculada, pronto para selecionar veículo
  | 'passenger_select'   // Seleção de número de passageiros (para Carro)
  | 'summary';           // NOVO: Resumo completo antes de confirmar

interface GeocodedLocation {
  lat: number;
  lng: number;
  displayName: string;
  isApproximate?: boolean;
}

const RequestRideModal = ({ 
  open, 
  onOpenChange, 
  onConfirm,
  isLoading = false 
}: RequestRideModalProps) => {
  const [pickup, setPickup] = useState("Minha localização atual");
  const [destination, setDestination] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>("mototaxi");
  const [passengerCount, setPassengerCount] = useState<number>(1); // NOVO: Número de passageiros para Carro
  
  // NOVO: Estado do fluxo
  const [flowState, setFlowState] = useState<FlowState>('input');
  
  // Geocoded destination (antes de confirmar)
  const [geocodedDest, setGeocodedDest] = useState<GeocodedLocation | null>(null);
  
  // Coordenadas finais confirmadas
  const [confirmedDestCoords, setConfirmedDestCoords] = useState<{lat: number; lng: number} | null>(null);
  
  // NOVO: Coordenadas de embarque (pickup) customizadas
  const [customPickupCoords, setCustomPickupCoords] = useState<{lat: number; lng: number} | null>(null);
  
  // Hooks para geolocalização e preview
  const { position, getCurrentPosition, isLoading: isGettingLocation } = useGeolocation();
  const { previewData, isCalculating, error: previewError, calculatePreviewWithCoords, clearPreview } = useRidePreview();

  // Estado do mapa inline
  const [mapRef, setMapRef] = useState<HTMLDivElement | null>(null);
  const [leafletMap, setLeafletMap] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);
  const [currentPinCoords, setCurrentPinCoords] = useState<{lat: number; lng: number} | null>(null);
  
  // NOVO: polyline no mapa de ajuste
  const [routePolyline, setRoutePolyline] = useState<any>(null);
  
  // Ref para debounce do recálculo de rota
  const routeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Preview temporário durante arraste (sem preço, só para visualização)
  const [dragPreview, setDragPreview] = useState<{
    polyline: [number, number][];
    distanceKm: number;
    durationMin: number;
  } | null>(null);

  // Limpar tudo quando modal fecha
  useEffect(() => {
    if (!open) {
      clearPreview();
      setDestination("");
      setGeocodedDest(null);
      setConfirmedDestCoords(null);
      setCustomPickupCoords(null);
      setFlowState('input');
      setCurrentPinCoords(null);
      setRoutePolyline(null);
      setPassengerCount(1); // Reset para 1 passageiro
      // Limpar mapa
      if (leafletMap) {
        leafletMap.remove();
        setLeafletMap(null);
        setMarker(null);
      }
    }
  }, [open, clearPreview, leafletMap]);

  // ========== PASSO 1: GEOCODIFICAR (MANUAL - APENAS AO CLICAR NO BOTÃO) ==========
  const handleSearchDestination = useCallback(async () => {
    if (destination.trim().length < 3) {
      toast.error("Digite um endereço mais completo");
      return;
    }

    setFlowState('geocoding');
    
    try {
      console.log('[RequestRideModal] 📍 Geocodificando:', destination.trim());
      const { data: geoData, error: geoError } = await supabase.functions.invoke('geocode-address', {
        body: { address: destination.trim() },
      });

      // Verificar se encontrou algo
      if (geoError) {
        console.error('[RequestRideModal] ❌ Erro geocodificação:', geoError);
        // Em vez de erro, permitir ajuste manual
        toast.warning("Endereço não encontrado", {
          description: "Use o mapa para definir o destino manualmente",
        });
        // Abrir mapa na posição atual para ajuste manual
        const currentPos = position || customPickupCoords;
        if (currentPos) {
          setCurrentPinCoords({ lat: currentPos.lat, lng: currentPos.lng });
          setFlowState('pin_adjust');
        } else {
          // Tentar obter GPS
          try {
            const gps = await getCurrentPosition();
            if (gps) {
              setCurrentPinCoords({ lat: gps.lat, lng: gps.lng });
              setFlowState('pin_adjust');
            }
          } catch {
            toast.error("Ative o GPS para ajustar o destino no mapa");
            setFlowState('input');
          }
        }
        return;
      }

      // Se não encontrou (404), permitir ajuste manual
      if (!geoData?.lat || !geoData?.lng) {
        console.log('[RequestRideModal] ⚠️ Endereço não encontrado');
        toast.warning("Endereço não encontrado", {
          description: "Use o mapa para definir o destino manualmente",
        });
        const currentPos = position || customPickupCoords;
        if (currentPos) {
          setCurrentPinCoords({ lat: currentPos.lat, lng: currentPos.lng });
          setFlowState('pin_adjust');
        }
        return;
      }

      const lat = Number(geoData.lat);
      const lng = Number(geoData.lng);
      const isApproximate = geoData.is_approximate === true;
      
      console.log('[RequestRideModal] ✅ Geocodificado:', { 
        lat, lng, 
        display: geoData.display_name,
        type: geoData.type,
        isApproximate 
      });
      
      setGeocodedDest({
        lat,
        lng,
        displayName: geoData.display_name || destination.trim(),
        isApproximate,
      });
      setCurrentPinCoords({ lat, lng });
      
      // Mostrar aviso se for localização aproximada
      if (isApproximate) {
        toast.info("Local aproximado encontrado", {
          description: "Ajuste o destino no mapa se necessário",
        });
      }
      
      // Ir para ajuste de pin (NÃO calcula rota ainda!)
      setFlowState('pin_adjust');
      
    } catch (err) {
      console.error('[RequestRideModal] ❌ Erro:', err);
      toast.error("Erro ao buscar endereço");
      setFlowState('input');
    }
  }, [destination]);

  // ========== PASSO 2: INICIALIZAR MAPA QUANDO ENTRA EM PIN_ADJUST OU PICKUP_ADJUST ==========
  useEffect(() => {
    const isMapState = flowState === 'pin_adjust' || flowState === 'pickup_adjust';
    if (!isMapState || !mapRef || !currentPinCoords || leafletMap) return;

    // Importar Leaflet dinamicamente
    import('leaflet').then((L) => {
      // Fix default markers
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      const map = L.map(mapRef, {
        center: [currentPinCoords.lat, currentPinCoords.lng],
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      // Cor baseada no tipo: teal para pickup, amber para destino
      const markerColor = flowState === 'pickup_adjust' ? '#14b8a6' : '#f59e0b';

      // Criar ícone personalizado arrastável
      const draggableIcon = L.divIcon({
        html: `
          <div style="
            width: 48px;
            height: 48px;
            background: ${markerColor};
            border: 4px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            cursor: grab;
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
        `,
        className: 'draggable-pin',
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      });

      // Criar marcador arrastável
      const newMarker = L.marker([currentPinCoords.lat, currentPinCoords.lng], {
        icon: draggableIcon,
        draggable: true,
      }).addTo(map);

      // Atualizar coordenadas quando arrasta
      newMarker.on('dragend', () => {
        const pos = newMarker.getLatLng();
        console.log('[RequestRideModal] 📍 Pin movido para:', pos.lat, pos.lng);
        setCurrentPinCoords({ lat: pos.lat, lng: pos.lng });
      });

      // Permitir clicar no mapa para mover
      map.on('click', (e: any) => {
        newMarker.setLatLng(e.latlng);
        setCurrentPinCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      setLeafletMap(map);
      setMarker(newMarker);

      // Fix tamanho
      setTimeout(() => map.invalidateSize(), 100);
    });

    return () => {
      // Cleanup será feito quando modal fechar
    };
  }, [flowState, mapRef, currentPinCoords, leafletMap]);

  // ========== NOVO: RECALCULAR POLYLINE QUANDO PIN É ARRASTADO ==========
  useEffect(() => {
    // Só calcular quando estiver no estado de ajuste de destino e tiver mapa
    if (flowState !== 'pin_adjust' || !leafletMap || !currentPinCoords) return;
    
    // Obter coordenadas de origem
    const pickupCoords = customPickupCoords || position;
    if (!pickupCoords) return;
    
    // Debounce para evitar muitas chamadas à API
    if (routeDebounceRef.current) {
      clearTimeout(routeDebounceRef.current);
    }
    
    routeDebounceRef.current = setTimeout(async () => {
      console.log('[RequestRideModal] 🔄 Recalculando rota para preview...');
      
      try {
        // Chamar edge function com snap
        const { data: routeData, error } = await supabase.functions.invoke('get-route', {
          body: {
            origin: { lat: pickupCoords.lat, lng: pickupCoords.lng },
            destination: { lat: currentPinCoords.lat, lng: currentPinCoords.lng },
            snapRadius: 500, // Snap para via mais próxima
          },
        });
        
        if (error || !routeData?.geometry?.coordinates) {
          console.warn('[RequestRideModal] ⚠️ Erro ao calcular rota preview:', error);
          return;
        }
        
        // Converter coordenadas GeoJSON [lng, lat] para Leaflet [lat, lng]
        const polylineCoords: [number, number][] = routeData.geometry.coordinates.map(
          (coord: [number, number]) => [coord[1], coord[0]]
        );
        
        // Calcular métricas
        const distanceKm = Math.round((routeData.distance / 1000) * 10) / 10;
        const durationMin = Math.ceil(routeData.duration / 60);
        
        console.log('[RequestRideModal] ✅ Preview atualizado:', distanceKm, 'km,', durationMin, 'min');
        
        // Salvar preview
        setDragPreview({
          polyline: polylineCoords,
          distanceKm,
          durationMin,
        });
        
        // Desenhar polyline no mapa de ajuste
        // Importar L se não disponível
        import('leaflet').then((L) => {
          // Remover polyline anterior
          if (routePolyline) {
            leafletMap.removeLayer(routePolyline);
          }
          
          // Desenhar nova polyline tracejada
          const newPolyline = L.polyline(polylineCoords, {
            color: '#10B981', // Verde
            weight: 4,
            opacity: 0.8,
            dashArray: '12, 8', // Tracejada
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(leafletMap);
          
          setRoutePolyline(newPolyline);
        });
        
      } catch (err) {
        console.error('[RequestRideModal] ❌ Erro preview:', err);
      }
    }, 400); // 400ms de debounce
    
    return () => {
      if (routeDebounceRef.current) {
        clearTimeout(routeDebounceRef.current);
      }
    };
  }, [flowState, leafletMap, currentPinCoords, customPickupCoords, position, routePolyline]);

  const handleConfirmPinPosition = useCallback(async () => {
    if (!currentPinCoords) return;
    
    console.log('[RequestRideModal] ✅ Confirmando posição do pin:', currentPinCoords);
    setConfirmedDestCoords(currentPinCoords);
    setFlowState('calculating');
    
    // Obter coordenadas de origem - priorizar customPickupCoords
    let pickupCoords = customPickupCoords || position;
    if (!pickupCoords) {
      try {
        pickupCoords = await getCurrentPosition();
      } catch (err) {
        toast.error("Não foi possível obter sua localização");
        setFlowState('pin_adjust');
        return;
      }
    }

    if (!pickupCoords) {
      toast.error("Localização não disponível");
      setFlowState('pin_adjust');
      return;
    }

    // AGORA sim: calcular rota REAL com coordenadas finais
    console.log('[RequestRideModal] 🗺️ Calculando rota:', {
      origem: pickupCoords,
      destino: currentPinCoords,
    });
    
    const result = await calculatePreviewWithCoords(pickupCoords, currentPinCoords);
    
    if (result) {
      console.log('[RequestRideModal] ✅ Rota calculada:', {
        distanceKm: result.distanceKm,
        durationMin: result.durationMin,
      });
      setFlowState('ready');
    } else {
      toast.error("Erro ao calcular rota");
      setFlowState('pin_adjust');
    }
  }, [currentPinCoords, customPickupCoords, position, getCurrentPosition, calculatePreviewWithCoords]);

  // ========== NOVO: AJUSTAR PICKUP NO MAPA ==========
  const handleOpenPickupAdjust = useCallback(async () => {
    console.log('[RequestRideModal] 📍 Abrindo ajuste de embarque');
    
    // Usar posição customizada ou GPS atual
    let initialCoords = customPickupCoords || position;
    
    if (!initialCoords) {
      try {
        const gps = await getCurrentPosition();
        if (gps) {
          initialCoords = { lat: gps.lat, lng: gps.lng };
        }
      } catch (err) {
        console.warn('[RequestRideModal] Erro ao obter GPS:', err);
      }
    }
    
    if (!initialCoords) {
      // Fallback para uma posição padrão (Brasil central)
      initialCoords = { lat: -15.7801, lng: -47.9292 };
    }
    
    setCurrentPinCoords(initialCoords);
    setFlowState('pickup_adjust');
  }, [customPickupCoords, position, getCurrentPosition]);

  // ========== NOVO: CONFIRMAR PICKUP AJUSTADO ==========
  const handleConfirmPickupPosition = useCallback(() => {
    if (!currentPinCoords) return;
    
    console.log('[RequestRideModal] ✅ Pickup ajustado:', currentPinCoords);
    setCustomPickupCoords(currentPinCoords);
    setPickup("Local ajustado no mapa");
    
    // Limpar mapa e voltar para input
    if (leafletMap) {
      leafletMap.remove();
      setLeafletMap(null);
      setMarker(null);
    }
    setCurrentPinCoords(null);
    setFlowState('input');
    
    toast.success("Local de embarque definido!");
  }, [currentPinCoords, leafletMap]);

  // ========== NOVO: ABRIR DESTINO MANUAL (SEM BUSCAR) ==========
  const handleOpenManualDestination = useCallback(async () => {
    console.log('[RequestRideModal] 🗺️ Abrindo mapa para destino manual');
    
    // Usar posição atual como ponto inicial
    let initialCoords = customPickupCoords || position;
    
    if (!initialCoords) {
      try {
        const gps = await getCurrentPosition();
        if (gps) {
          initialCoords = { lat: gps.lat, lng: gps.lng };
        }
      } catch (err) {
        console.warn('[RequestRideModal] Erro ao obter GPS:', err);
      }
    }
    
    if (!initialCoords) {
      initialCoords = { lat: -15.7801, lng: -47.9292 };
    }
    
    setCurrentPinCoords(initialCoords);
    setDestination("Destino ajustado no mapa");
    setFlowState('pin_adjust');
  }, [customPickupCoords, position, getCurrentPosition]);

  // ========== PASSO 4: VOLTAR PARA AJUSTE ==========
  const handleBackToAdjust = useCallback(() => {
    setFlowState('pin_adjust');
    clearPreview();
    setConfirmedDestCoords(null);
  }, [clearPreview]);

  // NOVO: Calcular preço dinamicamente baseado no tipo de veículo e passageiros
  const priceCalculation = useMemo(() => {
    if (!previewData) return null;
    // Para Carro, usar o passengerCount; para Moto-Táxi, sempre 1
    const passengers = serviceType === 'motorista' ? passengerCount : 1;
    return calculateRidePrice(previewData.distanceKm, serviceType, passengers);
  }, [previewData, serviceType, passengerCount]);

  // Preço final e se está bloqueado
  const estimatedPrice = priceCalculation?.price ?? 0;
  const isBlocked = priceCalculation?.isBlocked ?? false;
  const blockReason = priceCalculation?.blockReason ?? null;
  const priceBreakdown = priceCalculation?.breakdown ?? null;

  // NOVO: Handler para selecionar veículo - para Carro, abre seleção de passageiros
  const handleSelectVehicle = useCallback((type: ServiceType) => {
    setServiceType(type);
    if (type === 'motorista') {
      // Para Carro, ir para seleção de passageiros
      setFlowState('passenger_select');
    }
  }, []);

  // NOVO: Confirmar seleção de passageiros e ir para resumo
  const handleConfirmPassengers = useCallback(() => {
    setFlowState('summary');
  }, []);

  // NOVO: Voltar da seleção de passageiros para escolha de veículo
  const handleBackFromPassengerSelect = useCallback(() => {
    setServiceType('mototaxi'); // Voltar para moto-táxi como padrão
    setPassengerCount(1);
    setFlowState('ready');
  }, []);

  // NOVO: Voltar do resumo para seleção de passageiros
  const handleBackFromSummary = useCallback(() => {
    setFlowState('passenger_select');
  }, []);

  const handleConfirm = async () => {
    if (!previewData || !confirmedDestCoords) {
      toast.error("Aguarde o cálculo da rota");
      return;
    }

    if (isBlocked) {
      toast.error(blockReason || "Esta opção não está disponível para esta distância");
      return;
    }

    if (destination.trim() && serviceType && estimatedPrice > 0) {
      // Criar objeto com preço incluído para passar ao onConfirm
      const previewWithPrice: RidePreviewDataWithPrice = {
        ...previewData,
        estimatedPrice,
        destinationSource: 'manual',
        passengerCount: serviceType === 'motorista' ? passengerCount : undefined,
      };
      await onConfirm(pickup, destination, serviceType, previewWithPrice);
    }
  };

  const handleCancel = () => {
    setDestination("");
    setGeocodedDest(null);
    setConfirmedDestCoords(null);
    setCustomPickupCoords(null);
    setFlowState('input');
    setCurrentPinCoords(null);
    setRoutePolyline(null);
    setPassengerCount(1);
    clearPreview();
    if (leafletMap) {
      leafletMap.remove();
      setLeafletMap(null);
      setMarker(null);
    }
    onOpenChange(false);
  };

  // Só habilita confirmar se tiver preview válido, tipo selecionado e não bloqueado
  // Para Carro, precisa ter passado pela seleção de passageiros
  const isValid = destination.trim().length > 0 && 
                  serviceType !== null && 
                  previewData !== null && 
                  !isBlocked && 
                  estimatedPrice > 0 &&
                  flowState === 'ready';

  // Função para obter preço do tipo específico (para exibir nos botões)
  const getPriceForType = (type: ServiceType, passengers: number = 1) => {
    if (!previewData) return null;
    const calc = calculateRidePrice(previewData.distanceKm, type, passengers);
    return calc;
  };

  // Verificar se AMBOS os tipos estão bloqueados (limite global de 120km)
  const isGloballyBlocked = useMemo(() => {
    if (!previewData) return false;
    return previewData.distanceKm > GLOBAL_MAX_DISTANCE_KM;
  }, [previewData]);

  // Resetar destino e começar de novo
  const handleResetDestination = () => {
    setDestination("");
    setGeocodedDest(null);
    setConfirmedDestCoords(null);
    setFlowState('input');
    clearPreview();
    setCurrentPinCoords(null);
    if (leafletMap) {
      leafletMap.remove();
      setLeafletMap(null);
      setMarker(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] flex flex-col">
        <DrawerHeader className="border-b border-border/50 pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-xl font-bold text-foreground">
              Solicitar Corrida
            </DrawerTitle>
            <DrawerClose asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full"
                onClick={handleCancel}
              >
                <X className="h-5 w-5" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        {/* Conteúdo com scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* ========== ESTADO: INPUT (digitando destino) ========== */}
          {(flowState === 'input' || flowState === 'geocoding') && (
            <div className="space-y-4">
              {/* Origem */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Origem
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-zhiq-teal ring-4 ring-zhiq-teal/20" />
                    <Input
                      value={pickup}
                      onChange={(e) => {
                        setPickup(e.target.value);
                        // Se editar manualmente, limpar coordenadas customizadas
                        if (customPickupCoords) {
                          setCustomPickupCoords(null);
                        }
                      }}
                      placeholder="Onde você está?"
                      className="pl-10 bg-muted/50 border-border/50 h-14 text-foreground placeholder:text-muted-foreground/60"
                      disabled={isLoading}
                    />
                  </div>
                  {/* BOTÃO AJUSTAR EMBARQUE NO MAPA */}
                  <Button
                    variant="outline"
                    onClick={handleOpenPickupAdjust}
                    disabled={isLoading || flowState === 'geocoding'}
                    className="h-14 px-3 border-zhiq-teal/50 text-zhiq-teal hover:bg-zhiq-teal/10"
                    title="Ajustar local de embarque no mapa"
                  >
                    <Edit3 className="h-5 w-5" />
                  </Button>
                </div>
                {customPickupCoords && (
                  <p className="text-xs text-zhiq-teal flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Local ajustado: {customPickupCoords.lat.toFixed(4)}, {customPickupCoords.lng.toFixed(4)}
                  </p>
                )}
              </div>

              {/* Linha conectora */}
              <div className="flex items-center pl-4">
                <div className="w-0.5 h-6 bg-gradient-to-b from-zhiq-teal to-zhiq-gold rounded-full" />
              </div>

              {/* Destino */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Destino
                </label>
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2">
                      <Navigation className="w-4 h-4 text-zhiq-gold" />
                    </div>
                    <Input
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="Digite o endereço completo..."
                      className="pl-10 bg-muted/50 border-border/50 h-14 text-foreground placeholder:text-muted-foreground/60"
                      disabled={isLoading || flowState === 'geocoding'}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && destination.trim().length >= 3) {
                          e.preventDefault();
                          handleSearchDestination();
                        }
                      }}
                    />
                  </div>
                  <Button
                    onClick={handleSearchDestination}
                    disabled={isLoading || flowState === 'geocoding' || destination.trim().length < 3}
                    className="h-14 px-4 bg-primary hover:bg-primary/90"
                  >
                    {flowState === 'geocoding' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <MapPin className="h-5 w-5" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Digite o endereço e clique no botão ou pressione Enter para buscar
                </p>
              </div>

              {/* Destinos rápidos */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Destinos frequentes</p>
                <div className="flex gap-2 flex-wrap">
                  {["Rodoviária", "Shopping", "Hospital", "Centro"].map((place) => (
                    <Button
                      key={place}
                      variant="outline"
                      size="sm"
                      onClick={() => setDestination(place)}
                      disabled={isLoading || flowState === 'geocoding'}
                      className="rounded-full text-sm border-border/50 hover:bg-muted hover:border-primary/50 transition-colors"
                    >
                      <MapPin className="w-3 h-3 mr-1.5" />
                      {place}
                    </Button>
                  ))}
                </div>
              </div>

              {/* BOTÃO PARA DEFINIR DESTINO MANUAL (ÁREAS RURAIS) */}
              <div className="pt-3 border-t border-border/30">
                <Button
                  variant="outline"
                  onClick={handleOpenManualDestination}
                  disabled={isLoading || flowState === 'geocoding'}
                  className="w-full h-14 border-2 border-dashed border-zhiq-gold/50 hover:border-zhiq-gold hover:bg-zhiq-gold/10 text-zhiq-gold hover:text-zhiq-gold font-medium transition-all"
                >
                  <MapPin className="h-5 w-5 mr-2" />
                  📍 Ajustar localização no mapa
                </Button>
                <p className="text-xs text-muted-foreground/70 text-center mt-2">
                  Ideal para áreas rurais, sítios ou locais sem endereço
                </p>
              </div>

              {flowState === 'geocoding' && (
                <div className="flex items-center justify-center gap-2 p-4 rounded-lg bg-muted/50 border border-border/50">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Buscando endereço...</span>
                </div>
              )}
            </div>
          )}

          {/* ========== ESTADO: PICKUP_ADJUST (ajustar embarque no mapa) ========== */}
          {flowState === 'pickup_adjust' && (
            <div className="space-y-4">
              {/* Info */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-zhiq-teal/10 border border-zhiq-teal/30">
                <MapPin className="h-5 w-5 text-zhiq-teal flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-zhiq-teal">Ajustar local de embarque</p>
                  <p className="text-xs text-zhiq-teal/80 mt-1">
                    Arraste o pin verde para o local exato onde deseja ser buscado.
                  </p>
                </div>
              </div>

              {/* MAPA INLINE PARA PICKUP */}
              <div className="relative rounded-xl overflow-hidden border border-border/50 shadow-lg">
                <div 
                  ref={setMapRef} 
                  className="w-full h-[280px]"
                  style={{ zIndex: 0 }}
                />
                
                {/* Coordenadas atuais */}
                {currentPinCoords && (
                  <div className="absolute bottom-2 left-2 right-2 z-[500]">
                    <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5">
                      <p className="text-[11px] text-white/80 font-mono text-center">
                        {currentPinCoords.lat.toFixed(6)}, {currentPinCoords.lng.toFixed(6)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Botões */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (leafletMap) {
                      leafletMap.remove();
                      setLeafletMap(null);
                      setMarker(null);
                    }
                    setCurrentPinCoords(null);
                    setFlowState('input');
                  }}
                  className="flex-1 h-12"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmPickupPosition}
                  disabled={!currentPinCoords}
                  className="flex-1 h-12 bg-gradient-to-r from-zhiq-teal to-zhiq-green text-white font-bold"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar Embarque
                </Button>
              </div>
            </div>
          )}

          {/* ========== ESTADO: PIN_ADJUST (mapa com pin arrastável) ========== */}
          {flowState === 'pin_adjust' && (
            <div className="space-y-4">
              {/* Info do destino digitado */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zhiq-gold/20 flex items-center justify-center">
                    <Navigation className="h-5 w-5 text-zhiq-gold" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{destination}</p>
                    {geocodedDest && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {geocodedDest.displayName}
                      </p>
                    )}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleResetDestination}
                  className="text-muted-foreground"
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
              </div>

              {/* AVISO IMPORTANTE */}
              <div className={`flex items-start gap-3 p-4 rounded-lg ${geocodedDest?.isApproximate ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-amber-500/10 border border-amber-500/30'}`}>
                <Info className={`h-5 w-5 flex-shrink-0 mt-0.5 ${geocodedDest?.isApproximate ? 'text-blue-500' : 'text-amber-500'}`} />
                <div>
                  <p className={`text-sm font-medium ${geocodedDest?.isApproximate ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {geocodedDest?.isApproximate 
                      ? 'Local aproximado encontrado' 
                      : 'Ajuste o local exato no mapa'}
                  </p>
                  <p className={`text-xs mt-1 ${geocodedDest?.isApproximate ? 'text-blue-600/80 dark:text-blue-400/80' : 'text-amber-600/80 dark:text-amber-400/80'}`}>
                    {geocodedDest?.isApproximate
                      ? 'Arraste o pin para o local exato do destino. Depois, confirme a posição.'
                      : 'Arraste o pin laranja para o local correto de destino. Depois, confirme a posição para calcular a rota.'}
                  </p>
                </div>
              </div>

              {/* MAPA INLINE */}
              <div className="relative rounded-xl overflow-hidden border border-border/50 shadow-lg">
                <div 
                  ref={setMapRef} 
                  className="w-full h-[280px]"
                  style={{ zIndex: 0 }}
                />
                
                {/* Métricas em tempo real + Coordenadas */}
                <div className="absolute bottom-2 left-2 right-2 z-[500] space-y-1.5">
                  {/* Métricas da rota (quando disponíveis) */}
                  {dragPreview && (
                    <div className="bg-emerald-600/90 backdrop-blur-sm rounded-lg px-3 py-2 flex items-center justify-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <Route className="h-4 w-4 text-white" />
                        <span className="text-sm font-bold text-white">{dragPreview.distanceKm} km</span>
                      </div>
                      <div className="w-px h-4 bg-white/30" />
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-white" />
                        <span className="text-sm font-bold text-white">{dragPreview.durationMin} min</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Coordenadas atuais */}
                  {currentPinCoords && (
                    <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5">
                      <p className="text-[11px] text-white/80 font-mono text-center">
                        {currentPinCoords.lat.toFixed(6)}, {currentPinCoords.lng.toFixed(6)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Botão Confirmar Posição */}
              <Button
                onClick={handleConfirmPinPosition}
                disabled={!currentPinCoords}
                className="w-full h-14 bg-gradient-to-r from-zhiq-gold to-amber-500 hover:from-amber-500 hover:to-zhiq-gold text-white font-bold text-lg rounded-xl shadow-lg transition-all"
              >
                <Check className="h-5 w-5 mr-2" />
                Confirmar Local e Calcular Rota
              </Button>
            </div>
          )}

          {/* ========== ESTADO: CALCULATING (calculando rota) ========== */}
          {flowState === 'calculating' && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-lg font-medium text-foreground">Calculando rota...</p>
                <p className="text-sm text-muted-foreground">Aguarde enquanto obtemos a distância exata</p>
              </div>
            </div>
          )}

          {/* ========== ESTADO: READY (rota calculada, escolher veículo) ========== */}
          {/* NOTA: O mapa principal (MapView) é atualizado via props no PassengerPanel */}
          {/* NÃO renderizar mapa aqui para evitar duplicação - padrão single-map */}
          {flowState === 'ready' && previewData && (
            <div className="space-y-5">
            
              {/* Resumo do trajeto */}
              <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                <div className="flex items-center gap-4">
                  {/* Origem */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full bg-zhiq-teal" />
                      <span className="text-xs text-muted-foreground">Origem</span>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">{pickup}</p>
                  </div>
                  
                  {/* Seta */}
                  <div className="text-muted-foreground">→</div>
                  
                  {/* Destino */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full bg-zhiq-gold" />
                      <span className="text-xs text-muted-foreground">Destino</span>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">{destination}</p>
                  </div>
                </div>

                {/* Botão para editar */}
                <button
                  onClick={handleBackToAdjust}
                  className="mt-3 w-full text-xs text-primary hover:underline flex items-center justify-center gap-1"
                >
                  <Edit3 className="h-3 w-3" />
                  Ajustar destino
                </button>
              </div>

              {/* Cards de KM e Tempo */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center p-4 rounded-xl bg-muted/50 border border-border/50">
                  <Route className="h-5 w-5 text-primary mb-2" />
                  <span className="text-2xl font-bold text-foreground">{previewData.distanceKm}</span>
                  <span className="text-xs text-muted-foreground">quilômetros</span>
                </div>
                <div className="flex flex-col items-center p-4 rounded-xl bg-muted/50 border border-border/50">
                  <Clock className="h-5 w-5 text-primary mb-2" />
                  <span className="text-2xl font-bold text-foreground">{previewData.durationMin}</span>
                  <span className="text-xs text-muted-foreground">minutos</span>
                </div>
              </div>

              {/* Aviso de limite de distância (mensagem neutra) */}
              {isGloballyBlocked && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted border border-border">
                  <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Para esta distância, recomendamos Carro ou Frete.
                  </p>
                </div>
              )}

              {/* Texto discreto sobre cálculo */}
              <p className="text-xs text-muted-foreground/70 text-center">
                Preço calculado pela rota real exibida no mapa.
              </p>

              {/* Seleção de tipo de serviço COM PREÇOS */}
              {!isGloballyBlocked && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Tipo de corrida</p>
                  <div className="grid grid-cols-2 gap-3">
                    {RIDE_SERVICE_OPTIONS.map((option) => {
                      const typePrice = getPriceForType(option.value);
                      const isTypeBlocked = typePrice?.isBlocked ?? false;
                      const typeValue = typePrice?.price ?? 0;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleSelectVehicle(option.value)}
                          disabled={isLoading || isTypeBlocked}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                            serviceType === option.value
                              ? isTypeBlocked 
                                ? 'border-amber-500 bg-amber-500/10'
                                : 'border-zhiq-teal bg-zhiq-teal/10 shadow-md'
                              : 'border-border/50 hover:border-zhiq-teal/50 hover:bg-muted/50'
                          } ${(isLoading || isTypeBlocked) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <span className="text-3xl">{option.icon}</span>
                          <div className="text-center">
                            <p className={`font-semibold text-sm ${
                              serviceType === option.value ? 'text-zhiq-teal' : 'text-foreground'
                            }`}>
                              {option.label}
                            </p>
                            
                            {isTypeBlocked ? (
                              <p className="text-xs text-muted-foreground font-medium">
                                Indisponível
                              </p>
                            ) : typeValue > 0 ? (
                              <p className="text-xs text-primary font-bold">
                                {option.value === 'motorista' ? 'a partir de ' : ''}{formatRidePrice(typeValue)}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">{option.description}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Botão Confirmar */}
              {!isGloballyBlocked && (
                <Button
                  onClick={handleConfirm}
                  disabled={!isValid || isLoading}
                  className="w-full h-14 bg-gradient-to-r from-zhiq-teal via-zhiq-green to-zhiq-teal bg-[length:200%_100%] hover:bg-[position:100%_0] text-white font-bold text-lg rounded-xl shadow-lg shadow-zhiq-teal/40 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Confirmando...
                    </span>
                  ) : isBlocked ? (
                    "Escolha Carro para esta distância"
                  ) : estimatedPrice > 0 ? (
                    `Confirmar por ${formatRidePrice(estimatedPrice)}`
                  ) : (
                    "Selecione um veículo"
                  )}
                </Button>
              )}

              {/* Botão Cancelar */}
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isLoading}
                className="w-full h-12 rounded-xl border-border/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </Button>
            </div>
          )}

          {/* ========== ESTADO: PASSENGER_SELECT (seleção de passageiros para Carro) ========== */}
          {flowState === 'passenger_select' && previewData && (
            <div className="space-y-5">
              {/* Header com veículo selecionado */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-zhiq-teal/10 border border-zhiq-teal/30">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🚗</span>
                  <div>
                    <p className="font-semibold text-foreground">Carro</p>
                    <p className="text-xs text-muted-foreground">{previewData.distanceKm} km • {previewData.durationMin} min</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBackFromPassengerSelect}
                  className="text-muted-foreground"
                >
                  Trocar
                </Button>
              </div>

              {/* Seleção de passageiros */}
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">Quantas pessoas?</p>
                  <p className="text-sm text-muted-foreground">Inclua você no total</p>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((num) => {
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setPassengerCount(num)}
                        className={`flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all ${
                          passengerCount === num
                            ? 'border-zhiq-teal bg-zhiq-teal/10 shadow-md'
                            : 'border-border/50 hover:border-zhiq-teal/50 hover:bg-muted/50'
                        }`}
                      >
                        <span className="text-2xl font-bold text-foreground">{num}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {num === 1 ? 'pessoa' : 'pessoas'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preview rápido do preço */}
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
                <p className="text-sm text-muted-foreground">Valor estimado</p>
                <p className="text-xl font-bold text-primary">{formatRidePrice(estimatedPrice)}</p>
              </div>

              {/* Botões de ação */}
              <Button
                onClick={handleConfirmPassengers}
                className="w-full h-14 bg-gradient-to-r from-zhiq-teal via-zhiq-green to-zhiq-teal bg-[length:200%_100%] hover:bg-[position:100%_0] text-white font-bold text-lg rounded-xl shadow-lg shadow-zhiq-teal/40 transition-all duration-300"
              >
                Continuar
              </Button>

              <Button
                variant="outline"
                onClick={handleBackFromPassengerSelect}
                className="w-full h-12 rounded-xl border-border/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                Voltar
              </Button>
            </div>
          )}

          {/* ========== ESTADO: SUMMARY (resumo completo antes de confirmar) ========== */}
          {flowState === 'summary' && previewData && (
            <div className="space-y-5">
              {/* Título */}
              <div className="text-center">
                <p className="text-xl font-bold text-foreground">Resumo da Corrida</p>
                <p className="text-sm text-muted-foreground">Confira os detalhes antes de confirmar</p>
              </div>

              {/* Card de resumo principal */}
              <div className="p-5 rounded-xl bg-gradient-to-br from-zhiq-teal/10 to-zhiq-green/10 border border-zhiq-teal/30 space-y-4">
                {/* Tipo de serviço */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tipo de serviço</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚗</span>
                    <span className="font-semibold text-foreground">Carro</span>
                  </div>
                </div>

                {/* Passageiros */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Passageiros</span>
                  <span className="font-semibold text-foreground">{passengerCount} {passengerCount === 1 ? 'pessoa' : 'pessoas'}</span>
                </div>

                {/* Distância */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Distância</span>
                  <div className="flex items-center gap-1.5">
                    <Route className="h-4 w-4 text-zhiq-green" />
                    <span className="font-semibold text-foreground">{previewData.distanceKm} km</span>
                  </div>
                </div>

                {/* Tempo estimado */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tempo estimado</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-foreground">{previewData.durationMin} min</span>
                  </div>
                </div>
              </div>

              {/* Breakdown de preço */}
              <div className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Detalhamento do valor</p>
                
                {priceBreakdown && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Valor base</span>
                      <span className="text-foreground">{formatRidePrice(priceBreakdown.basePrice)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Distância ({previewData.distanceKm} km)</span>
                      <span className="text-foreground">{formatRidePrice(priceBreakdown.distancePrice)}</span>
                    </div>
                    {priceBreakdown.passengerExtra > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Adicional por passageiro ({passengerCount - 1}x R$ 2,00)
                        </span>
                        <span className="text-foreground">+ {formatRidePrice(priceBreakdown.passengerExtra)}</span>
                      </div>
                    )}
                    <div className="border-t border-border/50 pt-3 mt-3">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-foreground text-lg">Total</span>
                        <span className="text-2xl font-bold text-primary">{formatRidePrice(estimatedPrice)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Origem e Destino */}
              <div className="p-4 rounded-xl bg-muted/30 border border-border/30 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full bg-zhiq-teal ring-4 ring-zhiq-teal/20 mt-1" />
                  <div>
                    <p className="text-xs text-muted-foreground">Embarque</p>
                    <p className="text-sm font-medium text-foreground">{pickup}</p>
                  </div>
                </div>
                <div className="ml-1.5 h-4 w-0.5 bg-gradient-to-b from-zhiq-teal to-zhiq-gold" />
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full bg-zhiq-gold ring-4 ring-zhiq-gold/20 mt-1" />
                  <div>
                    <p className="text-xs text-muted-foreground">Destino</p>
                    <p className="text-sm font-medium text-foreground">{destination}</p>
                  </div>
                </div>
              </div>

              {/* Aviso importante */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  O valor final é fixo e não será alterado após a confirmação.
                </p>
              </div>

              {/* Botão Confirmar */}
              <Button
                onClick={handleConfirm}
                disabled={isLoading}
                className="w-full h-14 bg-gradient-to-r from-zhiq-teal via-zhiq-green to-zhiq-teal bg-[length:200%_100%] hover:bg-[position:100%_0] text-white font-bold text-lg rounded-xl shadow-lg shadow-zhiq-teal/40 transition-all duration-300"
              >
                {isLoading ? (
                  <span className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Confirmando...
                  </span>
                ) : (
                  `Confirmar por ${formatRidePrice(estimatedPrice)}`
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleBackFromSummary}
                disabled={isLoading}
                className="w-full h-12 rounded-xl border-border/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                Voltar
              </Button>
            </div>
          )}

          {/* Rodapé com links (sempre visível) */}
          <div className="mt-4 pt-3 border-t border-border/50">
            <nav className="flex flex-wrap justify-center gap-3 text-[11px]">
              <Link 
                to="/support" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Suporte
              </Link>
              <span className="text-border">•</span>
              <Link 
                to="/privacidade" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Privacidade
              </Link>
              <span className="text-border">•</span>
              <Link 
                to="/terms" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Termos
              </Link>
            </nav>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default RequestRideModal;
