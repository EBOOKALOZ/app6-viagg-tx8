/**
 * MerchantRecentEvents — "Eventos recentes" block for each merchant page section.
 *
 * Drop this component at the top of any merchant page to show the latest
 * notifications for that module. Auto-marks them as read on mount.
 */
import { useEffect } from 'react';
import {
  CheckCircle, AlertTriangle, XCircle, Info, Clock, Sparkles,
} from 'lucide-react';
import { useMerchantNotificationBadges } from '@/hooks/useMerchantNotificationBadges';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MerchantRecentEventsProps {
  module: string;
  limit?: number;
}

function getSeverityStyle(severity?: string) {
  switch (severity) {
    case 'success':
      return {
        icon: <CheckCircle className="h-4 w-4" />,
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
      };
    case 'warning':
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        color: 'text-amber-600',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
      };
    case 'error':
      return {
        icon: <XCircle className="h-4 w-4" />,
        color: 'text-rose-600',
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        dot: 'bg-rose-500',
      };
    default:
      return {
        icon: <Info className="h-4 w-4" />,
        color: 'text-sky-600',
        bg: 'bg-sky-50',
        border: 'border-sky-200',
        dot: 'bg-sky-500',
      };
  }
}

export function MerchantRecentEvents({ module, limit = 5 }: MerchantRecentEventsProps) {
  const { recentByModule, markSectionAsRead } = useMerchantNotificationBadges();
  const events = recentByModule(module, limit);

  // Auto-mark as read when this section mounts
  useEffect(() => {
    markSectionAsRead(module);
  }, [module]); // eslint-disable-line react-hooks/exhaustive-deps

  if (events.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2.5 px-1">
        <Sparkles className="h-4 w-4 text-merchant" />
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Eventos recentes
        </h3>
      </div>

      <div className="space-y-2">
        {events.map((event) => {
          const style = getSeverityStyle(event.severity);
          const timeAgo = formatDistanceToNow(new Date(event.created_at), {
            addSuffix: true,
            locale: ptBR,
          });

          return (
            <div
              key={event.id}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${style.bg} ${style.border} ${
                !event.is_read ? 'shadow-sm' : 'opacity-75'
              }`}
            >
              {/* Severity Icon */}
              <div className={`mt-0.5 shrink-0 ${style.color}`}>
                {style.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold leading-tight ${!event.is_read ? 'text-gray-800' : 'text-gray-600'}`}>
                  {event.title}
                </p>
                {event.message && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                    {event.message}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Clock className="h-3 w-3 text-gray-400" />
                  <span className="text-[10px] text-gray-400 font-medium">
                    {timeAgo}
                  </span>
                  {!event.is_read && (
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot} animate-pulse`} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
