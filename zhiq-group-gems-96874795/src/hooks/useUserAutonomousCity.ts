import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export interface UserAutonomousLocation {
  city?: string;
  state?: string;
  resolved: boolean;
}

const DEFAULT_CITY = 'Aripuanã';
const DEFAULT_STATE = 'MT';

/**
 * Busca a cidade cadastrada do usuário nos perfis autônomos ou, se não houver,
 * busca a cidade base dos motoboys cadastrados na plataforma (ex.: Aripuanã - MT).
 */
export function useUserAutonomousCity(): UserAutonomousLocation {
  const { user, activeProfile } = useAuth();
  const [city, setCity] = useState<string | undefined>(undefined);
  const [state, setState] = useState<string | undefined>(undefined);
  const [resolved, setResolved] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    const fetchCity = async () => {
      try {
        // 1. Se o usuário estiver autenticado, tenta buscar o cadastro dele primeiro
        if (user?.id) {
          const tables =
            activeProfile === 'driver' || activeProfile === 'mototaxi'
              ? ['driver_profiles', 'motoboy_profiles']
              : ['motoboy_profiles', 'driver_profiles'];

          for (const table of tables) {
            // @ts-expect-error - Type definitions may be missing
            const { data } = await supabase.from(table)
              .select('cidade, estado')
              .eq('user_id', user.id)
              .maybeSingle();

            if (data?.cidade && data.cidade !== 'Cidade' && !cancelled) {
              setCity(data.cidade);
              setState(data.estado || DEFAULT_STATE);
              setResolved(true);
              return;
            }
          }

          // Busca no perfil geral (profiles)
          // @ts-expect-error - Type definitions may be missing
          const { data: profData } = await supabase.from('profiles')
            .select('cidade, estado')
            .eq('id', user.id)
            .maybeSingle();

          if (profData?.cidade && profData.cidade !== 'Cidade' && !cancelled) {
            setCity(profData.cidade);
            setState(profData.estado || DEFAULT_STATE);
            setResolved(true);
            return;
          }
        }

        // 2. Busca primeiro por motoboys na cidade principal (Aripuanã)
        // @ts-expect-error - Type definitions may be missing
        const { data: aripuanaMb } = await supabase.from('motoboy_profiles')
          .select('cidade, estado')
          .ilike('cidade', '%aripuan%')
          .limit(1)
          .maybeSingle();

        if (aripuanaMb?.cidade && !cancelled) {
          setCity('Aripuanã');
          setState(aripuanaMb.estado || DEFAULT_STATE);
          setResolved(true);
          return;
        }

        // 2b. Se não houver, busca qualquer motoboy válido (excluindo testes/estação homônima)
        // @ts-expect-error - Type definitions may be missing
        const { data: mbData } = await supabase.from('motoboy_profiles')
          .select('cidade, estado')
          .not('cidade', 'is', null)
          .neq('cidade', '')
          .neq('cidade', 'Cidade')
          .neq('cidade', 'Santa Maria de Ipire')
          .limit(1)
          .maybeSingle();

        if (mbData?.cidade && !cancelled) {
          setCity(mbData.cidade);
          setState(mbData.estado || DEFAULT_STATE);
          setResolved(true);
          return;
        }

        // 3. Fallback final garantido para Aripuanã - MT
        if (!cancelled) {
          setCity(DEFAULT_CITY);
          setState(DEFAULT_STATE);
          setResolved(true);
        }
      } catch {
        if (!cancelled) {
          setCity(DEFAULT_CITY);
          setState(DEFAULT_STATE);
          setResolved(true);
        }
      }
    };

    fetchCity();
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeProfile]);

  return { city, state, resolved };
}
