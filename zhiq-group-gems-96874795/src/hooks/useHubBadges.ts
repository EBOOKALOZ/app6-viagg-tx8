import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * useHubBadges — contadores REAIS para as abas do hub Impulsionar.
 * Só consultas de contagem (head:true), baratas; atualiza a cada 60s.
 *  • notificacoes — não lidas do usuário (perfil atual + 'all')
 *  • divulgacoes  — oportunidades ativas no marketplace (produtos+imóveis+veículos)
 *  • grupos       — grupos ativos vinculados pelo profissional
 */
export function useHubBadges(profileType: 'motoboy' | 'mototaxi' | 'driver') {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['hub-badges', user?.id, profileType],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const [notif, adv, re, ve, grupos] = await Promise.all([
        // @ts-expect-error - Types may not have exact schema
        supabase.from('user_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('is_read', false)
          .in('profile_type', [profileType, 'all']),
        // @ts-expect-error - Types may not have exact schema
        supabase.from('advertiser_listings')
          .select('id', { count: 'exact', head: true })
          .eq('listing_status', 'active'),
        // @ts-expect-error - Types may not have exact schema
        supabase.from('real_estate_listings')
          .select('id', { count: 'exact', head: true })
          .eq('visibility_status', 'published'),
        // @ts-expect-error - Types may not have exact schema
        supabase.from('vehicle_listings')
          .select('id', { count: 'exact', head: true })
          .eq('visibility_status', 'published'),
        // @ts-expect-error - Types may not have exact schema
        supabase.from('whatsapp_groups')
          .select('id', { count: 'exact', head: true })
          .eq('owner_user_id', user!.id)
          .eq('is_active', true),
      ]);
      return {
        notificacoes: notif.count ?? 0,
        divulgacoes: (adv.count ?? 0) + (re.count ?? 0) + (ve.count ?? 0),
        grupos: grupos.count ?? 0,
      } as Record<string, number>;
    },
  });

  return data ?? null;
}
