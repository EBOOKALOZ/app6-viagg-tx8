import { Bell, CheckCircle2, XCircle, Clock, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useDeliveryHistoryBell, DeliveryNotification } from '@/hooks/useDeliveryHistoryBell';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function statusConfig(status: string) {
  const s = status?.toLowerCase();
  if (s === 'completed' || s === 'concluida' || s === 'finalizada') {
    return { label: 'Concluída', icon: CheckCircle2, className: 'text-green-500' };
  }
  if (s === 'cancelled' || s === 'cancelada' || s === 'canceled') {
    return { label: 'Cancelada', icon: XCircle, className: 'text-destructive' };
  }
  return { label: 'Expirada', icon: Clock, className: 'text-muted-foreground' };
}

function NotificationItem({ item }: { item: DeliveryNotification }) {
  const config = statusConfig(item.status);
  const StatusIcon = config.icon;
  const dateStr = item.finalizada_em || item.created_at;

  return (
    <div className={cn(
      "flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-b-0 transition-opacity",
      item.isRead ? "opacity-50" : "opacity-100 bg-accent/5"
    )}>
      <StatusIcon className={cn('h-5 w-5 mt-0.5 shrink-0', config.className)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "text-sm truncate",
            item.isRead ? "font-normal text-muted-foreground" : "font-semibold text-foreground"
          )}>
            Corrida finalizada
          </span>
          <Badge variant="outline" className={cn('text-[10px] shrink-0', config.className)}>
            {config.label}
          </Badge>
        </div>
        {item.loja_nome && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {item.loja_nome}
          </p>
        )}
        {dateStr && (
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            {format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        )}
      </div>
    </div>
  );
}

export function DeliveryHistoryBell() {
  const { newCount, shouldAnimate, markAsSeen, recentNotifications } = useDeliveryHistoryBell();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    markAsSeen();
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate('/motoboy/archived');
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpen}
        className="relative"
        title="Notificações"
      >
        <Bell
          className={cn(
            'h-5 w-5 transition-transform',
            shouldAnimate && 'animate-bounce text-primary'
          )}
        />
        {newCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-xs font-bold">
            {newCount > 99 ? '99+' : newCount}
          </Badge>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[340px] sm:w-[380px] p-0 flex flex-col">
          <SheetHeader className="px-4 pt-5 pb-3 border-b border-border">
            <SheetTitle className="text-base font-semibold">Notificações</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {recentNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">Nenhuma notificação recente</p>
              </div>
            ) : (
              recentNotifications.map((item) => (
                <NotificationItem key={item.id} item={item} />
              ))
            )}
          </div>

          {recentNotifications.length > 0 && (
            <div className="border-t border-border p-3">
              <Button
                variant="ghost"
                className="w-full justify-between text-sm text-primary"
                onClick={handleViewAll}
              >
                Ver todas as corridas
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
