import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Check, X, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Fix for default markers not showing
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface LocationAdjustMapProps {
  initialLat?: number;
  initialLng?: number;
  type: 'origin' | 'destination';
  onConfirm: (lat: number, lng: number) => void;
  onCancel: () => void;
}

/**
 * Mapa para ajuste manual de localização com marcador arrastável
 */
export function LocationAdjustMap({
  initialLat,
  initialLng,
  type,
  onConfirm,
  onCancel,
}: LocationAdjustMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  
  // Estado da posição ajustada
  const [currentLat, setCurrentLat] = useState(initialLat ?? -23.5505);
  const [currentLng, setCurrentLng] = useState(initialLng ?? -46.6333);

  // Cores baseadas no tipo
  const markerColor = type === 'origin' ? '#14b8a6' : '#f59e0b'; // teal / amber
  const title = type === 'origin' ? 'Ajustar Origem' : 'Ajustar Destino';

  // Criar ícone personalizado para o marcador arrastável
  const createDraggableIcon = useCallback(() => {
    const size = 48;
    const html = `
      <div style="
        width: ${size}px;
        height: ${size}px;
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
      <div style="
        margin-top: 4px;
        padding: 2px 8px;
        background: rgba(0,0,0,0.8);
        color: white;
        font-size: 11px;
        font-weight: 600;
        border-radius: 12px;
        white-space: nowrap;
        text-align: center;
      ">
        Arraste para ajustar
      </div>
    `;

    return L.divIcon({
      html,
      className: 'draggable-marker',
      iconSize: [size, size + 24],
      iconAnchor: [size / 2, size / 2],
    });
  }, [markerColor]);

  // Inicializar mapa
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [currentLat, currentLng],
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Criar marcador arrastável
    const marker = L.marker([currentLat, currentLng], {
      icon: createDraggableIcon(),
      draggable: true,
    }).addTo(map);

    // Atualizar estado quando marcador é arrastado
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      setCurrentLat(pos.lat);
      setCurrentLng(pos.lng);
    });

    // Também permitir clicar no mapa para mover o marcador
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      setCurrentLat(e.latlng.lat);
      setCurrentLng(e.latlng.lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    // Corrigir tamanho do mapa
    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Atualizar marcador quando lat/lng inicial mudam
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && initialLat && initialLng) {
      markerRef.current.setLatLng([initialLat, initialLng]);
      mapInstanceRef.current.setView([initialLat, initialLng], 16);
      setCurrentLat(initialLat);
      setCurrentLng(initialLng);
    }
  }, [initialLat, initialLng]);

  // Centralizar na posição atual do GPS
  const handleCenterOnGPS = async () => {
    if (!navigator.geolocation) return;
    
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const { latitude, longitude } = position.coords;
      setCurrentLat(latitude);
      setCurrentLng(longitude);

      if (markerRef.current && mapInstanceRef.current) {
        markerRef.current.setLatLng([latitude, longitude]);
        mapInstanceRef.current.setView([latitude, longitude], 16);
      }
    } catch (err) {
      console.warn('[LocationAdjustMap] Erro ao obter GPS:', err);
    }
  };

  const handleConfirm = () => {
    onConfirm(currentLat, currentLng);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50 bg-background">
        <div className="flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: markerColor }}
          >
            {type === 'origin' ? (
              <Navigation className="h-4 w-4 text-white" />
            ) : (
              <MapPin className="h-4 w-4 text-white" />
            )}
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">Toque ou arraste para ajustar</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Mapa */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full" style={{ minHeight: '300px' }} />
        
        {/* Botão centralizar GPS */}
        <button
          onClick={handleCenterOnGPS}
          className="absolute bottom-20 right-3 z-[1000] w-10 h-10 bg-white dark:bg-zinc-800 rounded-full shadow-lg flex items-center justify-center border border-border/50 hover:bg-muted transition-colors"
          title="Centralizar no GPS"
        >
          <Crosshair className="h-5 w-5 text-primary" />
        </button>
      </div>

      {/* Coordenadas atuais */}
      <div className="p-2 bg-muted/50 border-t border-border/50">
        <p className="text-xs text-center text-muted-foreground font-mono">
          {currentLat.toFixed(6)}, {currentLng.toFixed(6)}
        </p>
      </div>

      {/* Botões de ação */}
      <div className="flex gap-3 p-4 border-t border-border/50 bg-background">
        <Button 
          variant="outline" 
          onClick={onCancel}
          className="flex-1 h-12"
        >
          Cancelar
        </Button>
        <Button 
          onClick={handleConfirm}
          className="flex-1 h-12 bg-gradient-to-r from-zhiq-teal to-zhiq-green text-white"
        >
          <Check className="h-4 w-4 mr-2" />
          Confirmar Local
        </Button>
      </div>
    </div>
  );
}

// CSS para o marcador arrastável
const style = document.createElement('style');
style.textContent = `
  .draggable-marker {
    background: transparent !important;
    border: none !important;
  }
  .draggable-marker:active {
    cursor: grabbing !important;
  }
`;
document.head.appendChild(style);
