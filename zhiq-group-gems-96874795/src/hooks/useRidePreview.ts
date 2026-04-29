import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RidePreviewData {
  // Coordenadas
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  // Rota (independente do tipo de veículo)
  polyline: [number, number][];
  distanceKm: number;
  durationMin: number;
  // Preço NÃO calculado aqui - será calculado no componente baseado no tipo
}

interface UseRidePreviewReturn {
  previewData: RidePreviewData | null;
  isCalculating: boolean;
  error: string | null;
  calculatePreview: (
    pickupCoords: { lat: number; lng: number },
    destinationText: string
  ) => Promise<RidePreviewData | null>;
  calculatePreviewWithCoords: (
    pickupCoords: { lat: number; lng: number },
    destinationCoords: { lat: number; lng: number }
  ) => Promise<RidePreviewData | null>;
  clearPreview: () => void;
}

/**
 * Hook para calcular preview da corrida ANTES de confirmar
 * Geocodifica destino e calcula rota (SEM preço - preço depende do tipo de veículo)
 */
export function useRidePreview(): UseRidePreviewReturn {
  const [previewData, setPreviewData] = useState<RidePreviewData | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Calcula preview usando texto de destino (geocodifica primeiro)
   */
  const calculatePreview = useCallback(async (
    pickupCoords: { lat: number; lng: number },
    destinationText: string
  ): Promise<RidePreviewData | null> => {
    // LOG CRÍTICO: Mostrar coordenadas EXATAS usadas
    console.log('[useRidePreview] 🚀 INICIANDO CÁLCULO COM:', {
      origem: `lat=${pickupCoords.lat}, lng=${pickupCoords.lng}`,
      destinoTexto: destinationText
    });
    
    setIsCalculating(true);
    setError(null);

    try {
      // PASSO 1: Geocodificar destino (texto → coordenadas)
      console.log('[useRidePreview] 📍 Geocodificando destino...');
      const { data: geoData, error: geoError } = await supabase.functions.invoke('geocode-address', {
        body: { address: destinationText },
      });

      if (geoError || !geoData?.lat || !geoData?.lng) {
        const errorMsg = 'Não foi possível encontrar o endereço de destino';
        console.error('[useRidePreview] ❌ Erro geocodificação:', geoError || geoData);
        setError(errorMsg);
        return null;
      }

      // Converter para números para garantir tipo correto
      const destinationLat = Number(geoData.lat);
      const destinationLng = Number(geoData.lng);
      
      // LOG CRÍTICO: Mostrar coordenadas do destino geocodificado
      console.log('[useRidePreview] ✅ DESTINO GEOCODIFICADO:', {
        lat: destinationLat,
        lng: destinationLng,
        display: geoData.display_name
      });

      // PASSO 2: Calcular rota via Mapbox - USAR COORDENADAS EXATAS
      const routeOrigin = { lat: Number(pickupCoords.lat), lng: Number(pickupCoords.lng) };
      const routeDestination = { lat: destinationLat, lng: destinationLng };
      
      console.log('[useRidePreview] 🗺️ CALCULANDO ROTA COM:', {
        origem: `${routeOrigin.lat}, ${routeOrigin.lng}`,
        destino: `${routeDestination.lat}, ${routeDestination.lng}`
      });
      
      const { data: routeData, error: routeError } = await supabase.functions.invoke('get-route', {
        body: {
          origin: routeOrigin,
          destination: routeDestination,
          snapRadius: 500, // Snap para via mais próxima em raio de 500m
        },
      });

      if (routeError || !routeData?.geometry?.coordinates) {
        const errorMsg = 'Não foi possível calcular a rota';
        console.error('[useRidePreview] ❌ Erro rota:', routeError || routeData);
        setError(errorMsg);
        return null;
      }

      // Converter coordenadas GeoJSON [lng, lat] para Leaflet [lat, lng]
      const polyline: [number, number][] = routeData.geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]]
      );

      // Converter metros para km
      const distanceKm = Math.round((routeData.distance / 1000) * 10) / 10;

      // Converter segundos para minutos
      const durationMin = Math.ceil(routeData.duration / 60);

      const result: RidePreviewData = {
        pickupLat: pickupCoords.lat,
        pickupLng: pickupCoords.lng,
        destinationLat,
        destinationLng,
        polyline,
        distanceKm,
        durationMin,
      };

      console.log('[useRidePreview] ✅ Preview calculado (sem preço):', {
        distanceKm: result.distanceKm,
        durationMin: result.durationMin,
      });

      setPreviewData(result);
      return result;
    } catch (err) {
      const errorMsg = 'Erro ao calcular corrida';
      console.error('[useRidePreview] Erro:', err);
      setError(errorMsg);
      return null;
    } finally {
      setIsCalculating(false);
    }
  }, []);

  /**
   * Calcula preview usando coordenadas diretas (ajuste manual)
   */
  const calculatePreviewWithCoords = useCallback(async (
    pickupCoords: { lat: number; lng: number },
    destinationCoords: { lat: number; lng: number }
  ): Promise<RidePreviewData | null> => {
    // Garantir conversão para números
    const routeOrigin = { lat: Number(pickupCoords.lat), lng: Number(pickupCoords.lng) };
    const routeDestination = { lat: Number(destinationCoords.lat), lng: Number(destinationCoords.lng) };
    
    // LOG CRÍTICO: Mostrar coordenadas EXATAS usadas
    console.log('[useRidePreview] 🗺️ CÁLCULO MANUAL COM COORDENADAS:', {
      origem: `${routeOrigin.lat}, ${routeOrigin.lng}`,
      destino: `${routeDestination.lat}, ${routeDestination.lng}`
    });
    
    setIsCalculating(true);
    setError(null);

    try {
      // Calcular rota via Mapbox (sem geocodificação)
      const { data: routeData, error: routeError } = await supabase.functions.invoke('get-route', {
        body: {
          origin: routeOrigin,
          destination: routeDestination,
          snapRadius: 500, // Snap para via mais próxima em raio de 500m
        },
      });

      if (routeError || !routeData?.geometry?.coordinates) {
        const errorMsg = 'Não foi possível calcular a rota';
        console.error('[useRidePreview] ❌ Erro rota:', routeError || routeData);
        setError(errorMsg);
        return null;
      }

      // Converter coordenadas GeoJSON [lng, lat] para Leaflet [lat, lng]
      const polyline: [number, number][] = routeData.geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]]
      );

      // Converter metros para km
      const distanceKm = Math.round((routeData.distance / 1000) * 10) / 10;

      // Converter segundos para minutos
      const durationMin = Math.ceil(routeData.duration / 60);

      const result: RidePreviewData = {
        pickupLat: pickupCoords.lat,
        pickupLng: pickupCoords.lng,
        destinationLat: destinationCoords.lat,
        destinationLng: destinationCoords.lng,
        polyline,
        distanceKm,
        durationMin,
      };

      console.log('[useRidePreview] ✅ Preview calculado (coordenadas manuais):', {
        distanceKm: result.distanceKm,
        durationMin: result.durationMin,
      });

      setPreviewData(result);
      return result;
    } catch (err) {
      const errorMsg = 'Erro ao calcular corrida';
      console.error('[useRidePreview] Erro:', err);
      setError(errorMsg);
      return null;
    } finally {
      setIsCalculating(false);
    }
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewData(null);
    setError(null);
  }, []);

  return {
    previewData,
    isCalculating,
    error,
    calculatePreview,
    calculatePreviewWithCoords,
    clearPreview,
  };
}
