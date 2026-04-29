import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGroupMonitoring } from "@/hooks/useExpansionData";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function GroupMonitoringCard() {
  const [profileFilter, setProfileFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");

  const { data: groups, isLoading } = useGroupMonitoring({
    profileType: profileFilter || undefined,
    status: statusFilter || undefined,
    city: cityFilter || undefined,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500 hover:bg-green-600">Ativo</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Pendente</Badge>;
      case 'invalid':
        return <Badge variant="destructive">Inválido</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return "N/A";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">🔍</span>
          Monitoramento de Grupos
        </CardTitle>
        <CardDescription>
          Acompanhamento detalhado de todos os grupos cadastrados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <Select value={profileFilter} onValueChange={setProfileFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos os Perfis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Perfis</SelectItem>
              <SelectItem value="motoboy">Motoboy</SelectItem>
              <SelectItem value="merchant">Comerciante</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos os Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="invalid">Inválido</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Filtrar por cidade..."
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="w-[200px]"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Grupo</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Validação</TableHead>
                  <TableHead>Frequência</TableHead>
                  <TableHead>Região</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(groups || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum grupo encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  (groups || []).map((group) => (
                    <TableRow key={group.id}>
                      <TableCell className="font-mono text-xs">
                        {group.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{group.profileType}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(group.status)}</TableCell>
                      <TableCell className="text-sm">
                        {formatDate(group.lastValidation)}
                      </TableCell>
                      <TableCell>{group.postingFrequency}</TableCell>
                      <TableCell>
                        {group.city}, {group.region}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
