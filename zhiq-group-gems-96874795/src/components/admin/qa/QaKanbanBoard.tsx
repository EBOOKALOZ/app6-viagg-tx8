/**
 * ORION-QA Fase 2 — visão Kanban com Drag & Drop nativo (HTML5).
 * Soltar um cartão em outra coluna atualiza o status via mutação padrão —
 * triggers de histórico/auditoria do banco continuam cobrindo a mudança.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { computePriorityScore } from "@/services/qa/priorityScore";
import { QaPriorityBadge } from "./QaPriorityBadge";
import type { QaIssueListItem } from "@/services/qa/qaIssues";
import {
  QA_KANBAN_COLUMNS,
  QA_SEVERITY_COLORS,
  qaLabel,
  type QaStatus,
} from "@/services/qa/types";

const COLUMN_RENDER_CAP = 30; // virtualização leve: colunas longas renderizam em blocos

interface QaKanbanBoardProps {
  items: QaIssueListItem[];
  onMove: (issue: QaIssueListItem, newStatus: QaStatus) => void;
  isMoving: boolean;
}

export function QaKanbanBoard({ items, onMove, isMoving }: QaKanbanBoardProps) {
  const navigate = useNavigate();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleDrop = (columnKey: string) => {
    const column = QA_KANBAN_COLUMNS.find((c) => c.key === columnKey);
    const issue = items.find((i) => i.id === dragId);
    setOverColumn(null);
    setDragId(null);
    if (!column || !issue) return;
    if (column.statuses.includes(issue.status as QaStatus)) return; // mesma coluna
    onMove(issue, column.dropStatus);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 items-start">
      {QA_KANBAN_COLUMNS.map((column) => {
        const columnItems = items.filter((i) => column.statuses.includes(i.status as QaStatus));
        const showAll = expanded[column.key];
        const visible = showAll ? columnItems : columnItems.slice(0, COLUMN_RENDER_CAP);
        return (
          <div
            key={column.key}
            className={cn(
              "rounded-xl border bg-muted/30 border-t-4 transition-colors",
              column.accent,
              overColumn === column.key && "bg-primary/10 border-primary",
            )}
            onDragOver={(e) => { e.preventDefault(); setOverColumn(column.key); }}
            onDragLeave={() => setOverColumn((c) => (c === column.key ? null : c))}
            onDrop={(e) => { e.preventDefault(); handleDrop(column.key); }}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide">{column.title}</p>
              <Badge variant="outline" className="text-[10px]">{columnItems.length}</Badge>
            </div>
            <div className="px-2 pb-2 space-y-2 min-h-[80px]">
              {visible.map((issue) => {
                const score = computePriorityScore({
                  severity: issue.severity,
                  environment: issue.environment,
                  status: issue.status,
                  module: issue.module,
                  created_at: issue.created_at,
                  comments_count: issue.comments_count,
                  history_count: issue.history_count,
                  attachments_count: issue.attachments_count,
                  reopen_count: issue.reopen_count,
                });
                return (
                  <Card
                    key={issue.id}
                    draggable={!isMoving}
                    onDragStart={() => setDragId(issue.id)}
                    onDragEnd={() => { setDragId(null); setOverColumn(null); }}
                    onClick={() => navigate(`/admin/qa/${issue.id}`)}
                    className={cn(
                      "p-2.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow space-y-1.5",
                      dragId === issue.id && "opacity-50",
                      isMoving && "pointer-events-none opacity-70",
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[11px] font-semibold text-primary">
                        #{issue.issue_number}
                      </span>
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </div>
                    <p className="text-xs font-medium leading-snug line-clamp-2" title={issue.title}>
                      {issue.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      <QaPriorityBadge result={score} compact />
                      <Badge
                        variant="outline"
                        className={cn("text-[9px] uppercase", QA_SEVERITY_COLORS[issue.severity as keyof typeof QA_SEVERITY_COLORS])}
                      >
                        {qaLabel.severity(issue.severity)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="truncate">{issue.module}</span>
                      {issue.assignedToProfile && (
                        <span
                          className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary font-bold uppercase shrink-0"
                          title={issue.assignedToProfile.name ?? issue.assignedToProfile.email ?? ""}
                        >
                          {(issue.assignedToProfile.name ?? issue.assignedToProfile.email ?? "?").charAt(0)}
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
              {columnItems.length > COLUMN_RENDER_CAP && !showAll && (
                <button
                  className="w-full text-[11px] text-primary hover:underline py-1"
                  onClick={() => setExpanded((e) => ({ ...e, [column.key]: true }))}
                >
                  Mostrar mais {columnItems.length - COLUMN_RENDER_CAP} cartões…
                </button>
              )}
              {columnItems.length === 0 && (
                <p className="text-[11px] text-muted-foreground/60 text-center py-4">
                  Solte um cartão aqui
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
