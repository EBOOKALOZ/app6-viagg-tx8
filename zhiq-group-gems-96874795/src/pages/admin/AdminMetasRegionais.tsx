import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function AdminMetasRegionais() {
  const { data: targets, isLoading } = useQuery({
    queryKey: ['admin-region-targets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expansion_region_targets')
        .select('*')
        .eq('is_active', true)
        .order('region_id');
      if (error) throw error;
      return data;
    },
    staleTime: 30000,
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Target className="h-8 w-8 text-primary" />
          Metas Regionais
        </h1>
        <p className="text-muted-foreground text-sm">
          Metas de expansão definidas por região
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Card key={i}><CardContent className="pt-6"><Skeleton className="h-24 w-full" /></CardContent></Card>)
        ) : targets && targets.length > 0 ? (
          targets.map((t) => (
            <Card key={t.id} className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  {t.region_id}
                  <Badge variant="default">Ativa</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Grupos Ativos</span><span className="font-bold">{t.target_active_groups}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Autorizados</span><span className="font-bold">{t.target_authorized_groups}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Envios/Semana</span><span className="font-bold">{t.target_sent_per_week}</span></div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <Target className="h-12 w-12 mb-4 mx-auto opacity-50" />
            <p>Nenhuma meta regional definida</p>
          </div>
        )}
      </div>
    </div>
  );
}
