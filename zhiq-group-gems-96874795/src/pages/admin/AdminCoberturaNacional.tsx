import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { Globe, Save, CheckCircle, AlertCircle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface RegionCoverage {
  region_id: string;
  active_groups: number;
  authorized_groups: number;
  sent_7d: number;
  target_active_groups: number;
  target_authorized_groups: number;
  target_sent_per_week: number;
  active_coverage_pct: number;
  authorized_coverage_pct: number;
  sent_coverage_pct: number;
}

interface EditableTargets {
  [regionId: string]: {
    target_active_groups: number;
    target_authorized_groups: number;
    target_sent_per_week: number;
  };
}

function useRegionCoverage() {
  return useQuery({
    queryKey: ['admin-region-coverage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_admin_region_coverage')
        .select('*')
        .order('region_id');

      if (error) throw error;
      return data as RegionCoverage[];
    },
    staleTime: 30000,
  });
}

function getCoverageColor(pct: number): string {
  if (pct >= 100) return 'text-green-600';
  if (pct >= 70) return 'text-yellow-600';
  if (pct >= 40) return 'text-orange-600';
  return 'text-red-600';
}

function getCoverageBadge(pct: number) {
  if (pct >= 100) {
    return <Badge className="bg-green-500">✓ Meta</Badge>;
  }
  if (pct >= 70) {
    return <Badge variant="secondary">🔄 Progresso</Badge>;
  }
  return <Badge variant="destructive">⚠️ Baixo</Badge>;
}

export default function AdminCoberturaNacional() {
  const queryClient = useQueryClient();
  const { data: regions, isLoading } = useRegionCoverage();
  const [editableTargets, setEditableTargets] = useState<EditableTargets>({});
  const [editingRegion, setEditingRegion] = useState<string | null>(null);

  const updateTargetMutation = useMutation({
    mutationFn: async ({ regionId, targets }: { regionId: string; targets: EditableTargets[string] }) => {
      const { error } = await supabase
        .from('expansion_region_targets')
        .update({
          target_active_groups: targets.target_active_groups,
          target_authorized_groups: targets.target_authorized_groups,
          target_sent_per_week: targets.target_sent_per_week,
          updated_at: new Date().toISOString(),
        })
        .eq('region_id', regionId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Metas atualizadas com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['admin-region-coverage'] });
      setEditingRegion(null);
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const handleEditStart = (region: RegionCoverage) => {
    setEditingRegion(region.region_id);
    setEditableTargets({
      ...editableTargets,
      [region.region_id]: {
        target_active_groups: region.target_active_groups,
        target_authorized_groups: region.target_authorized_groups,
        target_sent_per_week: region.target_sent_per_week,
      },
    });
  };

  const handleSave = (regionId: string) => {
    const targets = editableTargets[regionId];
    if (targets) {
      updateTargetMutation.mutate({ regionId, targets });
    }
  };

  const handleTargetChange = (regionId: string, field: keyof EditableTargets[string], value: number) => {
    setEditableTargets({
      ...editableTargets,
      [regionId]: {
        ...editableTargets[regionId],
        [field]: value,
      },
    });
  };

  // Summary
  const avgActiveCoverage = regions?.length
    ? regions.reduce((sum, r) => sum + (r.active_coverage_pct || 0), 0) / regions.length
    : 0;
  const avgAuthorizedCoverage = regions?.length
    ? regions.reduce((sum, r) => sum + (r.authorized_coverage_pct || 0), 0) / regions.length
    : 0;
  const regionsAtTarget = regions?.filter(r => r.active_coverage_pct >= 100).length || 0;

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            🗺️ Cobertura Nacional
          </h1>
          <p className="text-muted-foreground">
            Metas e cobertura por região — edite as metas diretamente
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-blue-600/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Regiões Monitoradas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {regions?.length || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-green-600/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Regiões na Meta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {regionsAtTarget}
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-emerald-600/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Cobertura Ativa Média
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getCoverageColor(avgActiveCoverage)}`}>
                {avgActiveCoverage.toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-purple-600/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Cobertura Autorizada Média
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getCoverageColor(avgAuthorizedCoverage)}`}>
                {avgAuthorizedCoverage.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Table */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Metas por Região</CardTitle>
            <CardDescription>
              Clique em uma linha para editar as metas. As alterações são salvas no banco.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : regions && regions.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Região</TableHead>
                      <TableHead className="text-center">Ativos</TableHead>
                      <TableHead className="text-center">Meta Ativos</TableHead>
                      <TableHead className="text-center">Cob. Ativa %</TableHead>
                      <TableHead className="text-center">Autorizados</TableHead>
                      <TableHead className="text-center">Meta Autor.</TableHead>
                      <TableHead className="text-center">Cob. Autor. %</TableHead>
                      <TableHead className="text-center">Enviados 7d</TableHead>
                      <TableHead className="text-center">Meta Envios</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {regions.map((region) => {
                      const isEditing = editingRegion === region.region_id;
                      const currentTargets = editableTargets[region.region_id] || {
                        target_active_groups: region.target_active_groups,
                        target_authorized_groups: region.target_authorized_groups,
                        target_sent_per_week: region.target_sent_per_week,
                      };

                      return (
                        <TableRow key={region.region_id} className={isEditing ? 'bg-blue-500/5' : ''}>
                          <TableCell className="font-medium">{region.region_id}</TableCell>
                          <TableCell className="text-center text-green-600 font-medium">
                            {region.active_groups}
                          </TableCell>
                          <TableCell className="text-center">
                            {isEditing ? (
                              <Input
                                type="number"
                                className="w-20 text-center"
                                value={currentTargets.target_active_groups}
                                onChange={(e) => handleTargetChange(region.region_id, 'target_active_groups', Number(e.target.value))}
                              />
                            ) : (
                              region.target_active_groups
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center gap-2">
                              <Progress value={Math.min(region.active_coverage_pct, 100)} className="w-16 h-2" />
                              <span className={getCoverageColor(region.active_coverage_pct)}>
                                {region.active_coverage_pct?.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{region.authorized_groups}</TableCell>
                          <TableCell className="text-center">
                            {isEditing ? (
                              <Input
                                type="number"
                                className="w-20 text-center"
                                value={currentTargets.target_authorized_groups}
                                onChange={(e) => handleTargetChange(region.region_id, 'target_authorized_groups', Number(e.target.value))}
                              />
                            ) : (
                              region.target_authorized_groups
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={getCoverageColor(region.authorized_coverage_pct)}>
                              {region.authorized_coverage_pct?.toFixed(0)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center">{region.sent_7d}</TableCell>
                          <TableCell className="text-center">
                            {isEditing ? (
                              <Input
                                type="number"
                                className="w-20 text-center"
                                value={currentTargets.target_sent_per_week}
                                onChange={(e) => handleTargetChange(region.region_id, 'target_sent_per_week', Number(e.target.value))}
                              />
                            ) : (
                              region.target_sent_per_week
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {getCoverageBadge(region.active_coverage_pct)}
                          </TableCell>
                          <TableCell className="text-right">
                            {isEditing ? (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  onClick={() => handleSave(region.region_id)}
                                  disabled={updateTargetMutation.isPending}
                                >
                                  <Save className="h-3 w-3 mr-1" />
                                  Salvar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingRegion(null)}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditStart(region)}
                              >
                                Editar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                <p>Nenhuma região encontrada</p>
                <p className="text-sm">Configure as metas de expansão para começar</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
