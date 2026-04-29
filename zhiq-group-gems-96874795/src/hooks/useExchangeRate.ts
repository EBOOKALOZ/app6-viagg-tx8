import { useState, useEffect } from 'react';

interface ExchangeRate {
  usdBrl: number;
  updatedAt: Date;
}

const cache: { data: ExchangeRate | null; ts: number } = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function useExchangeRate() {
  const [rate, setRate] = useState<ExchangeRate | null>(cache.data);
  const [loading, setLoading] = useState(!cache.data);

  useEffect(() => {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      setRate(cache.data);
      return;
    }

    setLoading(true);
    fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
      .then((r) => r.json())
      .then((d) => {
        const bid = d?.USDBRL?.bid;
        if (bid) {
          const data: ExchangeRate = {
            usdBrl: parseFloat(bid),
            updatedAt: new Date(),
          };
          cache.data = data;
          cache.ts = Date.now();
          setRate(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { rate, loading };
}
