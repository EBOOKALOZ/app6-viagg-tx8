import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Check, Trash2 } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { NotificationPreferencesModal } from "./NotificationPreferencesModal";

export function NotificationCenter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  // Buscar notificações
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["user-notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30); // Paginação / Limite
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Inscrever para atualizações em tempo real
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('public:user_notifications')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'user_notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["user-notifications", user.id] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("user_notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-notifications", user?.id] }),
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      await supabase.from("user_notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("user_id", user!.id).eq("is_read", false);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-notifications", user?.id] }),
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const getSeverityStyle = (severity: string) => {
    switch(severity) {
      case 'CRITICAL': return 'bg-red-500/10 border-l-4 border-red-500';
      case 'HIGH': return 'bg-orange-500/10 border-l-4 border-orange-500';
      case 'MEDIUM': return 'bg-blue-500/10 border-l-4 border-blue-500';
      default: return 'bg-[#252B33] border-l-4 border-[#323A45]';
    }
  };

  if (!user) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-white/10 transition-colors">
          <Bell className="w-5 h-5 text-white" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-[#1B1F24]" />
          )}
        </button>
      </PopoverTrigger>
      
      <PopoverContent align="end" className="w-[380px] p-0 bg-[#1A1F24] border-[#323A45] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[#323A45] bg-[#15181C]">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-white text-lg">Notificações</h3>
            {unreadCount > 0 && (
              <span className="bg-[#FF7A00] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount} novas
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button 
                onClick={() => markAllAsRead.mutate()}
                className="p-2 hover:bg-[#252B33] rounded-lg transition-colors text-[#8E98A3] hover:text-[#00C58E]"
                title="Marcar todas como lidas"
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            <NotificationPreferencesModal />
          </div>
        </div>

        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="p-8 text-center text-[#8E98A3] text-sm font-bold">Carregando...</div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-[#8E98A3] flex flex-col items-center">
              <Bell className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-bold">Nenhuma notificação</p>
              <p className="text-xs font-medium mt-1">Você está em dia com seus avisos.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#323A45]/50">
              {notifications.map((notif) => (
                <div 
                  key={notif.id} 
                  className={cn(
                    "p-4 transition-colors hover:bg-[#252B33] cursor-pointer",
                    getSeverityStyle(notif.severity || 'LOW'),
                    notif.is_read ? 'opacity-60' : 'opacity-100'
                  )}
                  onClick={() => {
                    if (!notif.is_read) markAsRead.mutate(notif.id);
                    // Aqui poderia redirecionar baseado no reference_type
                  }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-white text-sm leading-tight">{notif.title}</h4>
                    <span className="text-[10px] text-[#8E98A3] whitespace-nowrap ml-2">
                      {notif.created_at ? formatDistanceToNow(parseISO(notif.created_at), { addSuffix: true, locale: ptBR }) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-[#B8C2CC] leading-relaxed mb-2">{notif.message}</p>
                  
                  {/* Se tiver sido agrupada pela IA */}
                  {notif.metadata && typeof notif.metadata === 'object' && (notif.metadata as any).grouped_count > 1 && (
                    <span className="inline-block bg-white/10 text-[#8E98A3] text-[10px] font-bold px-2 py-0.5 rounded-full">
                      +{(notif.metadata as any).grouped_count - 1} eventos similares
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        
        <div className="p-3 bg-[#15181C] border-t border-[#323A45] text-center">
          <button className="text-xs font-bold text-[#FF7A00] hover:text-white transition-colors">
            Ver todo o histórico
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
