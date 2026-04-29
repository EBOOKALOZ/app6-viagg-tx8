import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Search, MapPin, AlertTriangle, CheckCircle, Clock, Shield, Flame, TrendingDown } from "lucide-react";
import { OperationalMap } from "@/components/map";

interface WarRoomCity {
  region_id: string;
  city_id: string;
  total_groups?: number;
  active_groups: number;
  authorized_groups: number;
  pending_groups?: number;
  eligible_now: number;
  sent_7d: number;
  errors_7d: number;
  removed_7d?: number;
}

function useWarRoomData() {
  return useQuery({
    queryKey: ['admin-war-room-city'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_admin_war_room_city')
        .select('*')
        .order('eligible_now', { ascending: false });
      if (error) throw error;
      return data as WarRoomCity[];
    },
    staleTime: 30000,
  });
}

function getHealthStatus(city: WarRoomCity): { label: string; color: string; icon: React.ElementType } {
  if (city.errors_7d > 10) return { label: 'Crítico', color: 'text-red-500', icon: AlertTriangle };
  if (city.active_groups === 0) return { label: 'Fraco', color: 'text-amber-500', icon: TrendingDown };
  if (city.eligible_now > 20) return { label: 'Atenção', color: 'text-amber-500', icon: Clock };
  if (city.authorized_groups > 0 && city.active_groups > 2) return { label: 'Forte', color: 'text-emerald-500', icon: Shield };
  return { label: 'Estável', color: 'text-blue-500', icon: CheckCircle };
}

export default function AdminWarRoom() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: warRoomData, isLoading } = useWarRoomData();

  const filteredData = useMemo(() => {
    const data = warRoomData || [];
    if (!searchQuery) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(c => c.city_id?.toLowerCase().includes(q) || c.region_id?.toLowerCase().includes(q));
  }, [warRoomData, searchQuery]);

  const totalCities = filteredData.length;
  const criticalCount = filteredData.filter(c => c.errors_7d > 10).length;
  const weakCount = filteredData.filter(c => c.active_groups === 0).length;
  const strongCount = filteredData.filter(c => c.active_groups > 2 && c.authorized_groups > 0).length;
  const totalEligible = filteredData.reduce((sum, c) => sum + (c.eligible_now || 0), 0);
  const totalErrors = filteredData.reduce((sum, c) => sum + (c.errors_7d || 0), 0);

  const summaryCards = [
    { title: 'Cidades Monitoradas', value: totalCities, icon: MapPin, color: 'blue' },
    { title: 'Regiões Fortes', value: strongCount, icon: Shield, color: 'emerald' },
    { title: 'Regiões Fracas', value: weakCount, icon: TrendingDown, color: 'amber' },
    { title: 'Regiões Críticas', value: criticalCount, icon: Flame, color: 'red' },
    { title: 'Elegíveis Total', value: totalEligible, icon: Clock, color: 'purple' },
    { title: 'Erros 7d', value: totalErrors, icon: AlertTriangle, color: 'red' },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          ⚔️ War Room Nacional
        </h1>
        <p className="text-muted-foreground text-sm">
          Central de controle e monitoramento territorial em tempo real
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((card) => (
          <Card key={card.title} className={`shadow-lg border-${card.color}-500/20 bg-gradient-to-br from-${card.color}-500/5 to-${card.color}-600/10`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <card.icon className={`h-5 w-5 text-${card.color}-500`} />
              <span className={`text-2xl font-bold text-${card.color}-600`}>{card.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health Indicators */}
      {!isLoading && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-500" />
                Saúde Nacional
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className={`h-4 w-4 rounded-full ${criticalCount > 0 ? 'bg-red-500' : weakCount > 3 ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`} />
                <span className="text-lg font-bold">
                  {criticalCount > 0 ? 'CRÍTICO' : weakCount > 3 ? 'ATENÇÃO' : 'SAUDÁVEL'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Score Territorial Médio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {totalCities > 0 ? ((strongCount / totalCities) * 100).toFixed(0) : 0}%
              </div>
              <p className="text-xs text-muted-foreground">regiões fortes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Taxa de Erro</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${totalErrors > 50 ? 'text-red-500' : 'text-foreground'}`}>
                {totalErrors}
              </div>
              <p className="text-xs text-muted-foreground">erros nos últimos 7 dias</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Operational Map */}
      <Card className="shadow-lg mt-6 mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Mapa Operacional de Entregas (Nacional)
          </CardTitle>
          <CardDescription>Visualização em tempo real de lojas, entregadores e rotas em andamento.</CardDescription>
        </CardHeader>
        <CardContent>
          <OperationalMap className="h-[550px]" />
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Mapa de Batalha por Cidade
              </CardTitle>
              <CardDescription>Ordenado por prioridade • Indicadores de risco visual</CardDescription>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar cidade ou região..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filteredData.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-8">Saúde</TableHead>
                    <TableHead>Região</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead className="text-center">Ativos</TableHead>
                    <TableHead className="text-center">Autorizados</TableHead>
                    <TableHead className="text-center">Elegíveis</TableHead>
                    <TableHead className="text-center">Enviados 7d</TableHead>
                    <TableHead className="text-center">Erros 7d</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((city, idx) => {
                    const health = getHealthStatus(city);
                    return (
                      <TableRow key={`${city.region_id}-${city.city_id}-${idx}`} className={city.errors_7d > 10 ? 'bg-red-500/5' : ''}>
                        <TableCell><health.icon className={`h-4 w-4 ${health.color}`} /></TableCell>
                        <TableCell className="font-medium">{city.region_id}</TableCell>
                        <TableCell>{city.city_id}</TableCell>
                        <TableCell className="text-center"><span className="text-emerald-600 font-medium">{city.active_groups}</span></TableCell>
                        <TableCell className="text-center">{city.authorized_groups}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={city.eligible_now > 10 ? 'secondary' : 'outline'}>{city.eligible_now}</Badge>
                        </TableCell>
                        <TableCell className="text-center">{city.sent_7d}</TableCell>
                        <TableCell className="text-center">
                          <span className={city.errors_7d > 5 ? 'text-red-500 font-medium' : ''}>{city.errors_7d}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={health.label === 'Crítico' ? 'destructive' : health.label === 'Forte' ? 'default' : 'outline'} className="text-xs">
                            {health.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MapPin className="h-12 w-12 mb-4 opacity-50" />
              <p>Nenhuma cidade encontrada</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
