import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { TrendingUp, Zap, Target, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface GrowthTarget {
  motoboy_id: string;
  commission_percent: number;
  active_groups: number;
  groups_missing: number;
  potential_savings: number;
  sent_7d?: number;
  errors_7d?: number;
  pressure_tier?: string;
  aggressive_mode?: string;
}

function useGrowthActionQueue(minCommission: number) {
  return useQuery({
    queryKey: ['admin-growth-action-queue', minCommission],
    queryFn: async () => {
      let query = supabase
        .from('v_admin_growth_action_queue')
        .select('*')
        .order('potential_savings', { ascending: false })
        .limit(100);
      if (minCommission > 0) {
        query = query.gte('commission_percent', minCommission);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as GrowthTarget[];
    },
    staleTime: 30000,
  });
}

function useAggressiveTargets() {
  return useQuery({
    queryKey: ['admin-aggressive-targets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_admin_aggressive_targets')
        .select('*')
        .order('potential_savings', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as GrowthTarget[];
    },
    staleTime: 30000,
  });
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function getPressureTierBadge(tier: string | undefined) {
  if (!tier) return null;
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', label: string }> = {
    'high': { variant: 'destructive', label: '🔴 Alto' },
    'medium': { variant: 'secondary', label: '🟡 Médio' },
    'low': { variant: 'outline', label: '🟢 Baixo' },
  };
  const tierConfig = config[tier.toLowerCase()] || { variant: 'outline' as const, label: tier };
  return <Badge variant={tierConfig.variant}>{tierConfig.label}</Badge>;
}

export default function AdminCentroCrescimento() {
  const [minCommissionFilter, setMinCommissionFilter] = useState<string>('0');
  const { data: actionQueue, isLoading: queueLoading } = useGrowthActionQueue(Number(minCommissionFilter));
  const { data: aggressiveTargets, isLoading: targetsLoading } = useAggressiveTargets();

  const handleActivateAggressive = async (motoboyId: string) => {
    toast.info(`Modo agressivo ativado para ${motoboyId.slice(0, 8)}...`);
  };

  const totalPotentialSavings = actionQueue?.reduce((sum, item) => sum + (item.potential_savings || 0), 0) || 0;
  const avgCommission = actionQueue?.length 
    ? actionQueue.reduce((sum, item) => sum + (item.commission_percent || 0), 0) / actionQueue.length 
    : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          🚀 Centro de Crescimento
        </h1>
        <p className="text-muted-foreground">
          Gestão estratégica de motoboys e ativação de crescimento
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-emerald-600/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Economia Potencial Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{formatCurrency(totalPotentialSavings)}</div>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-blue-600/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Comissão Média
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{avgCommission.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-orange-600/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Alvos Agressivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{aggressiveTargets?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Fila de Ação de Crescimento</CardTitle>
              <CardDescription>Motoboys ordenados por economia potencial</CardDescription>
            </div>
            <Select value={minCommissionFilter} onValueChange={setMinCommissionFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar comissão" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Todas comissões</SelectItem>
                <SelectItem value="20">≥ 20%</SelectItem>
                <SelectItem value="28">≥ 28%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {queueLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : actionQueue && actionQueue.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Motoboy ID</TableHead>
                    <TableHead className="text-center">Comissão</TableHead>
                    <TableHead className="text-center">Grupos Ativos</TableHead>
                    <TableHead className="text-center">Faltam</TableHead>
                    <TableHead className="text-center">Economia Potencial</TableHead>
                    <TableHead className="text-center">Tier Pressão</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actionQueue.map((item) => (
                    <TableRow key={item.motoboy_id}>
                      <TableCell className="font-mono text-xs">{item.motoboy_id.slice(0, 8)}...</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={item.commission_percent > 20 ? 'destructive' : 'secondary'}>{item.commission_percent}%</Badge>
                      </TableCell>
                      <TableCell className="text-center">{item.active_groups}</TableCell>
                      <TableCell className="text-center">
                        <span className={item.groups_missing > 0 ? 'text-orange-500 font-medium' : 'text-green-500'}>{item.groups_missing}</span>
                      </TableCell>
                      <TableCell className="text-center font-medium text-emerald-600">{formatCurrency(item.potential_savings)}</TableCell>
                      <TableCell className="text-center">{getPressureTierBadge(item.pressure_tier)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => handleActivateAggressive(item.motoboy_id)}>
                          <Zap className="h-3 w-3 mr-1" />Ativar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
              <p>Nenhum motoboy encontrado com os filtros atuais</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg border-red-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-red-500" />
            Alvos de Modo Agressivo
          </CardTitle>
          <CardDescription>Motoboys com maior potencial para conversão via pressão</CardDescription>
        </CardHeader>
        <CardContent>
          {targetsLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : aggressiveTargets && aggressiveTargets.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Motoboy ID</TableHead>
                    <TableHead className="text-center">Comissão</TableHead>
                    <TableHead className="text-center">Grupos Ativos</TableHead>
                    <TableHead className="text-center">Faltam</TableHead>
                    <TableHead className="text-center">Economia Potencial</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggressiveTargets.map((item) => (
                    <TableRow key={item.motoboy_id}>
                      <TableCell className="font-mono text-xs">{item.motoboy_id.slice(0, 8)}...</TableCell>
                      <TableCell className="text-center"><Badge variant="destructive">{item.commission_percent}%</Badge></TableCell>
                      <TableCell className="text-center">{item.active_groups}</TableCell>
                      <TableCell className="text-center text-orange-500 font-medium">{item.groups_missing}</TableCell>
                      <TableCell className="text-center font-medium text-emerald-600">{formatCurrency(item.potential_savings)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={item.aggressive_mode === 'active' ? 'destructive' : 'outline'}>{item.aggressive_mode || 'Inativo'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <p>Nenhum alvo agressivo identificado</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
