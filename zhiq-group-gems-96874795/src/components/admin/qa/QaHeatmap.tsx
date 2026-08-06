/**
 * ORION-QA Fase 2 — Heatmap de problemas.
 * Agrupamento (módulo/ambiente/responsável) × tempo (dia/semana/mês).
 * Encoding sequencial de um único matiz (azul claro→escuro) — magnitude.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { buildHeatmap, type QaHeatBucket, type QaHeatGroup, type QaStatRow } from "@/services/qa/metrics";
import type { QaProfileRef } from "@/services/qa/qaIssues";
import { QA_ENVIRONMENT_LABELS, type QaEnvironment } from "@/services/qa/types";

interface QaHeatmapProps {
  rows: QaStatRow[];
  admins: QaProfileRef[];
}

const GROUP_LABELS: Record<QaHeatGroup, string> = {
  modulo: "Módulo",
  ambiente: "Ambiente",
  responsavel: "Responsável",
};

const BUCKET_LABELS: Record<QaHeatBucket, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
};

const BUCKET_COUNT: Record<QaHeatBucket, number> = { dia: 14, semana: 12, mes: 6 };

/** Escala sequencial de 1 matiz (azul #2a78d6) — intensidade pela contagem. */
function cellBackground(count: number, max: number): string {
  if (count === 0) return "transparent";
  const alpha = 0.15 + 0.85 * (count / Math.max(1, max));
  return `rgba(42, 120, 214, ${alpha.toFixed(2)})`;
}

function colLabel(col: string, bucket: QaHeatBucket): string {
  if (bucket === "mes") return col.slice(5); // MM
  return col.slice(8) + "/" + col.slice(5, 7); // dd/MM
}

export function QaHeatmap({ rows, admins }: QaHeatmapProps) {
  const [group, setGroup] = useState<QaHeatGroup>("modulo");
  const [bucket, setBucket] = useState<QaHeatBucket>("dia");

  const heat = useMemo(() => buildHeatmap(rows, group, bucket, BUCKET_COUNT[bucket]), [rows, group, bucket]);

  const rowLabel = (key: string): string => {
    if (group === "ambiente") return QA_ENVIRONMENT_LABELS[key as QaEnvironment] ?? key;
    if (group === "responsavel") {
      if (key === "—") return "Sem responsável";
      const admin = admins.find((a) => a.id === key);
      return admin?.name || admin?.email || `${key.slice(0, 8)}…`;
    }
    return key;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Heatmap de Problemas</CardTitle>
            <CardDescription>Concentração de problemas criados por período.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={group} onValueChange={(v) => setGroup(v as QaHeatGroup)}>
              <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(GROUP_LABELS) as QaHeatGroup[]).map((g) => (
                  <SelectItem key={g} value={g}>{GROUP_LABELS[g]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={bucket} onValueChange={(v) => setBucket(v as QaHeatBucket)}>
              <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(BUCKET_LABELS) as QaHeatBucket[]).map((b) => (
                  <SelectItem key={b} value={b}>{BUCKET_LABELS[b]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {heat.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sem dados no período selecionado.
          </p>
        ) : (
          <TooltipProvider delayDuration={100}>
            <div className="overflow-x-auto">
              <table className="w-full border-separate" style={{ borderSpacing: "2px" }}>
                <thead>
                  <tr>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground pr-2 whitespace-nowrap">
                      {GROUP_LABELS[group]}
                    </th>
                    {heat.cols.map((col) => (
                      <th key={col} className="text-[9px] font-normal text-muted-foreground text-center whitespace-nowrap px-0.5">
                        {colLabel(col, bucket)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heat.rows.slice(0, 12).map((rowKey) => (
                    <tr key={rowKey}>
                      <td className="text-xs pr-2 whitespace-nowrap max-w-[140px] truncate" title={rowLabel(rowKey)}>
                        {rowLabel(rowKey)}
                      </td>
                      {heat.cols.map((col) => {
                        const count = heat.cells[rowKey]?.[col] ?? 0;
                        return (
                          <td key={col} className="p-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="h-6 min-w-[26px] rounded-sm border border-border/40 flex items-center justify-center"
                                  style={{ backgroundColor: cellBackground(count, heat.max) }}
                                >
                                  {count > 0 && (
                                    <span className={`text-[9px] font-mono ${count / Math.max(1, heat.max) > 0.55 ? "text-white" : "text-foreground"}`}>
                                      {count}
                                    </span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                {rowLabel(rowKey)} · {colLabel(col, bucket)}: <strong>{count}</strong> problema(s)
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {heat.rows.length > 12 && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  Mostrando os 12 grupos mais volumosos de {heat.rows.length}.
                </p>
              )}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
