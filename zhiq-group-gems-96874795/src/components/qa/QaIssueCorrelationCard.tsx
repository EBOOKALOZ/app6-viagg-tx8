/**
 * ORION-QA Fase 3 — correlação automática do problema com o ecossistema.
 * Mostra eventos ligados diretamente (FK), pelo mesmo commit e pelo mesmo
 * módulo — a ponte issue ↔ commit ↔ deploy ↔ build ↔ teste da seção 14.
 */
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { GitCommitHorizontal, Link2, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  QA_EVENT_SOURCE_LABELS, QA_EVENT_TYPE_LABELS, type QaEventRecord, type QaEventSource,
  type QaEventType,
} from "@/services/qa/events";
import { getIssueCorrelation } from "@/services/qa/observability";

interface Props {
  issue: { id: string; commit_hash: string | null; module: string };
}

function EventLine({ event }: { event: QaEventRecord }) {
  return (
    <li className="text-xs space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {QA_EVENT_TYPE_LABELS[event.event_type as QaEventType] ?? event.event_type}
        </Badge>
        <Badge variant="outline" className="text-[10px] font-normal">
          {QA_EVENT_SOURCE_LABELS[event.source as QaEventSource] ?? event.source}
        </Badge>
        <span className="text-muted-foreground">
          {format(new Date(event.created_at), "dd MMM, HH:mm", { locale: ptBR })}
        </span>
      </div>
      <p className="break-words">{event.title}</p>
    </li>
  );
}

export default function QaIssueCorrelationCard({ issue }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["qa-issue-correlation", issue.id, issue.commit_hash, issue.module],
    queryFn: () => getIssueCorrelation(issue),
  });

  const sections = [
    { title: "Eventos deste problema", items: data?.direct ?? [] },
    {
      title: issue.commit_hash ? `Mesmo commit (${issue.commit_hash.slice(0, 10)})` : "Mesmo commit",
      items: data?.sameCommit ?? [],
    },
    { title: `Mesmo módulo (${issue.module})`, items: (data?.sameModule ?? []).slice(0, 8) },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          Correlação
        </CardTitle>
        <CardDescription className="text-xs">
          Issue ↔ commit ↔ deploy ↔ build ↔ teste, correlacionados automaticamente pelo Event Bus.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="py-4 text-center">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-xs text-red-500">
            Erro ao carregar correlação: {(error as Error).message}
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.title}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
                <GitCommitHorizontal className="h-3 w-3" />
                {section.title}
              </p>
              {section.items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic mt-1">Nenhum evento.</p>
              ) : (
                <ul className="mt-1.5 space-y-2">
                  {section.items.map((event) => <EventLine key={event.id} event={event} />)}
                </ul>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
