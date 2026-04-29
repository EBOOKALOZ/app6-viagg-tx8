import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { 
  MapPin, 
  Navigation, 
  Package, 
  Truck, 
  Box, 
  Loader2, 
  X, 
  Check, 
  ChevronRight,
  AlertTriangle,
  Route,
  Crosshair,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useFreteCategories } from '@/hooks/useFreteCategories';
import { useFreteSolicitacao, FreteSolicitacaoData } from '@/hooks/useFreteSolicitacao';
import { 
  TIPOS_CARGA, 
  TIPOS_CARROCERIA, 
  TipoCarroceria,
  sugerirCategoria, 
  calcularValorFrete, 
  formatarValorFrete,
  FreteCategoria
} from '@/lib/fretePricing';
import { cn } from '@/lib/utils';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface FreteRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (solicitacaoId: string) => void;
}

type FlowStep = 'rota' | 'carga' | 'preview';

interface RouteData {
  polyline: [number, number][];
  distanceKm: number;
  durationMin: number;
}

interface Coords {
  lat: number;
  lng: number;
}

// Custom debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Reverse geocoding helper
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const data = await response.json();
    if (data?.display_name) {
      // Simplify long addresses
      const parts = data.display_name.split(',').slice(0, 4);
      return parts.join(',').trim();
    }
    return null;
  } catch (err) {
    console.warn('[reverseGeocode] Erro:', err);
    return null;
  }
}

// Create custom icon for markers
function createMarkerIcon(type: 'origem' | 'destino', isDragging = false) {
  const color = type === 'origem' ? '#14b8a6' : '#f59e0b';
  const size = isDragging ? 52 : 44;
  
  const html = `
    <div style="
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border: 3px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      cursor: grab;
      transition: all 0.2s ease;
      ${isDragging ? 'transform: scale(1.1);' : ''}
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        ${type === 'origem' 
          ? '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>' 
          : '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'}
      </svg>
    </div>
    <div style="
      margin-top: 4px;
      padding: 2px 8px;
      background: rgba(0,0,0,0.85);
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      white-space: nowrap;
      text-align: center;
    ">
      ${type === 'origem' ? '📍 Coleta' : '🎯 Entrega'}
    </div>
  `;

  return L.divIcon({
    html,
    className: 'frete-marker',
    iconSize: [size, size + 20],
    iconAnchor: [size / 2, size / 2],
  });
}

