import { useMototaxiHistory } from '@/hooks/useMototaxiHistory';
import { MototaxiRideHistoryCard } from '@/components/motoboy/MototaxiRideHistoryCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';
import { Clock } from 'lucide-react';

/**
 * Motoboy History Content - renderiza dentro do MotoboyLayout
 */
export default function MotoboyHistoryContent() {
  const {
    history,
    currentPage,
    totalPages,
    totalEarnings,
    isLoading,
    goToPage,
  } = useMototaxiHistory();

  if (isLoading) {
    return (
      <MotoboyPageTemplate title="Histórico Completo" icon={Clock}>
        <Card className="bg-card">
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </MotoboyPageTemplate>
    );
  }

  return (
    <MotoboyPageTemplate title="Histórico Completo" icon={Clock}>
      <MototaxiRideHistoryCard 
        items={history}
        currentPage={currentPage}
        totalPages={totalPages}
        totalEarnings={totalEarnings}
        onPageChange={goToPage}
      />
    </MotoboyPageTemplate>
  );
}
