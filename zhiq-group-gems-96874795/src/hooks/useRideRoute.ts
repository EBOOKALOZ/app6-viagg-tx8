import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook para calcular rota entre dois pontos usando Mapbox
 * IMPORTANTE: Este hook NÃO calcula preço - o preço vem do banco
 * O preço é definido na criação da corrida e permanece imutável
 */
export interface RideRouteData {
  polyline: [number, number][];
  distanceKm: number;
  durationMin: number;
  // REMOVIDO: estimatedPrice - preço SEMPRE vem do banco, nunca recalculado
}

interface UseRideRouteReturn {
  routeData: RideRouteData | null;
  isCalculating: boolean;
  calculateRoute: (origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) => Promise<RideRouteData | null>;
  clearRoute: () => void;
}

export function useRideRoute(): UseRideRouteReturn {
  const [routeData, setRouteData] = useState<RideRouteData | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const calculateRoute = useCallback(async (
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<RideRouteData | null> => {
    console.log('[useRideRoute] Calculando rota:', { origin, destination });
    setIsCalculating(true);

    try {
      const { data, error } = await supabase.functions.invoke('get-route', {
        body: { origin, destination, snapRadius: 500 },
      });

      if (error) {
        console.error('[useRideRoute] Erro ao buscar rota:', error);
        return null;
      }

      if (!data?.geometry?.coordinates || !data?.distance || !data?.duration) {
        console.error('[useRideRoute] Dados incompletos da rota:', data);
        return null;
      }

      // Converter coordenadas GeoJSON [lng, lat] para Leaflet [lat, lng]
      const polyline: [number, number][] = data.geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]]
      );

      // Converter metros para km
      const distanceKm = data.distance / 1000;

      // Converter segundos para minutos
      const durationMin = Math.ceil(data.duration / 60);

      // CORREÇÃO: Não calcular preço aqui - preço vem EXCLUSIVAMENTE do banco
      const result: RideRouteData = {
        polyline,
        distanceKm: Math.round(distanceKm * 10) / 10,
        durationMin,
        // estimatedPrice REMOVIDO - deve vir do ride.estimated_price do banco
      };

      console.log('[useRideRoute] ✅ Rota calculada:', result.distanceKm, 'km,', result.durationMin, 'min (preço vem do banco)');
      setRouteData(result);
      return result;
    } catch (err) {
      console.error('[useRideRoute] Erro:', err);
      return null;
    } finally {
      setIsCalculating(false);
    }
  }, []);

  const clearRoute = useCallback(() => {
    setRouteData(null);
  }, []);

  return {
    routeData,
    isCalculating,
    calculateRoute,
    clearRoute,
  };
}
