import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UserNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  // POSTADOR 3 — campos estendidos
  source_module?: string;
  severity?: string;
  reference_type?: string;
  reference_id?: string;
  profile_type?: string;
  read_at?: string | null;
  metadata?: Record<string, unknown>;
}

interface UseNotificationsOptions {
  sourceModule?: string;   // Filtrar por módulo (postador, delivery, system)
  profileType?: string;    // Filtrar por perfil (motoboy, lojista, admin)
  limit?: number;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const { sourceModule, profileType, limit = 50 } = options;

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      let query = supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Filtro por modulo
      if (sourceModule) {
        query = query.eq('source_module', sourceModule);
      }

      // Filtro por perfil: mostrar 'all' + perfil especifico
      if (profileType) {
        query = query.in('profile_type', [profileType, 'all']);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[useNotifications] Fetch error:', error);
        return;
      }

      const typedData = (data || []) as UserNotification[];
      setNotifications(typedData);
      setUnreadCount(typedData.filter(n => !n.is_read).length);
    } catch (err) {
      console.error('[useNotifications] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, sourceModule, profileType, limit]);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('user_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() } as any)
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[useNotifications] Mark as read error:', error);
      return;
    }

    // Optimistic update
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [user?.id]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;

    let query = supabase
      .from('user_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() } as any)
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (sourceModule) {
      query = query.eq('source_module', sourceModule);
    }

    const { error } = await query;

    if (error) {
      console.error('[useNotifications] Mark all as read error:', error);
      return;
    }

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user?.id, sourceModule]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications:${user.id}:${sourceModule || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNotification = payload.new as UserNotification;

            // Filtrar por modulo/perfil no frontend também
            if (sourceModule && newNotification.source_module !== sourceModule) return;
            if (profileType && newNotification.profile_type !== profileType && newNotification.profile_type !== 'all') return;

            setNotifications(prev => [newNotification, ...prev]);
            if (!newNotification.is_read) {
              setUnreadCount(prev => prev + 1);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as UserNotification;
            setNotifications(prev => {
              const next = prev.map(n => (n.id === updated.id ? updated : n));
              setUnreadCount(next.filter(n => !n.is_read).length);
              return next;
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setNotifications(prev => {
              const next = prev.filter(n => n.id !== deletedId);
              setUnreadCount(next.filter(n => !n.is_read).length);
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, sourceModule, profileType]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