export function FreteRequestModal({ 
  open, 
  onOpenChange, 
  onSuccess 
}: FreteRequestModalProps) {
  const { position, getCurrentPosition, isLoading: isGettingLocation } = useGeolocation();
  const { categorias, isLoading: isLoadingCategorias } = useFreteCategories();
  const { isSubmitting, submitSolicitacao } = useFreteSolicitacao();

  // Flow state
  const [currentStep, setCurrentStep] = useState<FlowStep>('rota');
  
  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const origemMarkerRef = useRef<L.Marker | null>(null);
  const destinoMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  
  // Form state
  const [activeField, setActiveField] = useState<'origem' | 'destino'>('origem');
  const [origemText, setOrigemText] = useState('');
  const [origemCoords, setOrigemCoords] = useState<Coords | null>(null);
  const [destinoText, setDestinoText] = useState('');
  const [destinoCoords, setDestinoCoords] = useState<Coords | null>(null);
  const [tipoCargaId, setTipoCargaId] = useState<string>('');
  const [descricaoCarga, setDescricaoCarga] = useState('');
  const [tipoCarroceria, setTipoCarroceria] = useState<TipoCarroceria>('indiferente');
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<FreteCategoria | null>(null);
  
  // Route data
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  
  // Geocoding state
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Debounced text for search (500ms)
  const debouncedOrigemText = useDebounce(origemText, 500);
  const debouncedDestinoText = useDebounce(destinoText, 500);
  
  // Track if text was set by reverse geocoding to avoid loops
  const isReverseGeocodingRef = useRef(false);

  // Reset quando fecha
  useEffect(() => {
    if (!open) {
      setCurrentStep('rota');
      setActiveField('origem');
      setOrigemText('');
      setOrigemCoords(null);
      setDestinoText('');
      setDestinoCoords(null);
      setTipoCargaId('');
      setDescricaoCarga('');
      setTipoCarroceria('indiferente');
      setCategoriaSelecionada(null);
      setRouteData(null);
      
      // Cleanup map
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      origemMarkerRef.current = null;
      destinoMarkerRef.current = null;
      polylineRef.current = null;
    }
  }, [open]);

  // Inicializar mapa
  useEffect(() => {
    if (!open || !mapContainerRef.current || mapInstanceRef.current) return;

    // Default center (São Paulo)
    const defaultCenter: [number, number] = position 
      ? [position.lat, position.lng] 
      : [-23.5505, -46.6333];

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Add zoom control on right
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapInstanceRef.current = map;

    // Fix size after render
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [open, position]);

  // Atualizar marcador origem
  useEffect(() => {
    if (!mapInstanceRef.current || !origemCoords) return;

    if (origemMarkerRef.current) {
      origemMarkerRef.current.setLatLng([origemCoords.lat, origemCoords.lng]);
    } else {
      const marker = L.marker([origemCoords.lat, origemCoords.lng], {
        icon: createMarkerIcon('origem'),
        draggable: true,
      }).addTo(mapInstanceRef.current);

      marker.on('dragstart', () => {
        marker.setIcon(createMarkerIcon('origem', true));
      });

      marker.on('dragend', async () => {
        marker.setIcon(createMarkerIcon('origem'));
        const pos = marker.getLatLng();
        setOrigemCoords({ lat: pos.lat, lng: pos.lng });
        
        // Reverse geocoding
        isReverseGeocodingRef.current = true;
        setOrigemText('Buscando endereço...');
        const address = await reverseGeocode(pos.lat, pos.lng);
        setOrigemText(address || `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
        setTimeout(() => { isReverseGeocodingRef.current = false; }, 600);
      });

      origemMarkerRef.current = marker;
    }

    mapInstanceRef.current.setView([origemCoords.lat, origemCoords.lng], 15);
  }, [origemCoords]);

  // Atualizar marcador destino
  useEffect(() => {
    if (!mapInstanceRef.current || !destinoCoords) return;

    if (destinoMarkerRef.current) {
      destinoMarkerRef.current.setLatLng([destinoCoords.lat, destinoCoords.lng]);
    } else {
      const marker = L.marker([destinoCoords.lat, destinoCoords.lng], {
        icon: createMarkerIcon('destino'),
        draggable: true,
      }).addTo(mapInstanceRef.current);

      marker.on('dragstart', () => {
        marker.setIcon(createMarkerIcon('destino', true));
      });

      marker.on('dragend', async () => {
        marker.setIcon(createMarkerIcon('destino'));
        const pos = marker.getLatLng();
        setDestinoCoords({ lat: pos.lat, lng: pos.lng });
        
        // Reverse geocoding
        isReverseGeocodingRef.current = true;
        setDestinoText('Buscando endereço...');
        const address = await reverseGeocode(pos.lat, pos.lng);
        setDestinoText(address || `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
        setTimeout(() => { isReverseGeocodingRef.current = false; }, 600);
      });

      destinoMarkerRef.current = marker;
    }

    // Fit bounds to show both markers
    if (origemCoords) {
      const bounds = L.latLngBounds([
        [origemCoords.lat, origemCoords.lng],
        [destinoCoords.lat, destinoCoords.lng]
      ]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
    } else {
      mapInstanceRef.current.setView([destinoCoords.lat, destinoCoords.lng], 15);
    }
  }, [destinoCoords, origemCoords]);

  // Calcular rota quando ambos marcadores estão definidos
  useEffect(() => {
    if (!origemCoords || !destinoCoords) {
      // Limpar polyline se não tem ambas coordenadas
      if (polylineRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(polylineRef.current);
        polylineRef.current = null;
      }
      setRouteData(null);
      return;
    }

    const calculateRoute = async () => {
      setIsCalculatingRoute(true);
      try {
        const { data, error } = await supabase.functions.invoke('get-route', {
          body: {
            origin: origemCoords,
            destination: destinoCoords,
            snapRadius: 500,
          },
        });

        if (error || !data?.geometry?.coordinates) {
          console.warn('[FreteRequestModal] Erro ao calcular rota:', error);
          return;
        }

        const polyline: [number, number][] = data.geometry.coordinates.map(
          (coord: [number, number]) => [coord[1], coord[0]]
        );
        const distanceKm = Math.round((data.distance / 1000) * 10) / 10;
        const durationMin = Math.ceil(data.duration / 60);

        setRouteData({ polyline, distanceKm, durationMin });

        // Desenhar polyline
        if (mapInstanceRef.current) {
          if (polylineRef.current) {
            mapInstanceRef.current.removeLayer(polylineRef.current);
          }

          const newPolyline = L.polyline(polyline, {
            color: '#10b981',
            weight: 5,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(mapInstanceRef.current);

          polylineRef.current = newPolyline;
        }
      } catch (err) {
        console.error('[FreteRequestModal] Erro ao calcular rota:', err);
      } finally {
        setIsCalculatingRoute(false);
      }
    };

    calculateRoute();
  }, [origemCoords, destinoCoords]);

  // Geocoding automático com debounce (origem)
  useEffect(() => {
    if (isReverseGeocodingRef.current) return; // Skip if from reverse geocoding
    if (!debouncedOrigemText || debouncedOrigemText.length < 5) return;
    if (debouncedOrigemText.includes(',') && !isNaN(parseFloat(debouncedOrigemText.split(',')[0]))) return;
    if (debouncedOrigemText === 'Buscando endereço...') return;
    if (activeField !== 'origem') return;

    geocodeAddress(debouncedOrigemText, 'origem');
  }, [debouncedOrigemText]);

  // Geocoding automático com debounce (destino)
  useEffect(() => {
    if (isReverseGeocodingRef.current) return; // Skip if from reverse geocoding
    if (!debouncedDestinoText || debouncedDestinoText.length < 5) return;
    if (debouncedDestinoText.includes(',') && !isNaN(parseFloat(debouncedDestinoText.split(',')[0]))) return;
    if (debouncedDestinoText === 'Buscando endereço...') return;
    if (activeField !== 'destino') return;

    geocodeAddress(debouncedDestinoText, 'destino');
  }, [debouncedDestinoText]);

  // Geocodificar endereço
  const geocodeAddress = useCallback(async (address: string, type: 'origem' | 'destino') => {
    if (address.length < 3) return;

    setIsGeocoding(true);
    try {
      const { data, error } = await supabase.functions.invoke('geocode-address', {
        body: { address: address.trim() },
      });

      if (error || !data?.lat || !data?.lng) {
        console.warn('[FreteRequestModal] Geocoding falhou:', error);
        return;
      }

      const coords = { lat: Number(data.lat), lng: Number(data.lng) };
      
      if (type === 'origem') {
        setOrigemCoords(coords);
        if (data.display_name) setOrigemText(data.display_name);
      } else {
        setDestinoCoords(coords);
        if (data.display_name) setDestinoText(data.display_name);
      }
    } catch (err) {
      console.error('[FreteRequestModal] Erro geocoding:', err);
    } finally {
      setIsGeocoding(false);
    }
  }, []);

  // Usar localização atual
  const handleUseCurrentLocation = useCallback(async () => {
    try {
      const pos = await getCurrentPosition();
      if (pos) {
        setOrigemCoords(pos);
        setOrigemText('Minha localização atual');
        toast.success('Localização obtida!');
      }
    } catch {
      toast.error('Não foi possível obter localização');
    }
  }, [getCurrentPosition]);

  // Buscar manualmente
  const handleSearch = useCallback((type: 'origem' | 'destino') => {
    const text = type === 'origem' ? origemText : destinoText;
    if (text.length >= 3) {
      geocodeAddress(text, type);
    } else {
      toast.error('Digite um endereço mais completo');
    }
  }, [origemText, destinoText, geocodeAddress]);

  // Atualizar categoria sugerida quando tipo de carga muda
  useEffect(() => {
    if (tipoCargaId && categorias.length > 0) {
      const sugestao = sugerirCategoria(tipoCargaId, categorias);
      if (sugestao) {
        setCategoriaSelecionada(sugestao);
      }
    }
  }, [tipoCargaId, categorias]);

  // Calcular valor estimado
  const valorEstimado = useMemo(() => {
    return categoriaSelecionada && routeData
      ? calcularValorFrete(categoriaSelecionada, routeData.distanceKm)
      : 0;
  }, [categoriaSelecionada, routeData]);

  // Submit
  const handleSubmit = useCallback(async () => {
    if (!origemCoords || !destinoCoords || !routeData || !categoriaSelecionada) {
      toast.error('Dados incompletos');
      return;
    }

    const tipoCarga = TIPOS_CARGA.find(t => t.id === tipoCargaId);
    
    const data: FreteSolicitacaoData = {
      enderecoOrigem: origemText,
      latitudeOrigem: origemCoords.lat,
      longitudeOrigem: origemCoords.lng,
      enderecoDestino: destinoText,
      latitudeDestino: destinoCoords.lat,
      longitudeDestino: destinoCoords.lng,
      distanciaKm: routeData.distanceKm,
      descricaoCarga: descricaoCarga || (tipoCarga?.nome || ''),
      pesoEstimadoKg: tipoCarga?.peso_estimado_kg || 100,
      volumeEstimadoM3: tipoCarga?.volume_estimado_m3 || 1,
      categoriaSugeridaId: categoriaSelecionada.id,
      tipoCarroceria,
      valorEstimado,
    };

    const id = await submitSolicitacao(data);
    if (id) {
      onSuccess?.(id);
      onOpenChange(false);
    }
  }, [
    origemCoords, destinoCoords, routeData, categoriaSelecionada,
    origemText, destinoText, tipoCargaId, descricaoCarga, tipoCarroceria,
    valorEstimado, submitSolicitacao, onSuccess, onOpenChange
  ]);

  // Navegação entre steps
  const canProceedRota = origemCoords !== null && destinoCoords !== null && routeData !== null;
  const canProceedCarga = tipoCargaId !== '' && categoriaSelecionada !== null;

  const goToCarga = () => setCurrentStep('carga');
  const goToPreview = () => setCurrentStep('preview');

  // Indicador de coordenadas válidas
  const coordsStatus = useMemo(() => ({
    origem: origemCoords !== null,
    destino: destinoCoords !== null,
  }), [origemCoords, destinoCoords]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[95vh] h-[95vh] flex flex-col">
        <DrawerHeader className="border-b pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DrawerTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Solicitar Frete
            </DrawerTitle>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>
          
          {/* Progress */}
          <div className="flex gap-2 mt-3">
            {(['rota', 'carga', 'preview'] as FlowStep[]).map((step, idx) => (
              <div 
                key={step}
                className={cn(
                  'flex-1 h-1 rounded-full transition-colors',
                  currentStep === step ? 'bg-primary' :
                  (['rota', 'carga', 'preview'].indexOf(currentStep) > idx) 
                    ? 'bg-primary/50' 
                    : 'bg-muted'
                )}
              />
            ))}
          </div>
        </DrawerHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* STEP: ROTA - Mapa fixo com inputs */}
          {currentStep === 'rota' && (
            <>
              {/* Inputs na parte superior */}
              <div className="p-3 space-y-3 flex-shrink-0 border-b bg-background">
                {/* Input Origem */}
                <div className="space-y-1">
                  <Label className="flex items-center gap-2 text-sm">
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      coordsStatus.origem ? "bg-teal-500" : "bg-muted-foreground/30"
                    )} />
                    Coleta (origem)
                    {coordsStatus.origem && <Check className="h-3 w-3 text-teal-500" />}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Digite o endereço de coleta..."
                      value={origemText}
                      onChange={(e) => setOrigemText(e.target.value)}
                      onFocus={() => setActiveField('origem')}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch('origem')}
                      className={cn(
                        "flex-1",
                        activeField === 'origem' && "ring-2 ring-teal-500/50"
                      )}
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => handleSearch('origem')}
                      disabled={isGeocoding || origemText.length < 3}
                    >
                      {isGeocoding && activeField === 'origem' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={handleUseCurrentLocation}
                      disabled={isGettingLocation}
                      title="Usar localização atual"
                    >
                      {isGettingLocation ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Crosshair className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Input Destino */}
                <div className="space-y-1">
                  <Label className="flex items-center gap-2 text-sm">
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      coordsStatus.destino ? "bg-amber-500" : "bg-muted-foreground/30"
                    )} />
                    Entrega (destino)
                    {coordsStatus.destino && <Check className="h-3 w-3 text-amber-500" />}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Digite o endereço de entrega..."
                      value={destinoText}
                      onChange={(e) => setDestinoText(e.target.value)}
                      onFocus={() => setActiveField('destino')}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch('destino')}
                      className={cn(
                        "flex-1",
                        activeField === 'destino' && "ring-2 ring-amber-500/50"
                      )}
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => handleSearch('destino')}
                      disabled={isGeocoding || destinoText.length < 3}
                    >
                      {isGeocoding && activeField === 'destino' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Info da rota */}
                {routeData && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="flex items-center gap-2">
                      <Route className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{routeData.distanceKm} km</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      ~{routeData.durationMin} min
                    </span>
                    {isCalculatingRoute && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                  </div>
                )}
              </div>

              {/* Mapa fixo ocupando ~45% */}
              <div className="flex-1 relative min-h-[45vh]">
                <div 
                  ref={mapContainerRef} 
                  className="absolute inset-0 z-0"
                  style={{ isolation: 'isolate' }}
                />
                
                {/* Instrução sobre arrastar */}
                {(origemCoords || destinoCoords) && (
                  <div className="absolute bottom-3 left-3 right-3 z-10 pointer-events-none">
                    <div className="bg-background/90 backdrop-blur-sm rounded-lg p-2 text-center border shadow-sm">
                      <p className="text-xs text-muted-foreground">
                        💡 Arraste os marcadores para ajustar os locais
                      </p>
                    </div>
                  </div>
                )}

                {/* Loading rota */}
                {isCalculatingRoute && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
                    <div className="bg-background/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-2 border shadow-sm">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      <span className="text-xs">Calculando rota...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Botão continuar */}
              <div className="p-3 border-t bg-background flex-shrink-0">
                <Button 
                  className="w-full h-12" 
                  onClick={goToCarga}
                  disabled={!canProceedRota}
                >
                  {!canProceedRota ? (
                    'Defina origem e destino'
                  ) : (
                    <>
                      Continuar
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* STEP: CARGA */}
          {currentStep === 'carga' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Resumo da rota */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Route className="h-4 w-4 text-primary" />
                    <span className="font-medium">{routeData?.distanceKm} km</span>
                    <span className="text-muted-foreground">• ~{routeData?.durationMin} min</span>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Tipo de carga
                </Label>
                <Select value={tipoCargaId} onValueChange={setTipoCargaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo de carga..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_CARGA.map((tipo) => (
                      <SelectItem key={tipo.id} value={tipo.id}>
                        {tipo.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {tipoCargaId === 'outro' && (
                <div className="space-y-2">
                  <Label>Descreva a carga</Label>
                  <Input
                    placeholder="Ex: 3 geladeiras, 2 sofás..."
                    value={descricaoCarga}
                    onChange={(e) => setDescricaoCarga(e.target.value)}
                  />
                </div>
              )}

              {categoriaSelecionada && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary" />
                      <span className="font-medium">{categoriaSelecionada.nome}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {categoriaSelecionada.descricao}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Até {categoriaSelecionada.capacidade_kg}kg
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Box className="h-4 w-4" />
                  Tipo de carroceria
                </Label>
                <RadioGroup 
                  value={tipoCarroceria} 
                  onValueChange={(v) => setTipoCarroceria(v as TipoCarroceria)}
                >
                  {TIPOS_CARROCERIA.map((tipo) => (
                    <div 
                      key={tipo.id}
                      className={cn(
                        "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        tipoCarroceria === tipo.id 
                          ? "border-primary bg-primary/5" 
                          : "border-muted hover:bg-muted/50"
                      )}
                      onClick={() => setTipoCarroceria(tipo.id)}
                    >
                      <RadioGroupItem value={tipo.id} id={tipo.id} />
                      <div className="flex-1">
                        <Label htmlFor={tipo.id} className="cursor-pointer font-medium">
                          {tipo.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">{tipo.descricao}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setCurrentStep('rota')}>
                  Voltar
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={goToPreview}
                  disabled={!canProceedCarga}
                >
                  Ver prévia
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP: PREVIEW */}
          {currentStep === 'preview' && routeData && categoriaSelecionada && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Coleta</p>
                      <p className="text-sm">{origemText}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Navigation className="h-5 w-5 text-accent-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Entrega</p>
                      <p className="text-sm">{destinoText}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Distância</span>
                    <span className="font-medium">{routeData.distanceKm} km</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tempo estimado</span>
                    <span className="font-medium">~{routeData.durationMin} min</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Veículo</span>
                    <span className="font-medium">{categoriaSelecionada.nome}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Carroceria</span>
                    <span className="font-medium">
                      {TIPOS_CARROCERIA.find(t => t.id === tipoCarroceria)?.label}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold">Valor estimado</span>
                    <span className="text-2xl font-bold text-primary">
                      {formatarValorFrete(valorEstimado)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    O valor final pode variar conforme condições
                  </p>
                </CardContent>
              </Card>

              <div className="bg-secondary border border-border rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Sua solicitação será enviada para motoristas disponíveis na região.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setCurrentStep('carga')}>
                  Voltar
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Solicitar Frete
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// CSS para os marcadores
const style = document.createElement('style');
style.textContent = `
  .frete-marker {
    background: transparent !important;
    border: none !important;
  }
  .frete-marker:active {
    cursor: grabbing !important;
  }
`;
if (!document.head.querySelector('[data-frete-marker-styles]')) {
  style.setAttribute('data-frete-marker-styles', 'true');
  document.head.appendChild(style);
}
