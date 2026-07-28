import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { CardDark, CardInfo } from "@/components/ui/dark-card";
import { Bell, Mail, Smartphone, MessageSquare, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AdminNotificationsDashboard() {
  
  // Mtricas Globais
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-notifications-stats"],
    queryFn: async () => {
      // Usar a tabela de entregas (notification_deliveries) e a user_notifications
      const [
        { count: totalSent },
        { count: totalFailed },
        { count: totalEmails },
        { count: totalPush },
        { count: totalWpp }
      ] = await Promise.all([
        supabase.from('notification_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'SENT'),
        supabase.from('notification_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'FAILED'),
        supabase.from('notification_deliveries').select('id', { count: 'exact', head: true }).eq('channel', 'EMAIL'),
        supabase.from('notification_deliveries').select('id', { count: 'exact', head: true }).eq('channel', 'PUSH'),
        supabase.from('notification_deliveries').select('id', { count: 'exact', head: true }).eq('channel', 'WHATSAPP')
      ]);

      return {
        sent: totalSent || 0,
        failed: totalFailed || 0,
        emails: totalEmails || 0,
        push: totalPush || 0,
        wpp: totalWpp || 0,
      };
    }
  });

  // Fila Recente
  const { data: recentDeliveries, isLoading: loadingDeliveries } = useQuery({
    queryKey: ["admin-notifications-deliveries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_deliveries")
        .select(`
          *,
          user:user_id(email, first_name, last_name)
        `)
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data;
    }
  });

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Bell className="w-8 h-8 text-[#FF7A00]" />
            Central de Notificações
          </h1>
          <p className="text-[#8E98A3] mt-2 font-medium">Monitoramento do motor de disparos e performance da fila.</p>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardInfo
            icon={<CheckCircle2 className="w-6 h-6 text-[#00C58E]" />}
            label="Entregues (Total)"
            value={isLoading ? "..." : stats?.sent.toString()}
            valueClassName="text-[#00C58E]"
          />
          <CardInfo
            icon={<AlertTriangle className="w-6 h-6 text-red-500" />}
            label="Falhas na Entrega"
            value={isLoading ? "..." : stats?.failed.toString()}
            valueClassName="text-red-500"
          />
          <CardInfo
            icon={<Mail className="w-6 h-6 text-blue-500" />}
            label="E-mails na Fila"
            value={isLoading ? "..." : stats?.emails.toString()}
          />
          <CardInfo
            icon={<Smartphone className="w-6 h-6 text-[#FF7A00]" />}
            label="Push Tokens"
            value={isLoading ? "..." : stats?.push.toString()}
          />
        </div>

        {/* Deliveries Table */}
        <CardDark className="p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#8E98A3]" />
            Histórico de Disparos
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#323A45] text-[#8E98A3] text-sm">
                  <th className="py-3 px-4 font-bold">Data</th>
                  <th className="py-3 px-4 font-bold">Usuário</th>
                  <th className="py-3 px-4 font-bold">Canal</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#323A45]">
                {loadingDeliveries ? (
                  <tr><td colSpan={4} className="py-8 text-center text-[#8E98A3]">Carregando fila...</td></tr>
                ) : recentDeliveries?.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-[#8E98A3]">Nenhuma entrega registrada.</td></tr>
                ) : (
                  recentDeliveries?.map((deliv) => (
                    <tr key={deliv.id} className="text-white hover:bg-[#252B33]/50 transition-colors">
                      <td className="py-4 px-4 text-sm font-medium">
                        {deliv.created_at ? format(parseISO(deliv.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm font-bold">
                          {deliv.user?.first_name} {deliv.user?.last_name}
                        </div>
                        <div className="text-xs text-[#8E98A3]">{deliv.user?.email}</div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="bg-[#323A45] px-2 py-1 rounded text-xs font-bold text-[#B8C2CC]">
                          {deliv.channel}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          deliv.status === 'SENT' ? 'bg-[#00C58E]/10 text-[#00C58E]' : 
                          deliv.status === 'FAILED' ? 'bg-red-500/10 text-red-500' : 
                          'bg-yellow-500/10 text-yellow-500'
                        }`}>
                          {deliv.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardDark>

      </div>
    </AdminLayout>
  );
}
