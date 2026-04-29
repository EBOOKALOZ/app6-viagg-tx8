import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

function useRegionCoverage() {
  return useQuery({
    queryKey: ['admin-region-coverage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_admin_region_coverage')
        .select('*')
        .order('active_coverage_pct', { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 30000,
  });
}

function getHealthColor(pct: number): string {
  if (pct >= 70) return 'bg-emerald-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export function NacionalRegionRanking() {
  const { data: regions, isLoading } = useRegionCoverage();

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-5 w-5 text-amber-500" />
          Ranking Regiões por Cobertura
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {(regions || []).map((region, idx) => {
              const pct = Number(region.active_coverage_pct ?? 0);
              return (
                <div key={region.region_id} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-muted-foreground w-6 text-right">
                    {idx + 1}º
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold">{region.region_id}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {region.active_groups} ativos
                        </Badge>
                        <span className="text-xs font-medium text-muted-foreground">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getHealthColor(pct)}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {(!regions || regions.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma região cadastrada</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
