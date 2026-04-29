import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from './useGeolocation';

interface RoutePoint {
  lat: number;
  lng: number;
  timestamp: number;
}

interface UseRouteTrackingOptions {
  deliveryId: string | null;
  isActive: boolean;
  intervalMs?: number;
}

export function useRouteTracking({ deliveryId, isActive, intervalMs = 30000 }: UseRouteTrackingOptions) {
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { position, isLoading: geoLoading } = useGeolocation();

  const addPoint = useCallback(() => {
    if (position?.lat && position?.lng) {
      const newPoint: RoutePoint = {
        lat: position.lat,
        lng: position.lng,
        timestamp: Date.now(),
      };
      setRoutePoints(prev => [...prev, newPoint]);
    }
  }, [position]);

  const startTracking = useCallback(() => {
    if (isTracking) return;
    
    setIsTracking(true);
    setRoutePoints([]);
    
    // Adicionar ponto inicial
    addPoint();
    
    // Configurar intervalo
    intervalRef.current = setInterval(addPoint, intervalMs);
  }, [isTracking, addPoint, intervalMs]);

  const stopTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsTracking(false);
  }, []);

  const saveRouteToHistory = useCallback(async (deliveryOrderId: string) => {
    if (routePoints.length === 0) return;

    try {
      // Atualizar delivery_history com os pontos da rota
      const { error } = await supabase
        .from('delivery_history')
        .update({ 
          route_points: routePoints.map(p => ({ lat: p.lat, lng: p.lng }))
        })
        .eq('delivery_order_id', deliveryOrderId);

      if (error) {
        console.error('[useRouteTracking] Erro ao salvar rota:', error);
      } else {
        console.log('[useRouteTracking] Rota salva com sucesso:', routePoints.length, 'pontos');
      }
    } catch (err) {
      console.error('[useRouteTracking] Erro:', err);
    }
  }, [routePoints]);

  // Gerar hash único para o comprovante
  const generateReceiptHash = useCallback(() => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`.toUpperCase();
  }, []);

  // Auto start/stop baseado em isActive
  useEffect(() => {
    if (isActive && deliveryId && !isTracking) {
      startTracking();
    } else if (!isActive && isTracking) {
      stopTracking();
    }
  }, [isActive, deliveryId, isTracking, startTracking, stopTracking]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    routePoints,
    isTracking,
    startTracking,
    stopTracking,
    saveRouteToHistory,
    generateReceiptHash,
    currentLocation: position ? { lat: position.lat, lng: position.lng } : null,
  };
}
