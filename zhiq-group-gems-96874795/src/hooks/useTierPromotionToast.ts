import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { TIER_LADDER, getCurrentTier, type TierName } from '@/components/motoboy/TierLadderCard';

const STORAGE_KEY = 'motoboy:lastTier';

/**
 * Dispara um toast celebrativo quando o motoboy sobe de tier.
 * Detecta promoção comparando o tier atual com o último salvo no localStorage.
 * Também dispara rebaixamento como warning (queda de grupo).
 */
export function useTierPromotionToast(userId: string | undefined, validGroups: number | undefined) {
  // Guarda o tier mostrado na renderização anterior pra evitar dispara em todo render
  const lastSeenRef = useRef<TierName | null>(null);

  useEffect(() => {
    if (!userId || validGroups === undefined || validGroups === null) return;

    const current = getCurrentTier(validGroups);
    const stored = (typeof localStorage !== 'undefined'
      ? localStorage.getItem(`${STORAGE_KEY}:${userId}`)
      : null) as TierName | null;

    // Primeira vez no dispositivo: só registra, não toast
    if (!stored) {
      localStorage.setItem(`${STORAGE_KEY}:${userId}`, current.name);
      lastSeenRef.current = current.name;
      return;
    }

    // Sem mudança real desde o último render desta sessão
    if (lastSeenRef.current === current.name && stored === current.name) return;

    if (stored !== current.name) {
      const currentIdx = TIER_LADDER.findIndex(t => t.name === current.name);
      const storedIdx = TIER_LADDER.findIndex(t => t.name === stored);

      if (currentIdx > storedIdx) {
        // SUBIU
        toast.success(`🎉 PROMOÇÃO! Você subiu para ${current.name}!`, {
          description: `Sua taxa TX8 caiu para ${current.rate}%.${
            current.name === 'VIP' ? ' Você atingiu o topo da plataforma!' : ''
          }`,
          duration: 8000,
        });
      } else if (currentIdx < storedIdx) {
        // CAIU
        toast.warning(`Você foi rebaixado para ${current.name}`, {
          description: `Sua taxa subiu para ${current.rate}%. Recupere um grupo válido pra voltar.`,
          duration: 8000,
        });
      }

      localStorage.setItem(`${STORAGE_KEY}:${userId}`, current.name);
    }

    lastSeenRef.current = current.name;
  }, [userId, validGroups]);
}
