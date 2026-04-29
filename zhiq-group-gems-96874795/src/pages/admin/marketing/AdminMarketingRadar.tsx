import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RadarDashboardCard } from "@/components/admin/marketing/RadarDashboardCard";

export default function AdminMarketingRadar() {
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["painel-m-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_painel_m_dashboard" as any)
        .select("*")
        .order("indice_estrategico", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<any>;
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Radar Territorial</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[80vh] overflow-y-auto pr-1">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <RadarDashboardCard key={i} isLoading={true} />
          ))
        ) : dashboardData && dashboardData.length > 0 ? (
          dashboardData.map((item: any, i: number) => (
            <RadarDashboardCard key={i} data={item} isLoading={false} />
          ))
        ) : (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum dado de dashboard disponível
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
