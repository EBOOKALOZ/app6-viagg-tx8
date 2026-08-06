/**
 * ORION-QA Fase 2 — chaves de query centralizadas (react-query).
 * Única fonte para invalidação/prefetch consistentes entre páginas e hooks.
 */
import type { QaIssueFilters } from "./qaIssues";
import type { QaSortState } from "./types";

export const qaKeys = {
  all: ["qa"] as const,
  issues: () => [...qaKeys.all, "issues"] as const,
  issuesList: (filters: QaIssueFilters, sort: QaSortState, page: number, pageSize: number) =>
    [...qaKeys.issues(), "list", filters, sort, page, pageSize] as const,
  issuesStats: () => [...qaKeys.issues(), "stats"] as const,
  issue: (id: string) => [...qaKeys.issues(), "detail", id] as const,
  comments: (issueId: string) => [...qaKeys.all, "comments", issueId] as const,
  history: (issueId: string) => [...qaKeys.all, "history", issueId] as const,
  historyAll: () => [...qaKeys.all, "history-all"] as const,
  attachments: (issueId: string) => [...qaKeys.all, "attachments", issueId] as const,
  audit: (issueId: string) => [...qaKeys.all, "audit", issueId] as const,
  admins: () => [...qaKeys.all, "admins"] as const,
  related: (issueId: string) => [...qaKeys.all, "related", issueId] as const,
};
