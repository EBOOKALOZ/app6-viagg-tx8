import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';
import { ArchivedRidesTable } from '@/components/motoboy/ArchivedRidesTable';
import { useArchivedRides } from '@/hooks/useArchivedRides';
import { useDeliveryHistoryBell } from '@/hooks/useDeliveryHistoryBell';
import { Archive } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useEffect } from 'react';

export default function MotoboyArchivedRidesContent() {
  const {
    rides,
    isLoading,
    statusFilter,
    setStatusFilter,
    currentPage,
    setCurrentPage,
    totalPages,
    totalCount,
  } = useArchivedRides();

  const { markAsSeen } = useDeliveryHistoryBell();

  // Mark as seen when visiting
  useEffect(() => {
    markAsSeen();
  }, [markAsSeen]);

  if (isLoading && rides.length === 0) {
    return (
      <MotoboyPageTemplate title="Corridas Arquivadas" icon={Archive}>
        <Card className="bg-card">
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </MotoboyPageTemplate>
    );
  }

  return (
    <MotoboyPageTemplate
      title="Corridas Arquivadas"
      subtitle={`${totalCount} registro${totalCount !== 1 ? 's' : ''}`}
      icon={Archive}
    >
      <ArchivedRidesTable
        rides={rides}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        isLoading={isLoading}
      />
    </MotoboyPageTemplate>
  );
}
