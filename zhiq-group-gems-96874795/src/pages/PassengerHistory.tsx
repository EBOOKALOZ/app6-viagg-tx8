import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { UserAvatar } from '@/components/UserAvatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRideHistory } from '@/hooks/useRideHistory';
import { RideHistoryCard } from '@/components/ride/RideHistoryCard';
import BottomNav from '@/components/passenger/BottomNav';


export default function PassengerHistory() {
  const navigate = useNavigate();
  
  const { history, isLoading, refresh } = useRideHistory({
    role: 'passenger',
    limit: 20,
  });

  // Handler para navegação via BottomNav
  const handleTabChange = (tab: string) => {
    if (tab === 'Início') {
      navigate('/passenger');
      return;
    }
    if (tab === 'Perfil') {
      navigate('/profile');
      return;
    }
    // Histórico - já estamos aqui, não fazer nada
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/passenger')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={refresh}>
              <RefreshCw className="h-5 w-5" />
            </Button>
            <UserAvatar size="sm" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 space-y-4">
        <h1 className="text-xl font-bold">Minhas Corridas</h1>

        {/* Loading State */}
        {isLoading && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        )}

        {/* History */}
        {!isLoading && (
          <RideHistoryCard 
            items={history}
            role="passenger"
            title="Histórico de Corridas"
            emptyMessage="Você ainda não realizou corridas."
            maxItems={20}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNav activeTab="Histórico" onTabChange={handleTabChange} />
    </div>
  );
}
