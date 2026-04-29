import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Search, Zap, CheckCircle, XCircle, Rocket, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Candidate {
  candidate_id: string;
  region_id: string;
  city_id: string | null;
  score: number;
  reason: string;
  status: string;
  first_detected_at: string;
  last_evaluated_at: string;
  posts_24h: number;
  posts_7d: number;
  active_days_7d: number;
  total_centavos_7d: number;
}

function useCandidates() {
  return useQuery({
    queryKey: ['admin-expansion-candidates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expansion_candidates')
        .select('*')
        .order('score', { ascending: false });
      if (error) throw error;
      return data as Candidate[];
    },
    staleTime: 15000,
  });
}

const statusConfig: Record<string, { label: string; color: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  candidate: { label: 'Candidato', color: 'text-muted-foreground', variant: 'outline' },
  queued: { label: 'Na Fila', color: 'text-amber-500', variant: 'secondary' },
  approved: { label: 'Aprovado', color: 'text-blue-500', variant: 'default' },
  implemented: { label: 'Implementado', color: 'text-emerald-500', variant: 'default' },
  rejected: { label: 'Rejeitado', color: 'text-red-500', variant: 'destructive' },
};

function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);
}

export default function AdminMotorTerritorial() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: candidates, isLoading } = useCandidates();
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('expansion_candidates')
        .update({ status, last_evaluated_at: new Date().toISOString() })
        .eq('candidate_id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-expansion-candidates'] });
      toast.success('Status atualizado');
    },
    onError: () => toast.error('Erro ao atualizar status'),
  });

  const filteredData = useMemo(() => {
    const data = candidates || [];
    if (!searchQuery) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(c => c.region_id?.toLowerCase().includes(q) || c.city_id?.toLowerCase().includes(q));
  }, [candidates, searchQuery]);

  const counts = useMemo(() => {
    const data = candidates || [];
    return {
      candidate: data.filter(c => c.status === 'candidate').length,
      queued: data.filter(c => c.status === 'queued').length,
      approved: data.filter(c => c.status === 'approved').length,
      implemented: data.filter(c => c.status === 'implemented').length,
    };
  }, [candidates]);

  return (
    <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            ⚡ Motor Territorial
          </h1>
          <p className="text-muted-foreground text-sm">
            Candidatos à expansão territorial — aprovação e implementação
          </p>
        </div>

        {/* Status Summary */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card className="shadow-md">
            <CardContent className="pt-4 flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{counts.candidate}</p>
                <p className="text-xs text-muted-foreground">Candidatos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-md border-amber-500/20">
            <CardContent className="pt-4 flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-amber-500" />
              <div>
                <p className="text-2xl font-bold">{counts.queued}</p>
                <p className="text-xs text-muted-foreground">Na Fila</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-md border-blue-500/20">
            <CardContent className="pt-4 flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              <div>
                <p className="text-2xl font-bold">{counts.approved}</p>
                <p className="text-xs text-muted-foreground">Aprovados</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-md border-emerald-500/20">
            <CardContent className="pt-4 flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <div>
                <p className="text-2xl font-bold">{counts.implemented}</p>
                <p className="text-xs text-muted-foreground">Implementados</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Table */}
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Candidatos à Expansão
                </CardTitle>
                <CardDescription>Ordenados por score de prioridade</CardDescription>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar região..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : filteredData.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Região</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                      <TableHead className="text-center">Posts 24h</TableHead>
                      <TableHead className="text-center">Posts 7d</TableHead>
                      <TableHead className="text-center">Dias Ativos</TableHead>
                      <TableHead className="text-center">Receita 7d</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((candidate) => {
                      const config = statusConfig[candidate.status] || statusConfig.candidate;
                      return (
                        <TableRow key={candidate.candidate_id}>
                          <TableCell className="font-medium">{candidate.region_id}</TableCell>
                          <TableCell>{candidate.city_id || '—'}</TableCell>
                          <TableCell className="text-center">
                            <span className="font-bold text-primary">{Number(candidate.score).toFixed(1)}</span>
                          </TableCell>
                          <TableCell className="text-center">{candidate.posts_24h}</TableCell>
                          <TableCell className="text-center">{candidate.posts_7d}</TableCell>
                          <TableCell className="text-center">{candidate.active_days_7d}</TableCell>
                          <TableCell className="text-center text-emerald-600 font-medium">
                            {formatCurrency(candidate.total_centavos_7d)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={config.variant} className="text-xs">{config.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {candidate.status !== 'approved' && candidate.status !== 'implemented' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                                  onClick={() => updateStatus.mutate({ id: candidate.candidate_id, status: 'approved' })}
                                  disabled={updateStatus.isPending}
                                >
                                  <CheckCircle className="h-3 w-3" />
                                  Aprovar
                                </Button>
                              )}
                              {candidate.status === 'approved' && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => updateStatus.mutate({ id: candidate.candidate_id, status: 'implemented' })}
                                  disabled={updateStatus.isPending}
                                >
                                  <Rocket className="h-3 w-3" />
                                  Implementar
                                </Button>
                              )}
                              {candidate.status !== 'rejected' && candidate.status !== 'implemented' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-red-500 hover:text-red-700"
                                  onClick={() => updateStatus.mutate({ id: candidate.candidate_id, status: 'rejected' })}
                                  disabled={updateStatus.isPending}
                                >
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
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
                <p>Nenhum candidato à expansão encontrado</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
