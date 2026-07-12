import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MotoboyPanelHeader } from '@/components/motoboy/MotoboyPanelHeader';
import MotoboyBottomNav from '@/components/motoboy/MotoboyBottomNav';
import { MotoboyFooter } from '@/components/motoboy/MotoboyFooter';
import { WeatherEventsCard } from '@/components/motoboy/WeatherEventsCard';
import { CentralImpulsionamentoBanner } from '@/components/ridv/CentralImpulsionamentoBanner';

export function MotoboyLayout() {
  const { user, refreshProfiles } = useAuth();
  const location = useLocation();

  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [userName, setUserName] = useState('Motoboy');
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
          setUserName(userProfile.name || 'Motoboy');
          setAvatarUrl(userProfile.avatar_url || undefined);
        }
      } catch (error) {
        console.error('Erro ao buscar perfil:', error);
      }
    };

    fetchProfileData();
  }, [user?.id, location.pathname]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #F0F2F5 0%, #E8ECF0 40%, #F5F7FA 100%)',
      }}
    >
      <MotoboyPanelHeader
        avatarUrl={avatarUrl}
        userName={userName}
        city={city}
        state={state}
        isOnline={isOnline}
      />

      <main className="flex-1 flex flex-col">
        {/* Gradiente de transição header → conteúdo */}
        <div
          className="h-3 shrink-0"
          style={{
            background: 'linear-gradient(180deg, hsl(25 100% 50% / 0.08), transparent)',
          }}
        />
        <div className="px-4 pb-3">
          <WeatherEventsCard city={city || undefined} state={state || undefined} />
        </div>
        
        <CentralImpulsionamentoBanner />

        <Outlet />
      </main>

      <MotoboyFooter />

      {/* Spacer for fixed bottom nav */}
      <div className="h-20" />
      <MotoboyBottomNav />
    </div>
  );
}
