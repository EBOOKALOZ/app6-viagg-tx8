import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { UserAvatar } from '@/components/UserAvatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRideHistory } from '@/hooks/useRideHistory';
import { RideHistoryCard } from '@/components/ride/RideHistoryCard';

export default function MototaxiHistory() {
  const navigate = useNavigate();
  
  const { history, isLoading, refresh } = useRideHistory({
    role: 'mototaxi',
    limit: 20,
  });

  // Calcular totais
  const completedRides = history.filter(r => r.status === 'finalizada');
  const totalEarnings = completedRides.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
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

        {/* Summary Cards — só exibe se há corridas */}
        {!isLoading && completedRides.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Corridas Realizadas</p>
                <p className="text-2xl font-bold text-primary">{completedRides.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Recebido</p>
                <p className="text-2xl font-bold text-green-600">R$ {totalEarnings.toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>
        )}

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
            role="mototaxi"
            title="Histórico de Corridas"
            emptyMessage="Você ainda não realizou corridas."
            maxItems={20}
          />
        )}
      </main>
    </div>
  );
}
