import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export interface UserAutonomousLocation {
  city?: string;
  state?: string;
  resolved: boolean;
}

/**
 * Busca a cidade cadastrada do usuário nos 3 perfis autônomos (motoboy, mototaxi, motorista)
 * ou na tabela geral de perfis (profiles).
 */
export function useUserAutonomousCity(): UserAutonomousLocation {
  const { user, activeProfile } = useAuth();
  const [city, setCity] = useState<string | undefined>(undefined);
  const [state, setState] = useState<string | undefined>(undefined);
  const [resolved, setResolved] = useState<boolean>(false);

  useEffect(() => {
    if (!user?.id) {
      setResolved(true);
      return;
    }

    let cancelled = false;

    const fetchCity = async () => {
      try {
        const tables =
          activeProfile === 'driver' || activeProfile === 'mototaxi'
            ? ['driver_profiles', 'motoboy_profiles']
            : ['motoboy_profiles', 'driver_profiles'];

        for (const table of tables) {
          const { data } = await (supabase.from(table) as any)
            .select('cidade, estado')
            .eq('user_id', user.id)
            .maybeSingle();

          if (data?.cidade && !cancelled) {
            setCity(data.cidade);
            setState(data.estado);
            setResolved(true);
            return;
          }
        }

        // Se não achou em tabelas profissionais, busca em profiles
        const { data: profData } = await (supabase.from('profiles') as any)
          .select('cidade, estado')
          .eq('id', user.id)
          .maybeSingle();

        if (profData?.cidade && !cancelled) {
          setCity(profData.cidade);
          setState(profData.estado);
        }
      } catch {
        // ignora erro e libera fallback de GPS
      } finally {
        if (!cancelled) setResolved(true);
      }
    };

    fetchCity();
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeProfile]);

  return { city, state, resolved };
}
