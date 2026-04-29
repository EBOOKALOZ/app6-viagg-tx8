import { useState, useEffect, useCallback, useRef } from 'react';

export interface GeolocationPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}

export interface GeolocationState {
  position: GeolocationPosition | null;
  error: string | null;
  isLoading: boolean;
  isSupported: boolean;
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unknown';
  isTimedOut: boolean;
}

const STORAGE_KEY = 'lastKnownLocation';
const LOCATION_TIMEOUT = 8000; // 8 seconds timeout
const MAX_LOCATION_AGE = 5 * 60 * 1000; // CORREÇÃO: 5 minutos máximo (era 24 horas)

function getLastKnownLocation(): GeolocationPosition | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // CORREÇÃO: Usar apenas se menos de 5 minutos (evita localizações de teste antigas)
      if (parsed.timestamp && Date.now() - parsed.timestamp < MAX_LOCATION_AGE) {
        return parsed;
      } else {
        // Limpar localização antiga
        localStorage.removeItem(STORAGE_KEY);
        console.log('[useGeolocation] Localização antiga removida do cache');
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function saveLastKnownLocation(position: GeolocationPosition) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...position,
      timestamp: Date.now(),
    }));
  } catch {
    // Ignore errors
  }
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>(() => {
    const lastKnown = getLastKnownLocation();
    return {
      position: lastKnown,
      error: null,
      isLoading: false,
      isSupported: 'geolocation' in navigator,
      permissionStatus: 'unknown',
      isTimedOut: false,
    };
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check permission status
  const checkPermission = useCallback(async () => {
    if (!('permissions' in navigator)) {
      setState(prev => ({ ...prev, permissionStatus: 'unknown' }));
      return;
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      setState(prev => ({ ...prev, permissionStatus: result.state as 'prompt' | 'granted' | 'denied' }));
      
      result.onchange = () => {
        setState(prev => ({ ...prev, permissionStatus: result.state as 'prompt' | 'granted' | 'denied' }));
      };
    } catch {
      setState(prev => ({ ...prev, permissionStatus: 'unknown' }));
    }
  }, []);

  // Get current position
  const getCurrentPosition = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!state.isSupported) {
        reject(new Error('Geolocalização não suportada'));
        return;
      }

      setState(prev => ({ ...prev, isLoading: true, error: null, isTimedOut: false }));

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set our own timeout for better UX
      timeoutRef.current = setTimeout(() => {
        setState(prev => {
          // If still loading, mark as timed out
          if (prev.isLoading) {
            const lastKnown = getLastKnownLocation();
            return {
              ...prev,
              isLoading: false,
              isTimedOut: true,
              error: 'Não foi possível obter sua localização. Ative o GPS.',
              position: lastKnown || prev.position,
            };
          }
          return prev;
        });
      }, LOCATION_TIMEOUT);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          
          const pos: GeolocationPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          
          saveLastKnownLocation(pos);
          
          setState(prev => ({
            ...prev,
            position: pos,
            isLoading: false,
            error: null,
            isTimedOut: false,
            permissionStatus: 'granted',
          }));
          resolve(pos);
        },
        (error) => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          
          let errorMessage: string;
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Permissão de localização negada';
              setState(prev => ({ ...prev, permissionStatus: 'denied' }));
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Localização indisponível. Ative o GPS.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Tempo esgotado. Verifique se o GPS está ativado.';
              break;
            default:
              errorMessage = 'Erro ao obter localização';
          }
          
          const lastKnown = getLastKnownLocation();
          
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: errorMessage,
            isTimedOut: true,
            position: lastKnown || prev.position,
          }));
          reject(new Error(errorMessage));
        },
        {
          enableHighAccuracy: true,
          timeout: LOCATION_TIMEOUT - 1000, // Slightly less than our timeout
          maximumAge: 60000, // Cache for 1 minute
        }
      );
    });
  }, [state.isSupported]);

  // Request permission and get location
  const requestLocation = useCallback(async () => {
    try {
      await getCurrentPosition();
    } catch (error) {
      console.error('Failed to get location:', error);
    }
  }, [getCurrentPosition]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Initial permission check
  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  return {
    ...state,
    getCurrentPosition,
    requestLocation,
    checkPermission,
    hasLastKnownLocation: Boolean(getLastKnownLocation()),
  };
}
