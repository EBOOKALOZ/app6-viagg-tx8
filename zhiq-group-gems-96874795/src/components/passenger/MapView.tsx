import { MapPin, Navigation } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { SimpleMap, MapMarker, LocationPermissionCard } from "@/components/map";
import { useEffect, useState } from "react";

interface CurrentRideData {
  pickupLat?: number;
  pickupLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  polyline?: [number, number][];
}

interface MapViewProps {
  rideStatus: "idle" | "searching" | "driver_coming" | "in_ride";
  motoboyLocation?: { lat: number; lng: number } | null;
  destinationLocation?: { lat: number; lng: number } | null;
  currentRide?: CurrentRideData | null;
}

const MapView = ({ rideStatus, motoboyLocation, destinationLocation, currentRide }: MapViewProps) => {
  const { 
    position, 
    error, 
    isLoading, 
    permissionStatus, 
    requestLocation,
    isTimedOut,
  } = useGeolocation();
  
  const [showRealMap, setShowRealMap] = useState(false);
  const [hasAutoRequested, setHasAutoRequested] = useState(false);

  // Request location on mount (only once)
  useEffect(() => {
    if (!hasAutoRequested && (permissionStatus === 'unknown' || permissionStatus === 'prompt' || permissionStatus === 'granted')) {
      setHasAutoRequested(true);
      // Auto-request after a small delay to allow UI to render
      const timer = setTimeout(() => {
        requestLocation();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [permissionStatus, requestLocation, hasAutoRequested]);

  // Show real map when we have position
  useEffect(() => {
    if (position) {
      setShowRealMap(true);
    }
  }, [position]);

  // Build markers array
  const markers: MapMarker[] = [];
  
  if (position) {
    markers.push({
      id: 'user',
      lat: position.lat,
      lng: position.lng,
      type: 'user',
      label: 'Sua localização',
    });
  }

  if (motoboyLocation && (rideStatus === 'driver_coming' || rideStatus === 'in_ride')) {
    markers.push({
      id: 'motoboy',
      lat: motoboyLocation.lat,
      lng: motoboyLocation.lng,
      type: 'motoboy',
      label: 'Motoboy',
    });
  }

  if (destinationLocation) {
    markers.push({
      id: 'destination',
      lat: destinationLocation.lat,
      lng: destinationLocation.lng,
      type: 'destination',
      label: 'Destino',
    });
  }

  // CORREÇÃO: Adicionar marcadores de pickup/destino quando temos corrida ativa
  if (currentRide?.pickupLat && currentRide?.pickupLng && rideStatus !== 'idle') {
    // Só adiciona se não já tiver um marker 'user' na mesma posição
    const existingUser = markers.find(m => m.type === 'user');
    if (!existingUser || Math.abs(existingUser.lat - currentRide.pickupLat) > 0.0001) {
      markers.push({
        id: 'pickup',
        lat: currentRide.pickupLat,
        lng: currentRide.pickupLng,
        type: 'origin',
        label: 'Embarque',
      });
    }
  }

  if (currentRide?.destinationLat && currentRide?.destinationLng && rideStatus !== 'idle') {
    markers.push({
      id: 'ride-destination',
      lat: currentRide.destinationLat,
      lng: currentRide.destinationLng,
      type: 'destination',
      label: 'Destino',
    });
  }

  // Determinar polyline a mostrar
  const polylineToShow = currentRide?.polyline;

  // Show real map if we have location
  if (showRealMap && position) {
    // Determinar centro: usa pickup da corrida se disponível, senão posição atual
    const mapCenter = (currentRide?.pickupLat && currentRide?.pickupLng)
      ? { lat: currentRide.pickupLat, lng: currentRide.pickupLng }
      : { lat: position.lat, lng: position.lng };
    
    // Determinar se deve mostrar rota
    const shouldShowRoute = rideStatus !== 'idle' && markers.length >= 2;
    
    return (
      <div className="flex flex-col w-full h-full relative z-0 isolate">
        {/* Map container - z-index baixo para garantir que menus fiquem acima */}
        <div className="relative flex-1 min-h-[250px] overflow-hidden z-0">
          <SimpleMap 
            markers={markers}
            center={mapCenter}
            zoom={shouldShowRoute ? 14 : 15}
            className="w-full h-full"
            showRoute={shouldShowRoute}
            preCalculatedPolyline={polylineToShow}
          />
        </div>
        
        {/* Location info - outside the map, at the bottom */}
        <div className="bg-card border-t border-border px-4 py-3 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zhiq-teal to-zhiq-green flex items-center justify-center shadow-md">
            <MapPin className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-xs text-muted-foreground font-medium">Sua localização</span>
            <span className="text-sm text-foreground font-medium truncate">
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </span>
          </div>
          <Navigation className="h-5 w-5 text-zhiq-teal shrink-0" />
        </div>
      </div>
    );
  }

  // Show permission request, loading, or timeout state
  if (!position && (permissionStatus === 'prompt' || permissionStatus === 'denied' || error || isTimedOut)) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-background via-muted to-background flex items-center justify-center p-4">
        <LocationPermissionCard 
          onRequestPermission={requestLocation}
          isLoading={isLoading}
          error={error}
          permissionStatus={permissionStatus}
          isTimedOut={isTimedOut}
        />
      </div>
    );
  }

  // Fallback: Show placeholder while loading
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-muted to-background" />
      
      {/* Animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-zhiq-teal/10 via-transparent to-zhiq-green/5 animate-pulse" />

      {/* Grid pattern with glassmorphism */}
      <div className="absolute inset-0 opacity-30">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="url(#gridGradient)" strokeWidth="0.5" />
            </pattern>
            <linearGradient id="gridGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--zhiq-teal))" stopOpacity="0.6" />
              <stop offset="100%" stopColor="hsl(var(--zhiq-green))" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Glassmorphism floating orbs */}
      <div className="absolute top-1/4 right-1/4 w-32 h-32 rounded-full bg-zhiq-teal/20 blur-3xl" />
      <div className="absolute bottom-1/3 left-1/5 w-40 h-40 rounded-full bg-zhiq-green/15 blur-3xl" />
      <div className="absolute top-1/2 right-1/3 w-24 h-24 rounded-full bg-zhiq-gold/10 blur-2xl" />

      {/* Simulated streets with gradient */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-muted-foreground/40 to-transparent" />
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-muted-foreground/50 to-transparent" />
        <div className="absolute top-3/4 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-muted-foreground/40 to-transparent" />
        <div className="absolute left-1/4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-transparent via-muted-foreground/40 to-transparent" />
        <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-muted-foreground/50 to-transparent" />
        <div className="absolute left-3/4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-transparent via-muted-foreground/40 to-transparent" />
      </div>

      {/* Center loading indicator */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="relative">
          {/* Outer glow ring */}
          <div className="absolute inset-0 -m-8 rounded-full bg-gradient-to-r from-zhiq-teal/40 to-zhiq-green/40 blur-xl animate-pulse" />
          
          {/* Pulse rings */}
          <div className="absolute inset-0 -m-6 rounded-full border border-zhiq-teal/30 animate-ping" />
          <div className="absolute inset-0 -m-4 rounded-full bg-zhiq-teal/20 animate-pulse" />
          
          {/* Glassmorphism base */}
          <div className="absolute inset-0 -m-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20" />
          
          {/* Main marker */}
          <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-zhiq-teal via-zhiq-green to-zhiq-teal flex items-center justify-center shadow-lg shadow-zhiq-teal/40 border border-white/20">
            <Navigation className="h-7 w-7 text-white drop-shadow-md" />
          </div>
        </div>
      </div>

      {/* Driver marker (when coming or in ride) */}
      {(rideStatus === "driver_coming" || rideStatus === "in_ride") && (
        <div className="absolute top-1/3 left-1/3 z-10">
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 -m-3 rounded-full bg-zhiq-gold/30 blur-lg animate-pulse" />
            
            {/* Glassmorphism ring */}
            <div className="absolute inset-0 -m-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20" />
            
            {/* Main marker */}
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-zhiq-gold to-amber-500 flex items-center justify-center shadow-lg shadow-zhiq-gold/40 border border-white/20">
              <span className="text-xl">🚗</span>
            </div>
          </div>
        </div>
      )}

      {/* Location status - bottom bar outside map area */}
      <div className="absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zhiq-teal to-zhiq-green flex items-center justify-center animate-pulse">
          <MapPin className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-xs text-muted-foreground font-medium">Obtendo localização...</span>
          <span className="text-sm text-foreground font-medium">Aguarde um momento</span>
        </div>
      </div>
    </div>
  );
};

export default MapView;
