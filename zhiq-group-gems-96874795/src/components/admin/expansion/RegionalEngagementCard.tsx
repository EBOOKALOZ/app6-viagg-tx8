import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRegionalEngagement } from "@/hooks/useExpansionData";

export function RegionalEngagementCard() {
  const { data: regions, isLoading } = useRegionalEngagement();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'strong':
        return <Badge className="bg-green-500 hover:bg-green-600">Expansão Forte</Badge>;
      case 'moderate':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Moderada</Badge>;
      case 'weak':
        return <Badge variant="destructive">Fraca</Badge>;
      default:
        return <Badge variant="secondary">N/A</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          Ranking de Engajamento Regional
        </CardTitle>
        <CardDescription>
          Desempenho por cidade e região baseado em grupos ativos
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                  <TableHead>Região</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead className="text-center">Usuários</TableHead>
                  <TableHead className="text-center">Média Grupos</TableHead>
                  <TableHead className="text-center">Comissão Média</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(regions || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum dado regional disponível
                    </TableCell>
                  </TableRow>
                ) : (
                  (regions || []).map((region, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{region.region}</TableCell>
                      <TableCell>{region.city}</TableCell>
                      <TableCell className="text-center">{region.totalUsers}</TableCell>
                      <TableCell className="text-center">{region.avgGroupsPerUser}</TableCell>
                      <TableCell className="text-center">{region.avgCommission}%</TableCell>
                      <TableCell className="text-center">{getStatusBadge(region.status)}</TableCell>
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
