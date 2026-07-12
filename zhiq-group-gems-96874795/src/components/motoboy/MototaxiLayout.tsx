import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MotoboyPanelHeader } from '@/components/motoboy/MotoboyPanelHeader';
import MototaxiBottomNav from '@/components/motoboy/MototaxiBottomNav';
import { WeatherEventsCard } from '@/components/motoboy/WeatherEventsCard';

export function MototaxiLayout() {
  const { user, refreshProfiles } = useAuth();
  const location = useLocation();

  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [userName, setUserName] = useState('Moto-Taxista');
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    refreshProfiles();

    const fetchProfileData = async () => {
      try {
        const { data: motoboyProfile } = await supabase
          .from('motoboy_profiles')
          .select('cidade, estado, is_online')
          .eq('user_id', user.id)
          .maybeSingle();

        if (motoboyProfile) {
          setCity(motoboyProfile.cidade || 'Cidade');
          setState(motoboyProfile.estado || 'UF');
          // Sempre online ao entrar no painel
          if (!motoboyProfile.is_online) {
            await supabase
              .from('motoboy_profiles')
              .update({ is_online: true })
              .eq('user_id', user.id);
          }
          setIsOnline(true);
        }

        const { data: userProfile } = await supabase
          .from('profiles')
          .select('name, avatar_url')
          .eq('id', user.id)
          .maybeSingle();

        if (userProfile) {
          setUserName(userProfile.name || 'Moto-Taxista');
          setAvatarUrl(userProfile.avatar_url || undefined);
        }
      } catch (error) {
        console.error('Erro ao buscar perfil mototaxi:', error);
      }
    };

    fetchProfileData();
  }, [user?.id, location.pathname]);

  return (
    <div className="min-h-screen bg-motoboy-surface flex flex-col">
      <MotoboyPanelHeader
        avatarUrl={avatarUrl}
        userName={userName}
        city={city}
        state={state}
        isOnline={isOnline}
      />

      <main className="flex-1 flex flex-col">
        <div className="px-3 pt-2">
          <WeatherEventsCard city={city || undefined} state={state || undefined} />
        </div>
        <Outlet />
      </main>

      {/* Espaçador para nav fixa */}
      <div className="h-20" />
      <MototaxiBottomNav />
    </div>
  );
}
