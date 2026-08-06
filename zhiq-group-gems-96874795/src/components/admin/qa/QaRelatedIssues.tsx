/**
 * ORION-QA Fase 2 — seção "Problemas Relacionados" (similaridade por regras).
 */
import { Link } from "react-router-dom";
import { ExternalLink, GitBranchPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QA_STATUS_COLORS, qaLabel, type QaStatus } from "@/services/qa/types";

export interface QaRelatedItem {
  id: string;
  issue_number: number;
  title: string;
  status: string;
  similarity: number;
}

interface QaRelatedIssuesProps {
  items: QaRelatedItem[];
  isLoading: boolean;
}

function similarityColor(pct: number): string {
  if (pct >= 70) return "bg-red-100 text-red-800 border-red-300";
  if (pct >= 45) return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-yellow-100 text-yellow-800 border-yellow-300";
}

export function QaRelatedIssues({ items, isLoading }: QaRelatedIssuesProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranchPlus className="h-4 w-4 text-primary" />
          Problemas Relacionados
        </CardTitle>
        <CardDescription>
          Similaridade automática por título, descrição, módulo, erro, commit e stack.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum problema semelhante encontrado.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <Link
                key={item.id}
                to={`/admin/qa/${item.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border p-2.5 hover:bg-muted/50 transition-colors group"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-primary shrink-0">
                    #{item.issue_number}
                  </span>
                  <span className="text-sm truncate" title={item.title}>{item.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`text-[10px] font-mono ${similarityColor(item.similarity)}`}>
                    {item.similarity}%
                  </Badge>
                  <Badge className={`${QA_STATUS_COLORS[item.status as QaStatus] ?? "bg-gray-500"} text-white border-0 text-[10px]`}>
                    {qaLabel.status(item.status)}
                  </Badge>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
