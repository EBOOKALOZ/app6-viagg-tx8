import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, Clock, MapPin } from "lucide-react";

export default function AdminFilaExpansao() {
  const { data: candidates, isLoading } = useQuery({
    queryKey: ['admin-queued-candidates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expansion_candidates')
        .select('*')
        .in('status', ['candidate', 'queued'])
        .order('score', { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 15000,
  });

  return (
    <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Layers className="h-8 w-8 text-amber-500" />
            Fila de Expansão
          </h1>
          <p className="text-muted-foreground text-sm">
            Regiões aguardando avaliação ou aprovação para ativação
          </p>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            [...Array(6)].map((_, i) => <Card key={i}><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>)
          ) : candidates && candidates.length > 0 ? (
            candidates.map((c) => (
              <Card key={c.candidate_id} className="shadow-md border-amber-500/20 hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      {c.region_id}
                    </span>
                    <Badge variant={c.status === 'queued' ? 'secondary' : 'outline'} className="text-xs">
                      {c.status === 'queued' ? '🟡 Na Fila' : '⚪ Candidato'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Score</span>
                    <span className="font-bold text-primary">{Number(c.score).toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Posts 7d</span>
                    <span className="font-medium">{c.posts_7d}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Dias ativos</span>
                    <span className="font-medium">{c.active_days_7d}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center py-16 text-muted-foreground">
              <Clock className="h-12 w-12 mb-4 opacity-50" />
              <p>Nenhum candidato na fila de expansão</p>
            </div>
          )}
        </div>
      </div>
  );
}
