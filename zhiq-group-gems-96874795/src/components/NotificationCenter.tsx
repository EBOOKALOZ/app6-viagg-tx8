import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Check, CheckCheck, Loader2, Inbox,
  Package, AlertTriangle, CheckCircle, XCircle, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useNotifications, UserNotification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface NotificationCenterProps {
  className?: string;
  iconClassName?: string;
  sourceModule?: string;
  profileType?: string;
}

// ═══════════════════════════════════════
// SEVERITY CONFIG
// ═══════════════════════════════════════

function getSeverityConfig(severity?: string) {
  switch (severity) {
    case 'success':
      return {
        icon: <CheckCircle className="h-4 w-4" />,
        color: 'text-emerald-500',
        bg: 'bg-emerald-500/8',
        border: 'border-emerald-500/15',
        dot: 'bg-emerald-500',
      };
    case 'warning':
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        color: 'text-amber-500',
        bg: 'bg-amber-500/8',
        border: 'border-amber-500/15',
        dot: 'bg-amber-500',
      };
    case 'error':
      return {
        icon: <XCircle className="h-4 w-4" />,
        color: 'text-rose-500',
        bg: 'bg-rose-500/8',
        border: 'border-rose-500/15',
        dot: 'bg-rose-500',
      };
    default:
      return {
        icon: <Info className="h-4 w-4" />,
        color: 'text-sky-500',
        bg: 'bg-sky-500/8',
        border: 'border-sky-500/15',
        dot: 'bg-sky-500',
      };
  }
}

function getModuleIcon(type?: string) {
  switch (type) {
    case 'postador': return '📦';
    case 'delivery': return '🏍️';
    case 'payment':  return '💰';
    case 'promo':    return '🎁';
    default:         return '🔔';
  }
}

// ═══════════════════════════════════════
// NOTIFICATION ITEM
// ═══════════════════════════════════════

function NotificationItem({
  notification,
  onMarkAsRead,
  onNavigate,
}: {
  notification: UserNotification;
  onMarkAsRead: (id: string) => void;
  onNavigate: (n: UserNotification) => void;
}) {
  const severity = getSeverityConfig(notification.severity);
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  const handleClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
    onNavigate(notification);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full text-left p-4 border-b transition-all',
        'hover:bg-accent/50 active:scale-[0.99]',
        !notification.is_read
          ? cn(severity.bg, severity.border, 'border-l-2')
          : 'border-border/30 opacity-60'
      )}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          severity.bg
        )}>
          <span className={severity.color}>{severity.icon}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className={cn(
              'text-sm truncate leading-tight',
              !notification.is_read ? 'font-bold text-foreground' : 'font-medium text-muted-foreground'
            )}>
              {notification.title}
            </h4>
            {!notification.is_read && (
              <span className={cn('h-2 w-2 rounded-full shrink-0 mt-1.5 animate-pulse', severity.dot)} />
            )}
          </div>
          <p className={cn(
            'text-xs mt-0.5 line-clamp-2 leading-relaxed',
            !notification.is_read ? 'text-muted-foreground' : 'text-muted-foreground/60'
          )}>
            {notification.message}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-muted-foreground/50">
              {timeAgo}
            </span>
            {notification.source_module && notification.source_module !== 'system' && (
              <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-border/30">
                {notification.source_module}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════
// NOTIFICATION CENTER — BELL + DRAWER
// ═══════════════════════════════════════

export function NotificationCenter({
  className,
  iconClassName,
  sourceModule,
  profileType,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useNotifications({
    sourceModule,
    profileType,
  });

  // Navigate based on reference_type
  const handleNavigate = (n: UserNotification) => {
    if (n.reference_type === 'lot') {
      setIsOpen(false);
      navigate('/motoboy/postador');
    } else if (n.reference_type === 'campaign') {
      setIsOpen(false);
      navigate('/motoboy/campanhas');
    }
    // Outros tipos: apenas fecha o drawer
  };

  return (
    <>
      {/* Bell Button with Badge */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className={cn('relative', className)}
      >
        <Bell className={cn(
          'h-5 w-5 transition-all',
          unreadCount > 0 && 'text-primary animate-bounce',
          iconClassName
        )} />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] p-0 flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold shadow-lg">
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Notification Drawer */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-96 p-0 flex flex-col"
          style={{
            background: 'linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)',
          }}
        >
          <SheetHeader className="p-4 border-b" style={{ background: 'rgba(26,31,43,0.6)', borderColor: 'rgba(255,228,225,0.08)' }}>
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-foreground">
                <Bell className="h-5 w-5 text-primary" />
                Notificações
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-primary/15 text-primary text-[10px] font-black">
                    {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                  </Badge>
                )}
              </SheetTitle>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-xs text-primary hover:text-primary h-8"
                >
                  <CheckCheck className="h-4 w-4 mr-1" />
                  Ler todas
                </Button>
              )}
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-3 text-primary/40" />
                <p className="text-sm font-medium">Carregando...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
                  <Inbox className="h-8 w-8 opacity-30" />
                </div>
                <p className="text-sm font-bold">Nenhuma notificação</p>
                <p className="text-xs mt-1 text-muted-foreground/60">Você está em dia!</p>
              </div>
            ) : (
              <div>
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t text-center" style={{ borderColor: 'rgba(255,228,225,0.08)' }}>
              <p className="text-[10px] text-muted-foreground/50 font-medium">
                Mostrando as últimas {notifications.length} notificações
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

export default NotificationCenter;
