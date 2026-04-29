import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, CheckCircle, MapPin } from "lucide-react";
import { format } from "date-fns";

export default function AdminRegioesAtivas() {
  const { data: regions, isLoading } = useQuery({
    queryKey: ['admin-active-regions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('active_regions')
        .select('*')
        .order('activated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 30000,
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Activity className="h-8 w-8 text-emerald-500" />
          Regiões Ativas
        </h1>
        <p className="text-muted-foreground text-sm">
          Regiões que já foram ativadas no sistema de expansão
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          [...Array(6)].map((_, i) => <Card key={i}><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>)
        ) : regions && regions.length > 0 ? (
          regions.map((region) => (
            <Card key={region.region_id} className="shadow-md border-emerald-500/20 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    {region.region_id}
                  </span>
                  <Badge variant="default" className="bg-emerald-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {region.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Ativado em {format(new Date(region.activated_at), 'dd/MM/yyyy HH:mm')}
                </p>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center py-16 text-muted-foreground">
            <MapPin className="h-12 w-12 mb-4 opacity-50" />
            <p>Nenhuma região ativada ainda</p>
          </div>
        )}
      </div>
    </div>
  );
}
