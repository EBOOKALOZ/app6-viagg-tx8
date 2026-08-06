/**
 * ORION-QA Fase 2 — Dashboard Avançado: MTTR, MTBF, reabertos, janelas 7/30
 * dias, distribuição por ambiente/módulo/desenvolvedor e tempo médio por status.
 */
import { useMemo } from "react";
import {
  Activity, AlertTriangle, CalendarDays, CalendarRange, Clock3, RotateCcw, Timer, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  assigneeStats, avgTimePerStatus, computeMtbfMs, computeMttrMs, countBy,
  countInLastDays, formatDurationMs, isOpenStatus,
  type QaHistoryRow, type QaStatRow,
} from "@/services/qa/metrics";
import type { QaProfileRef } from "@/services/qa/qaIssues";
import { QA_STATUSES, qaLabel } from "@/services/qa/types";

interface QaAdvancedDashboardProps {
  rows: QaStatRow[];
  history: QaHistoryRow[] | undefined;
  historyLoading: boolean;
  admins: QaProfileRef[];
}

function MetricCard({ title, value, icon: Icon, accent, hint }: {
  title: string; value: string; icon: React.ElementType; accent: string; hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-7 w-7 shrink-0 ${accent}`} />
        <div className="min-w-0">
          <p className={`text-xl font-bold leading-tight ${accent}`}>{value}</p>
          <p className="text-[11px] text-muted-foreground truncate" title={hint ?? title}>{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DistributionList({ title, entries, labelOf }: {
  title: string;
  entries: [string, number][];
  labelOf?: (key: string) => string;
}) {
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados.</p>
        ) : (
          entries.map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs w-32 truncate" title={labelOf ? labelOf(key) : key}>
                {labelOf ? labelOf(key) : key}
              </span>
              <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(value / max) * 100}%`, backgroundColor: "#2a78d6" }}
                />
              </div>
              <span className="text-xs font-mono w-8 text-right">{value}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function QaAdvancedDashboard({ rows, history, historyLoading, admins }: QaAdvancedDashboardProps) {
  const mttr = useMemo(() => computeMttrMs(rows), [rows]);
  const mtbf = useMemo(() => computeMtbfMs(rows), [rows]);
  const criticosAbertos = rows.filter((r) => r.severity === "critico" && isOpenStatus(r.status)).length;
  const reabertos = rows.filter((r) => r.status === "reaberto" || r.reopen_count > 0).length;
  const last7 = useMemo(() => countInLastDays(rows, 7), [rows]);
  const last30 = useMemo(() => countInLastDays(rows, 30), [rows]);

  const byEnvironment = useMemo(
    () => Object.entries(countBy(rows, "environment")).sort((a, b) => b[1] - a[1]),
    [rows],
  );
  const byModule = useMemo(
    () => Object.entries(countBy(rows, "module")).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [rows],
  );
  const byAssignee = useMemo(() => {
    const stats = assigneeStats(rows);
    return stats.slice(0, 8).map((s): [string, number] => [s.assignedTo, s.atribuidos]);
  }, [rows]);

  const statusTimes = useMemo(() => (history ? avgTimePerStatus(history) : {}), [history]);

  const adminName = (id: string) => {
    const admin = admins.find((a) => a.id === id);
    return admin?.name || admin?.email || `${id.slice(0, 8)}…`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard title="MTTR" value={formatDurationMs(mttr)} icon={Timer} accent="text-purple-600"
          hint="Tempo médio até a resolução (resolved_at − created_at)" />
        <MetricCard title="MTBF" value={formatDurationMs(mtbf)} icon={Activity} accent="text-blue-600"
          hint="Tempo médio entre novas ocorrências" />
        <MetricCard title="Críticos abertos" value={String(criticosAbertos)} icon={AlertTriangle} accent="text-red-600" />
        <MetricCard title="Reabertos" value={String(reabertos)} icon={RotateCcw} accent="text-orange-600" />
        <MetricCard title="Últimos 7 dias" value={String(last7)} icon={CalendarDays} accent="text-cyan-600" />
        <MetricCard title="Últimos 30 dias" value={String(last30)} icon={CalendarRange} accent="text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <DistributionList title="Problemas por ambiente" entries={byEnvironment} labelOf={qaLabel.environment} />
        <DistributionList title="Problemas por módulo" entries={byModule} />
        <DistributionList title="Problemas por desenvolvedor" entries={byAssignee} labelOf={adminName} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Clock3 className="h-4 w-4 text-primary" />
              Tempo médio por status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {historyLoading ? (
              <Skeleton className="h-24" />
            ) : Object.keys(statusTimes).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem histórico suficiente.</p>
            ) : (
              QA_STATUSES.filter((s) => statusTimes[s] !== undefined).map((status) => (
                <div key={status} className="flex items-center justify-between gap-2">
                  <span className="text-xs truncate">{qaLabel.status(status)}</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {formatDurationMs(statusTimes[status])}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" />
        Distribuições consideram todos os problemas registrados; janelas 7/30 dias usam a data de criação.
      </p>
    </div>
  );
}
