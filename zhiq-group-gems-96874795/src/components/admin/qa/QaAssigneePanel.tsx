/**
 * ORION-QA Fase 2 — Painel do Responsável: desempenho individual + ranking.
 */
import { useMemo } from "react";
import { Medal, Trophy, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { assigneeStats, formatDurationMs, type QaStatRow } from "@/services/qa/metrics";
import type { QaProfileRef } from "@/services/qa/qaIssues";

interface QaAssigneePanelProps {
  rows: QaStatRow[];
  admins: QaProfileRef[];
}

function RankBadge({ position }: { position: number }) {
  if (position === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
  if (position === 2) return <Medal className="h-4 w-4 text-gray-400" />;
  if (position === 3) return <Medal className="h-4 w-4 text-amber-700" />;
  return <span className="text-xs font-mono text-muted-foreground">{position}º</span>;
}

export function QaAssigneePanel({ rows, admins }: QaAssigneePanelProps) {
  const stats = useMemo(() => assigneeStats(rows), [rows]);

  const adminName = (id: string) => {
    const admin = admins.find((a) => a.id === id);
    return admin?.name || admin?.email || `${id.slice(0, 8)}…`;
  };

  const semResponsavel = rows.filter((r) => !r.assigned_to).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-primary" />
          Painel do Responsável
        </CardTitle>
        <CardDescription>
          Ranking por problemas resolvidos (desempate: menor tempo médio).{" "}
          {semResponsavel > 0 && (
            <Badge variant="outline" className="ml-1 text-[10px]">
              {semResponsavel} sem responsável
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum problema atribuído ainda.
          </p>
        ) : (
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[60px]">Rank</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="w-[100px] text-right">Atribuídos</TableHead>
                  <TableHead className="w-[100px] text-right">Resolvidos</TableHead>
                  <TableHead className="w-[90px] text-right">Críticos</TableHead>
                  <TableHead className="w-[120px] text-right">Em homologação</TableHead>
                  <TableHead className="w-[120px] text-right">Tempo médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((s, idx) => (
                  <TableRow key={s.assignedTo}>
                    <TableCell><RankBadge position={idx + 1} /></TableCell>
                    <TableCell className="font-medium text-sm">{adminName(s.assignedTo)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{s.atribuidos}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-green-700">{s.resolvidos}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {s.criticos > 0 ? (
                        <span className="text-red-600 font-semibold">{s.criticos}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{s.emHomologacao}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {formatDurationMs(s.tempoMedioMs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
