import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DriverPanelHeader } from '@/components/driver/DriverPanelHeader';
import DriverBottomNav from '@/components/driver/DriverBottomNav';
import { OperationalWeatherCard } from '@/components/motoboy/OperationalWeatherCard';

export function DriverLayout() {
  const { user, refreshProfiles } = useAuth();
  const location = useLocation();

  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [userName, setUserName] = useState('Motorista');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    refreshProfiles();

    const fetchProfileData = async () => {
      try {
        const [{ data: userProfile }, { data: driverProfile }] = await Promise.all([
          supabase
            .from('profiles')
            .select('name, avatar_url')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('driver_profiles')
            .select('cidade, estado, is_online')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        if (userProfile) {
          setUserName(userProfile.name || 'Motorista');
          setAvatarUrl(userProfile.avatar_url || undefined);
        }
        if (driverProfile) {
          setCity(driverProfile.cidade || '');
          setState(driverProfile.estado || '');
          // Sempre online ao entrar no painel
          if (!driverProfile.is_online) {
            await supabase
              .from('driver_profiles')
              .update({ is_online: true })
              .eq('user_id', user.id);
          }
          setIsOnline(true);
        }
      } catch (error) {
        console.error('Erro ao buscar perfil driver:', error);
      }
    };

    fetchProfileData();
  }, [user?.id, location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DriverPanelHeader
        avatarUrl={avatarUrl}
        userName={userName}
        city={city}
        state={state}
        isOnline={isOnline}
      />

      <main className="flex-1 flex flex-col">
        <div className="px-3 pt-2">
          <OperationalWeatherCard city={city || undefined} state={state || undefined} />
        </div>
        <Outlet />
      </main>

      {/* Espaçador para a nav fixa */}
      <div className="h-20" />
      <DriverBottomNav />
    </div>
  );
}
