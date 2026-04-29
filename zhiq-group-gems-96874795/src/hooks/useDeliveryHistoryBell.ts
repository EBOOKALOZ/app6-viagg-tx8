import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSoundSettings } from '@/contexts/SoundSettingsContext';
import { isDeliveryOfferRinging } from '@/hooks/useDeliveryOfferListener';

const LAST_SEEN_KEY = 'viagg_delivery_history_last_seen';

export interface DeliveryNotification {
  id: string;
  status: string;
  loja_nome: string | null;
  destination: string;
  valor_liquido: number;
  created_at: string | null;
  finalizada_em: string | null;
  isRead: boolean;
}

export function useDeliveryHistoryBell() {
  const { user } = useAuth();
  const { soundtrackEnabled } = useSoundSettings();
  const [newCount, setNewCount] = useState(0);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<DeliveryNotification[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevCountRef = useRef(0);
  const lastSeenRef = useRef<string>(getStoredLastSeen());

  function getStoredLastSeen() {
    const stored = localStorage.getItem(LAST_SEEN_KEY);
    return stored || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  const markAsSeen = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_SEEN_KEY, now);
    lastSeenRef.current = now;
    setNewCount(0);
    setShouldAnimate(false);
    // Mark all current notifications as read
    setRecentNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  const checkNewRides = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Fetch recent notifications (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('delivery_history')
        .select('id, status, loja_nome, destination, valor_liquido, created_at, finalizada_em')
        .eq('motoboy_id', user.id)
        .gt('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) {
        console.error('[useDeliveryHistoryBell] Error:', error);
        return;
      }

      const items = data ?? [];
      const lastSeen = lastSeenRef.current;

      // Count unread (created after lastSeen)
      const unread = items.filter(i => i.created_at && i.created_at > lastSeen).length;

      // Trigger animation + sound only if count increased
      if (unread > prevCountRef.current && unread > 0) {
        setShouldAnimate(true);
        // ★ Não tocar ambiente se o BIP de oferta já está ativo
        if (soundtrackEnabled && audioRef.current && !isDeliveryOfferRinging()) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
        setTimeout(() => setShouldAnimate(false), 2000);
      }

      prevCountRef.current = unread;
      setNewCount(unread);
      setRecentNotifications(
        items.map(item => ({
          ...item,
          isRead: !item.created_at || item.created_at <= lastSeen,
        }))
      );
    } catch (err) {
      console.error('[useDeliveryHistoryBell] Polling error:', err);
    }
  }, [user?.id, soundtrackEnabled]);

  useEffect(() => {
    checkNewRides();
    const interval = setInterval(checkNewRides, 30_000);
    return () => clearInterval(interval);
  }, [checkNewRides]);

  useEffect(() => {
    audioRef.current = new Audio('/audio/painel-ambiente.mp3');
    audioRef.current.volume = 0.3;

    // ★ Parar imediatamente quando o BIP de oferta emitir o evento global
    const handleStopAll = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
    window.addEventListener('stop-all-motoboy-audio', handleStopAll);

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      window.removeEventListener('stop-all-motoboy-audio', handleStopAll);
    };
  }, []);

  return {
    newCount,
    shouldAnimate,
    markAsSeen,
    recentNotifications,
  };
}
