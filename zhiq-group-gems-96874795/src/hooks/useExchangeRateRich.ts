import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ExchangeRateRich {
  current: number;
  open: number;
  high: number;
  low: number;
  variationPercent: number;
  direction: 'up' | 'down' | 'neutral';
  updatedAt: Date;
}

// Module-level cache
let cachedRate: ExchangeRateRich | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60_000; // 5 minutes
const MAX_RETRIES = 3;

async function fetchFromEdgeFunction(): Promise<ExchangeRateRich> {
  const { data, error } = await supabase.functions.invoke('get-exchange-rate');
  if (error) throw error;
  if (!data?.current) throw new Error('Invalid response');

  return {
    current: data.current,
    open: data.open,
    high: data.high,
    low: data.low,
    variationPercent: data.variationPercent,
    direction: data.direction,
    updatedAt: new Date(data.timestamp),
  };
}

export function useExchangeRateRich() {
  const [rate, setRate] = useState<ExchangeRateRich | null>(cachedRate);
  const [loading, setLoading] = useState(cachedRate === null);

  useEffect(() => {
    if (cachedRate && Date.now() - cacheTimestamp < CACHE_TTL) {
      setRate(cachedRate);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
          }
          if (cancelled) return;

          const data = await fetchFromEdgeFunction();
          if (cancelled) return;

          cachedRate = data;
          cacheTimestamp = Date.now();
          setRate(data);
          setLoading(false);
          return;
        } catch (err) {
          console.error(`Erro cotação USD/BRL (tentativa ${attempt + 1}):`, err);
        }
      }

      // All retries failed – use stale cache or null
      if (!cancelled) {
        if (cachedRate) setRate(cachedRate);
        setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, []);

  return { rate, loading };
}
