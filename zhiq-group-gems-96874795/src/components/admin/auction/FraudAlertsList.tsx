import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, CheckCircle2, Search, Filter, Ban, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function FraudAlertsList() {
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["auction-fraud-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auction_fraud_alerts")
        .select(`
          *,
          suspect:auth.users (
            email
          ),
          listing:auction_listings (
            title
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        // Fallback for demo if auth.users fails (since auth.users is restricted usually)
        const { data: fallbackData } = await supabase
          .from("auction_fraud_alerts")
          .select("*")
          .order("created_at", { ascending: false });
        return fallbackData || [];
      }
      return data;
    },
    refetchInterval: 10000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const { error } = await supabase
        .from("auction_fraud_alerts")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auction-fraud-alerts"] });
      toast.success("Status do alerta atualizado com sucesso");
    },
    onError: () => toast.error("Erro ao atualizar status"),
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-500/20 text-red-500 border-red-500/50';
      case 'HIGH': return 'bg-orange-500/20 text-orange-500 border-orange-500/50';
      case 'MEDIUM': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50';
      default: return 'bg-blue-500/20 text-blue-500 border-blue-500/50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'text-red-400';
      case 'INVESTIGATING': return 'text-yellow-400';
      case 'RESOLVED': return 'text-emerald-400';
      case 'BLOCKED': return 'text-gray-400';
      default: return 'text-white';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E98A3]" />
          <Input 
            placeholder="Buscar ocorrência..." 
            className="pl-10 bg-[#1A1F24] border-[#323A45] text-white"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" className="border-[#323A45] bg-[#1A1F24] text-white hover:bg-[#252B33]">
            <Filter className="w-4 h-4 mr-2" /> Filtros
          </Button>
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["auction-fraud-alerts"] })} variant="outline" className="border-[#323A45] bg-[#1A1F24] text-white hover:bg-[#252B33]">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[#323A45] bg-[#1A1F24] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-[#8E98A3] uppercase bg-[#252B33]">
              <tr>
                <th className="px-6 py-4">Alerta / IP</th>
                <th className="px-6 py-4">Severidade</th>
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#8E98A3]">Carregando alertas...</td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#8E98A3]">Nenhuma ocorrência registrada pela IA.</td>
                </tr>
              ) : alerts.map((alert) => (
                <tr key={alert.id} className="border-b border-[#323A45] hover:bg-[#252B33]/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-white flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-500" />
                      {alert.alert_type}
                    </p>
                    <p className="text-xs text-[#8E98A3] mt-1">{alert.ip_address || "IP Oculto"}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("px-2.5 py-1 rounded-full text-xs font-black border", getSeverityColor(alert.severity))}>
                      {alert.severity}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[#B8C2CC]">
                    {format(parseISO(alert.created_at), "dd/MM/yyyy HH:mm")}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("font-bold text-xs uppercase", getStatusColor(alert.status))}>
                      {alert.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    {alert.status === 'OPEN' && (
                      <Button size="sm" variant="outline" className="border-[#00C58E]/50 text-[#00C58E] hover:bg-[#00C58E]/10" onClick={() => updateStatus.mutate({ id: alert.id, status: 'INVESTIGATING' })}>
                        Investigar
                      </Button>
                    )}
                    {alert.status === 'INVESTIGATING' && (
                      <Button size="sm" variant="outline" className="border-[#00C58E]/50 text-[#00C58E] hover:bg-[#00C58E]/10" onClick={() => updateStatus.mutate({ id: alert.id, status: 'RESOLVED' })}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Resolver
                      </Button>
                    )}
                    {alert.status !== 'BLOCKED' && alert.status !== 'RESOLVED' && (
                      <Button size="sm" variant="outline" className="border-red-500/50 text-red-500 hover:bg-red-500/10" onClick={() => updateStatus.mutate({ id: alert.id, status: 'BLOCKED' })}>
                        <Ban className="w-4 h-4 mr-1" /> Bloquear
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
