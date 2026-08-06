/**
 * ORION-QA Fase 2 — Central de Problemas Inteligente (/admin/qa).
 * Modos Tabela · Kanban · Analytics · Equipe, Prioridade IA, filtros rápidos,
 * busca avançada, colunas configuráveis, densidade, favoritos, atalhos de
 * teclado, exportações (CSV/Excel/PDF/JSON) e paginação server-side.
 * Admin-only (RLS is_admin() no banco; rota sob ProtectedRoute requireAdmin).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDownUp, Bug, CheckCircle2, Columns3, Download, FilterX,
  FlaskConical, Hammer, Inbox, Kanban, LayoutList, LineChart, Loader2, Plus,
  Rows3, Save, Search, Star, Timer, TrendingUp, Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { QaAdvancedDashboard } from "@/components/admin/qa/QaAdvancedDashboard";
import { QaAssigneePanel } from "@/components/admin/qa/QaAssigneePanel";
import { QaChartsPanel } from "@/components/admin/qa/QaChartsPanel";
import { QaHeatmap } from "@/components/admin/qa/QaHeatmap";
import { QaKanbanBoard } from "@/components/admin/qa/QaKanbanBoard";
import { QaPriorityBadge } from "@/components/admin/qa/QaPriorityBadge";

import { useQaPrefs, QA_DEFAULT_FILTERS, type QaSavedFilters } from "@/hooks/qa/useQaPrefs";
import { useQaShortcuts } from "@/hooks/qa/useQaShortcuts";
import { exportQaCsv, exportQaExcel, exportQaJson, exportQaPdf } from "@/lib/qa/exportIssues";
import { computeMttrMs, formatDurationMs, isOpenStatus } from "@/services/qa/metrics";
import {
  createQaIssue, listQaAdmins, listQaHistoryAll, listQaIssuesPage, listQaStatRows,
  updateQaIssue, type QaIssueFilters, type QaIssueListItem,
} from "@/services/qa/qaIssues";
import { computePriorityScore } from "@/services/qa/priorityScore";
import { qaKeys } from "@/services/qa/queryKeys";
import {
  QA_ENVIRONMENTS, QA_ENVIRONMENT_LABELS, QA_ORIGINS, QA_ORIGIN_LABELS,
  QA_PRIORITIES, QA_PRIORITY_LABELS, QA_QUICK_FILTERS, QA_QUICK_FILTER_LABELS,
  QA_SEVERITIES, QA_SEVERITY_COLORS, QA_SEVERITY_LABELS, QA_SORT_FIELDS,
  QA_STATUSES, QA_STATUS_COLORS, QA_STATUS_LABELS, QA_TABLE_COLUMNS,
  QA_TABLE_COLUMN_LABELS, qaLabel, type QaQuickFilter, type QaSortField,
  type QaStatus, type QaTableColumn, type QaViewMode,
} from "@/services/qa/types";

const PAGE_SIZE = 15;
const WIDE_PAGE_SIZE = 200; // kanban / favoritos: janela ampla client-side

const SORT_FIELD_LABELS: Record<QaSortField, string> = {
  created_at: "Data de criação",
  updated_at: "Última atualização",
  issue_number: "Número",
  severity: "Severidade",
  status: "Status",
};

interface NewIssueForm {
  title: string; description: string; module: string; environment: string;
  severity: string; priority: string; origin: string; current_version: string;
  commit_hash: string; build_number: string; browser: string; device: string;
  operating_system: string; error_message: string; stack_trace: string;
  steps_to_reproduce: string; expected_behavior: string; actual_behavior: string;
}

const EMPTY_FORM: NewIssueForm = {
  title: "", description: "", module: "", environment: "producao", severity: "medio",
  priority: "media", origin: "manual", current_version: "", commit_hash: "", build_number: "",
  browser: "", device: "", operating_system: "", error_message: "", stack_trace: "",
  steps_to_reproduce: "", expected_behavior: "", actual_behavior: "",
};

function profileName(p: { name: string | null; email: string | null } | null): string {
  return p?.name || p?.email || "—";
}

export default function AdminQACentralPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { prefs, setPrefs, toggleFavorite, toggleColumn } = useQaPrefs();
  const [filtersState, setFiltersState] = useState<QaSavedFilters>(
    () => prefs.savedFilters ?? QA_DEFAULT_FILTERS,
  );
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [form, setForm] = useState<NewIssueForm>(EMPTY_FORM);

  const setFilters = useCallback((patch: Partial<QaSavedFilters>) => {
    setFiltersState((f) => ({ ...f, ...patch }));
    setPage(1);
  }, []);

  const repoFilters: QaIssueFilters = useMemo(() => ({
    search: filtersState.search,
    module: filtersState.module,
    status: filtersState.status,
    severity: filtersState.severity,
    origin: filtersState.origin,
    environment: filtersState.environment,
    assignedTo: filtersState.assignedTo,
    periodFrom: filtersState.periodFrom || undefined,
    periodTo: filtersState.periodTo || undefined,
    quickFilters: filtersState.quickFilters,
  }), [filtersState]);

  const wideMode = prefs.viewMode === "kanban" || prefs.onlyFavorites;
  const pageSize = wideMode ? WIDE_PAGE_SIZE : PAGE_SIZE;
  const queryPage = wideMode ? 1 : page;

  /* ── Queries ─────────────────────────────────────────────── */
  const { data: statRows, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: qaKeys.issuesStats(),
    queryFn: listQaStatRows,
    staleTime: 60_000,
  });

  const listQueryKey = qaKeys.issuesList(repoFilters, prefs.sort, queryPage, pageSize);
  const { data: pageData, isLoading, isFetching, error } = useQuery({
    queryKey: listQueryKey,
    queryFn: () => listQaIssuesPage(repoFilters, prefs.sort, queryPage, pageSize),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const { data: admins } = useQuery({ queryKey: qaKeys.admins(), queryFn: listQaAdmins, staleTime: 300_000 });

  const analyticsActive = prefs.viewMode === "analytics";
  const { data: historyAll, isLoading: historyAllLoading } = useQuery({
    queryKey: qaKeys.historyAll(),
    queryFn: listQaHistoryAll,
    enabled: analyticsActive, // lazy: só carrega ao abrir o Analytics
    staleTime: 60_000,
  });

  /* ── Dados derivados ─────────────────────────────────────── */
  const favoriteSet = useMemo(() => new Set(prefs.favorites), [prefs.favorites]);

  const visibleItems = useMemo(() => {
    const items = pageData?.items ?? [];
    return prefs.onlyFavorites ? items.filter((i) => favoriteSet.has(i.id)) : items;
  }, [pageData, prefs.onlyFavorites, favoriteSet]);

  const clientPaged = prefs.onlyFavorites; // favoritos paginam client-side
  const totalItems = clientPaged ? visibleItems.length : pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const tableItems = clientPaged
    ? visibleItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : visibleItems;

  // Prefetch da próxima página (server-side)
  if (!wideMode && !isFetching && pageData && currentPage < totalPages) {
    void queryClient.prefetchQuery({
      queryKey: qaKeys.issuesList(repoFilters, prefs.sort, currentPage + 1, pageSize),
      queryFn: () => listQaIssuesPage(repoFilters, prefs.sort, currentPage + 1, pageSize),
      staleTime: 30_000,
    });
  }

  const stats = useMemo(() => {
    const list = statRows ?? [];
    const total = list.length;
    const abertos = list.filter((i) => isOpenStatus(i.status)).length;
    const criticos = list.filter((i) => i.severity === "critico" && isOpenStatus(i.status)).length;
    const emDev = list.filter((i) => i.status === "em_desenvolvimento").length;
    const emHomolog = list.filter((i) => i.status === "em_homologacao").length;
    const fechados = list.filter((i) => i.status === "fechado").length;
    const mttr = computeMttrMs(list);
    const taxa = total > 0
      ? Math.round((list.filter((i) => ["homologado", "fechado"].includes(i.status)).length / total) * 100)
      : null;
    return { total, abertos, criticos, emDev, emHomolog, fechados, mttr, taxa };
  }, [statRows]);

  const modules = useMemo(
    () => [...new Set((statRows ?? []).map((i) => i.module))].sort(),
    [statRows],
  );

  const hasActiveFilters = useMemo(() =>
    JSON.stringify(filtersState) !== JSON.stringify(QA_DEFAULT_FILTERS), [filtersState]);

  /* ── Mutações ────────────────────────────────────────────── */
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qaKeys.issues() });
    queryClient.invalidateQueries({ queryKey: qaKeys.historyAll() });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const clean = (v: string) => (v.trim() === "" ? null : v.trim());
      return createQaIssue({
        title: form.title.trim(),
        description: form.description.trim(),
        module: form.module.trim() || "geral",
        environment: form.environment,
        severity: form.severity,
        priority: form.priority,
        origin: form.origin,
        current_version: clean(form.current_version),
        commit_hash: clean(form.commit_hash),
        build_number: clean(form.build_number),
        browser: clean(form.browser),
        device: clean(form.device),
        operating_system: clean(form.operating_system),
        error_message: clean(form.error_message),
        stack_trace: clean(form.stack_trace),
        steps_to_reproduce: clean(form.steps_to_reproduce),
        expected_behavior: clean(form.expected_behavior),
        actual_behavior: clean(form.actual_behavior),
      });
    },
    onSuccess: (issue) => {
      toast.success(`Problema #${issue.issue_number} registrado.`);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      invalidateAll();
    },
    onError: (err: Error) => toast.error(`Erro ao registrar problema: ${err.message}`),
  });

  const moveMutation = useMutation({
    mutationFn: ({ issue, status }: { issue: QaIssueListItem; status: QaStatus }) =>
      updateQaIssue(issue.id, { status }),
    onSuccess: (updated) => {
      toast.success(`#${updated.issue_number} → ${qaLabel.status(updated.status)}.`);
      invalidateAll();
    },
    onError: (err: Error) => toast.error(`Erro ao mover: ${err.message}`),
  });

  /* ── Exportações (respeitam os filtros ativos) ───────────── */
  const buildExportRows = useCallback(async () => {
    const full = await listQaIssuesPage(repoFilters, prefs.sort, 1, 1000);
    const source = prefs.onlyFavorites ? full.items.filter((i) => favoriteSet.has(i.id)) : full.items;
    return source.map((i) => ({
      id: `#${i.issue_number}`,
      prioridade_ia: computePriorityScore(i).score,
      title: i.title,
      module: i.module,
      severity: qaLabel.severity(i.severity),
      status: qaLabel.status(i.status),
      priority: qaLabel.priority(i.priority),
      origin: qaLabel.origin(i.origin),
      environment: qaLabel.environment(i.environment),
      assigned: profileName(i.assignedToProfile),
      created_by: profileName(i.createdByProfile),
      created_at: format(new Date(i.created_at), "dd/MM/yyyy HH:mm"),
      resolved_at: i.resolved_at ? format(new Date(i.resolved_at), "dd/MM/yyyy HH:mm") : "",
      closed_at: i.closed_at ? format(new Date(i.closed_at), "dd/MM/yyyy HH:mm") : "",
      commit_hash: i.commit_hash ?? "",
      error_message: i.error_message ?? "",
      reaberturas: i.reopen_count,
      comentarios: i.comments_count,
      anexos: i.attachments_count,
    }));
  }, [repoFilters, prefs.sort, prefs.onlyFavorites, favoriteSet]);

  const EXPORT_COLUMNS = useMemo(() => [
    { header: "ID", key: "id" },
    { header: "Prioridade IA", key: "prioridade_ia" },
    { header: "Título", key: "title" },
    { header: "Módulo", key: "module" },
    { header: "Severidade", key: "severity" },
    { header: "Status", key: "status" },
    { header: "Prioridade", key: "priority" },
    { header: "Origem", key: "origin" },
    { header: "Ambiente", key: "environment" },
    { header: "Responsável", key: "assigned" },
    { header: "Criado em", key: "created_at" },
    { header: "Resolvido em", key: "resolved_at" },
    { header: "Fechado em", key: "closed_at" },
    { header: "Commit", key: "commit_hash" },
    { header: "Reaberturas", key: "reaberturas" },
  ], []);

  const filtersDescription = useMemo(() => {
    const parts: string[] = [];
    if (filtersState.search) parts.push(`busca "${filtersState.search}"`);
    if (filtersState.module !== "all") parts.push(`módulo ${filtersState.module}`);
    if (filtersState.status !== "all") parts.push(`status ${qaLabel.status(filtersState.status)}`);
    if (filtersState.severity !== "all") parts.push(`severidade ${qaLabel.severity(filtersState.severity)}`);
    if (filtersState.origin !== "all") parts.push(`origem ${qaLabel.origin(filtersState.origin)}`);
    if (filtersState.environment !== "all") parts.push(`ambiente ${qaLabel.environment(filtersState.environment)}`);
    if (filtersState.periodFrom || filtersState.periodTo) {
      parts.push(`período ${filtersState.periodFrom || "…"} → ${filtersState.periodTo || "…"}`);
    }
    for (const q of filtersState.quickFilters) parts.push(QA_QUICK_FILTER_LABELS[q].toLowerCase());
    if (prefs.onlyFavorites) parts.push("somente favoritos");
    return parts.length > 0 ? parts.join(" · ") : "nenhum (todos os problemas)";
  }, [filtersState, prefs.onlyFavorites]);

  const handleExport = useCallback(async (kind: "csv" | "excel" | "pdf" | "json") => {
    try {
      const rows = await buildExportRows();
      const title = "Central de Problemas";
      if (kind === "csv") exportQaCsv(title, EXPORT_COLUMNS, rows);
      if (kind === "excel") exportQaExcel(title, EXPORT_COLUMNS, rows);
      if (kind === "json") exportQaJson(title, rows);
      if (kind === "pdf") {
        exportQaPdf(title, EXPORT_COLUMNS, rows, {
          filtersDescription,
          summary: [
            { label: "Total", value: String(stats.total) },
            { label: "Abertos", value: String(stats.abertos) },
            { label: "Críticos", value: String(stats.criticos) },
            { label: "MTTR", value: formatDurationMs(stats.mttr) },
            { label: "Taxa de resolução", value: stats.taxa !== null ? `${stats.taxa}%` : "—" },
            { label: "Exportados", value: String(rows.length) },
          ],
        });
      }
      toast.success(`Exportação ${kind.toUpperCase()} gerada (${rows.length} problemas).`);
    } catch (err) {
      toast.error(`Erro na exportação: ${(err as Error).message}`);
    }
  }, [buildExportRows, EXPORT_COLUMNS, filtersDescription, stats]);

  /* ── UX: atalhos de teclado ──────────────────────────────── */
  const clearFilters = useCallback(() => {
    setFiltersState(QA_DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const shortcutHandlers = useMemo(() => ({
    onNew: () => setCreateOpen(true),
    onFocusSearch: () => searchInputRef.current?.focus(),
    onToggleKanban: () => setPrefs({ viewMode: prefs.viewMode === "kanban" ? "tabela" : "kanban" }),
    onTableView: () => setPrefs({ viewMode: "tabela" }),
    onExport: () => setExportOpen(true),
    onClearFilters: clearFilters,
  }), [setPrefs, prefs.viewMode, clearFilters]);
  useQaShortcuts(shortcutHandlers);

  const toggleQuickFilter = (q: QaQuickFilter) => {
    const active = filtersState.quickFilters.includes(q);
    setFilters({
      quickFilters: active
        ? filtersState.quickFilters.filter((x) => x !== q)
        : [...filtersState.quickFilters, q],
    });
  };

  const setField = (key: keyof NewIssueForm) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isCompact = prefs.density === "compacto";
  const cellPad = isCompact ? "py-1.5" : "py-3";
  const showCol = (c: QaTableColumn) => prefs.columns.includes(c);

  const statCards: { title: string; value: string; icon: React.ElementType; accent: string }[] = [
    { title: "Total", value: String(stats.total), icon: Bug, accent: "text-foreground" },
    { title: "Abertos", value: String(stats.abertos), icon: Inbox, accent: "text-blue-600" },
    { title: "Críticos", value: String(stats.criticos), icon: AlertTriangle, accent: "text-red-600" },
    { title: "Em desenvolvimento", value: String(stats.emDev), icon: Hammer, accent: "text-orange-600" },
    { title: "Em homologação", value: String(stats.emHomolog), icon: FlaskConical, accent: "text-cyan-600" },
    { title: "Fechados", value: String(stats.fechados), icon: CheckCircle2, accent: "text-green-600" },
    { title: "Tempo médio de resolução", value: formatDurationMs(stats.mttr), icon: Timer, accent: "text-purple-600" },
    { title: "Taxa de resolução", value: stats.taxa !== null ? `${stats.taxa}%` : "—", icon: TrendingUp, accent: "text-emerald-600" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1500px] mx-auto animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="h-6 w-6 text-primary" />
            Central de Problemas
            <Badge variant="outline" className="text-[10px] uppercase">Inteligente</Badge>
          </h1>
          <p className="text-muted-foreground">
            ORION-QA — priorização por IA, análise de causa, Kanban e analytics.
            <span className="hidden md:inline text-xs ml-2 text-muted-foreground/70">
              Atalhos: <kbd className="px-1 rounded border">n</kbd> novo ·{" "}
              <kbd className="px-1 rounded border">/</kbd> busca ·{" "}
              <kbd className="px-1 rounded border">k</kbd> kanban ·{" "}
              <kbd className="px-1 rounded border">e</kbd> exportar ·{" "}
              <kbd className="px-1 rounded border">f</kbd> limpar filtros
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu open={exportOpen} onOpenChange={setExportOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Respeita os filtros ativos</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport("pdf")}>PDF Premium</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("excel")}>Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("csv")}>CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("json")}>JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Problema
          </Button>
        </div>
      </div>

      {/* Dashboard base */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statsLoading
          ? Array.from({ length: 8 }).map((_, idx) => <Skeleton key={idx} className="h-[88px] rounded-xl" />)
          : statCards.map((card) => (
              <Card key={card.title}>
                <CardContent className="p-4 flex items-center gap-3">
                  <card.icon className={`h-7 w-7 shrink-0 ${card.accent}`} />
                  <div className="min-w-0">
                    <p className={`text-xl font-bold leading-tight ${card.accent}`}>{card.value}</p>
                    <p className="text-[11px] text-muted-foreground truncate" title={card.title}>{card.title}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>
      {statsError ? (
        <p className="text-sm text-red-500">Erro ao carregar indicadores: {(statsError as Error).message}</p>
      ) : null}

      {/* Modo de visualização + preferências */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={prefs.viewMode} onValueChange={(v) => setPrefs({ viewMode: v as QaViewMode })}>
          <TabsList>
            <TabsTrigger value="tabela"><LayoutList className="h-4 w-4 mr-1.5" />Tabela</TabsTrigger>
            <TabsTrigger value="kanban"><Kanban className="h-4 w-4 mr-1.5" />Kanban</TabsTrigger>
            <TabsTrigger value="analytics"><LineChart className="h-4 w-4 mr-1.5" />Analytics</TabsTrigger>
            <TabsTrigger value="equipe"><Users className="h-4 w-4 mr-1.5" />Equipe</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={prefs.onlyFavorites ? "default" : "outline"}
            size="sm"
            onClick={() => setPrefs({ onlyFavorites: !prefs.onlyFavorites })}
            title="Mostrar apenas favoritos"
          >
            <Star className={cn("h-4 w-4 mr-1.5", prefs.onlyFavorites && "fill-current")} />
            Favoritos ({prefs.favorites.length})
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => setPrefs({ density: isCompact ? "expandido" : "compacto" })}
            title="Alternar densidade da tabela"
          >
            <Rows3 className="h-4 w-4 mr-1.5" />
            {isCompact ? "Compacto" : "Expandido"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" title="Colunas visíveis">
                <Columns3 className="h-4 w-4 mr-1.5" />
                Colunas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Colunas da tabela</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {QA_TABLE_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c}
                  checked={prefs.columns.includes(c)}
                  onCheckedChange={() => toggleColumn(c)}
                >
                  {QA_TABLE_COLUMN_LABELS[c]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" title="Ordenação">
                <ArrowDownUp className="h-4 w-4 mr-1.5" />
                {SORT_FIELD_LABELS[prefs.sort.field]} {prefs.sort.ascending ? "↑" : "↓"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Ordenar por</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {QA_SORT_FIELDS.map((f) => (
                <DropdownMenuItem
                  key={f}
                  onClick={() => setPrefs({
                    sort: { field: f, ascending: prefs.sort.field === f ? !prefs.sort.ascending : false },
                  })}
                >
                  {SORT_FIELD_LABELS[f]} {prefs.sort.field === f ? (prefs.sort.ascending ? "↑" : "↓") : ""}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline" size="sm"
            onClick={() => { setPrefs({ savedFilters: filtersState }); toast.success("Filtros e visualização salvos."); }}
            title="Salvar filtros, ordenação e visualização atuais"
          >
            <Save className="h-4 w-4 mr-1.5" />
            Salvar visão
          </Button>
        </div>
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap gap-1.5">
        {QA_QUICK_FILTERS.map((q) => {
          const active = filtersState.quickFilters.includes(q);
          return (
            <button
              key={q}
              onClick={() => toggleQuickFilter(q)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground hover:bg-muted border-border",
              )}
            >
              {QA_QUICK_FILTER_LABELS[q]}
            </button>
          );
        })}
      </div>

      {/* Filtros completos (Tabela/Kanban) */}
      {(prefs.viewMode === "tabela" || prefs.viewMode === "kanban") && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Filtros e busca avançada</CardTitle>
            <CardDescription>
              Pesquise por ID, número, título, descrição, erro, commit, arquivo, stack, responsável, usuário, IP ou User-Agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative md:col-span-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder='Busca avançada — ex.: "permission denied", #42, nome do responsável, IP…'
                  className="pl-9"
                  value={filtersState.search}
                  onChange={(e) => setFilters({ search: e.target.value })}
                />
              </div>
              <Select value={filtersState.module} onValueChange={(v) => setFilters({ module: v })}>
                <SelectTrigger><SelectValue placeholder="Módulo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Módulos</SelectItem>
                  {modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtersState.status} onValueChange={(v) => setFilters({ status: v })}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  {QA_STATUSES.map((s) => <SelectItem key={s} value={s}>{QA_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtersState.severity} onValueChange={(v) => setFilters({ severity: v })}>
                <SelectTrigger><SelectValue placeholder="Severidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Severidades</SelectItem>
                  {QA_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{QA_SEVERITY_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtersState.origin} onValueChange={(v) => setFilters({ origin: v })}>
                <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Origens</SelectItem>
                  {QA_ORIGINS.map((o) => <SelectItem key={o} value={o}>{QA_ORIGIN_LABELS[o]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtersState.environment} onValueChange={(v) => setFilters({ environment: v })}>
                <SelectTrigger><SelectValue placeholder="Ambiente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Ambientes</SelectItem>
                  {QA_ENVIRONMENTS.map((e) => <SelectItem key={e} value={e}>{QA_ENVIRONMENT_LABELS[e]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtersState.assignedTo} onValueChange={(v) => setFilters({ assignedTo: v })}>
                <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Responsáveis</SelectItem>
                  {(admins ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name || a.email || a.id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input type="date" value={filtersState.periodFrom} onChange={(e) => setFilters({ periodFrom: e.target.value })} aria-label="Período — de" />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="date" value={filtersState.periodTo} onChange={(e) => setFilters({ periodTo: e.target.value })} aria-label="Período — até" />
              </div>
            </div>
            {hasActiveFilters && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                  <FilterX className="h-4 w-4 mr-2" />
                  Limpar Filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Conteúdo por modo ─────────────────────────────────── */}
      {prefs.viewMode === "analytics" && (
        <div className="space-y-4">
          <QaAdvancedDashboard
            rows={statRows ?? []}
            history={historyAll}
            historyLoading={historyAllLoading}
            admins={admins ?? []}
          />
          <QaChartsPanel rows={statRows ?? []} />
          <QaHeatmap rows={statRows ?? []} admins={admins ?? []} />
        </div>
      )}

      {prefs.viewMode === "equipe" && (
        <QaAssigneePanel rows={statRows ?? []} admins={admins ?? []} />
      )}

      {prefs.viewMode === "kanban" && (
        isLoading ? (
          <Skeleton className="h-72 rounded-xl" />
        ) : error ? (
          <p className="text-sm text-red-500">Erro ao carregar o Kanban: {(error as Error).message}</p>
        ) : (
          <QaKanbanBoard
            items={visibleItems}
            onMove={(issue, status) => moveMutation.mutate({ issue, status })}
            isMoving={moveMutation.isPending}
          />
        )
      )}

      {prefs.viewMode === "tabela" && (
        <Card>
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[36px]" />
                  <TableHead className="w-[70px]">ID</TableHead>
                  {showCol("prioridade_ia") && <TableHead className="w-[120px]">Prioridade IA</TableHead>}
                  <TableHead>Título</TableHead>
                  {showCol("modulo") && <TableHead className="w-[120px]">Módulo</TableHead>}
                  {showCol("severidade") && <TableHead className="w-[100px]">Severidade</TableHead>}
                  {showCol("status") && <TableHead className="w-[140px]">Status</TableHead>}
                  {showCol("origem") && <TableHead className="w-[100px]">Origem</TableHead>}
                  {showCol("ambiente") && <TableHead className="w-[100px]">Ambiente</TableHead>}
                  {showCol("responsavel") && <TableHead className="w-[130px]">Responsável</TableHead>}
                  {showCol("data") && <TableHead className="w-[110px]">Data</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center text-red-500">
                      Erro ao carregar problemas: {(error as Error).message}
                    </TableCell>
                  </TableRow>
                ) : tableItems.length > 0 ? (
                  tableItems.map((issue) => {
                    const score = computePriorityScore(issue);
                    const isFavorite = favoriteSet.has(issue.id);
                    return (
                      <TableRow
                        key={issue.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => navigate(`/admin/qa/${issue.id}`)}
                      >
                        <TableCell className={cellPad}>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(issue.id); }}
                            title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                            className="text-muted-foreground hover:text-yellow-500"
                          >
                            <Star className={cn("h-4 w-4", isFavorite && "fill-yellow-400 text-yellow-500")} />
                          </button>
                        </TableCell>
                        <TableCell className={cn("font-mono text-xs font-semibold text-primary", cellPad)}>
                          #{issue.issue_number}
                        </TableCell>
                        {showCol("prioridade_ia") && (
                          <TableCell className={cellPad} onClick={(e) => e.stopPropagation()}>
                            <QaPriorityBadge result={score} />
                          </TableCell>
                        )}
                        <TableCell className={cn("max-w-[260px]", cellPad)}>
                          <div className="font-medium text-sm truncate" title={issue.title}>{issue.title}</div>
                          {!isCompact && issue.error_message ? (
                            <div className="text-xs text-muted-foreground truncate" title={issue.error_message}>
                              {issue.error_message}
                            </div>
                          ) : null}
                        </TableCell>
                        {showCol("modulo") && <TableCell className={cn("text-sm", cellPad)}>{issue.module}</TableCell>}
                        {showCol("severidade") && (
                          <TableCell className={cellPad}>
                            <Badge variant="outline" className={`text-[10px] uppercase ${QA_SEVERITY_COLORS[issue.severity as keyof typeof QA_SEVERITY_COLORS] ?? ""}`}>
                              {qaLabel.severity(issue.severity)}
                            </Badge>
                          </TableCell>
                        )}
                        {showCol("status") && (
                          <TableCell className={cellPad}>
                            <Badge className={`${QA_STATUS_COLORS[issue.status as QaStatus] ?? "bg-gray-500"} text-white border-0 text-[10px]`}>
                              {qaLabel.status(issue.status)}
                            </Badge>
                          </TableCell>
                        )}
                        {showCol("origem") && <TableCell className={cn("text-sm", cellPad)}>{qaLabel.origin(issue.origin)}</TableCell>}
                        {showCol("ambiente") && <TableCell className={cn("text-sm", cellPad)}>{qaLabel.environment(issue.environment)}</TableCell>}
                        {showCol("responsavel") && (
                          <TableCell className={cellPad}>
                            {issue.assigned_to ? (
                              <Badge variant="outline" className="text-xs font-normal">
                                {profileName(issue.assignedToProfile).split(" ")[0]}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Nenhum</span>
                            )}
                          </TableCell>
                        )}
                        {showCol("data") && (
                          <TableCell className={cn("text-sm text-muted-foreground", cellPad)}>
                            {format(new Date(issue.created_at), "dd MMM, HH:mm", { locale: ptBR })}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                      <Bug className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      {hasActiveFilters || prefs.onlyFavorites
                        ? "Nenhum problema encontrado com os filtros atuais."
                        : "Nenhum problema registrado ainda. Clique em “Novo Problema” para começar."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {!isLoading && !error && totalItems > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                {totalItems} problema(s) — página {currentPage} de {totalPages}
                {isFetching && <Loader2 className="h-3 w-3 animate-spin inline ml-2" />}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Novo Problema */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar novo problema</DialogTitle>
            <DialogDescription>
              O problema entra com status “Novo” e segue o ciclo de vida até a homologação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="qa-title">Título *</Label>
              <Input id="qa-title" value={form.title} maxLength={200}
                onChange={(e) => setField("title")(e.target.value)}
                placeholder="Resumo objetivo do problema (mín. 3 caracteres)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-description">Descrição</Label>
              <Textarea id="qa-description" value={form.description} rows={3}
                onChange={(e) => setField("description")(e.target.value)}
                placeholder="Contexto completo do problema" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qa-module">Módulo *</Label>
                <Input id="qa-module" value={form.module} maxLength={80}
                  onChange={(e) => setField("module")(e.target.value)}
                  placeholder="ex.: leiloes, fretes, viagens" />
              </div>
              <div className="space-y-1.5">
                <Label>Severidade</Label>
                <Select value={form.severity} onValueChange={setField("severity")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QA_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{QA_SEVERITY_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={setField("priority")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QA_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{QA_PRIORITY_LABELS[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={form.origin} onValueChange={setField("origin")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QA_ORIGINS.map((o) => <SelectItem key={o} value={o}>{QA_ORIGIN_LABELS[o]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ambiente</Label>
                <Select value={form.environment} onValueChange={setField("environment")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QA_ENVIRONMENTS.map((e) => <SelectItem key={e} value={e}>{QA_ENVIRONMENT_LABELS[e]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-version">Versão atual</Label>
                <Input id="qa-version" value={form.current_version}
                  onChange={(e) => setField("current_version")(e.target.value)} placeholder="ex.: 2.14.0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-commit">Commit</Label>
                <Input id="qa-commit" value={form.commit_hash}
                  onChange={(e) => setField("commit_hash")(e.target.value)} placeholder="hash (7–40 hex)" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-build">Build</Label>
                <Input id="qa-build" value={form.build_number}
                  onChange={(e) => setField("build_number")(e.target.value)} placeholder="nº do build" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-browser">Navegador</Label>
                <Input id="qa-browser" value={form.browser}
                  onChange={(e) => setField("browser")(e.target.value)} placeholder="ex.: Chrome 126" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-device">Dispositivo</Label>
                <Input id="qa-device" value={form.device}
                  onChange={(e) => setField("device")(e.target.value)} placeholder="ex.: Desktop, Moto G" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-os">Sistema operacional</Label>
                <Input id="qa-os" value={form.operating_system}
                  onChange={(e) => setField("operating_system")(e.target.value)} placeholder="ex.: Windows 11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-error">Mensagem de erro</Label>
              <Input id="qa-error" value={form.error_message}
                onChange={(e) => setField("error_message")(e.target.value)} placeholder="mensagem exata do erro" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-stack">Stack trace</Label>
              <Textarea id="qa-stack" value={form.stack_trace} rows={3} className="font-mono text-xs"
                onChange={(e) => setField("stack_trace")(e.target.value)} placeholder="stack trace completo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-steps">Passos para reproduzir</Label>
              <Textarea id="qa-steps" value={form.steps_to_reproduce} rows={3}
                onChange={(e) => setField("steps_to_reproduce")(e.target.value)}
                placeholder={"1. Acessar...\n2. Clicar em...\n3. Observar..."} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qa-expected">Comportamento esperado</Label>
                <Textarea id="qa-expected" value={form.expected_behavior} rows={2}
                  onChange={(e) => setField("expected_behavior")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-actual">Comportamento atual</Label>
                <Textarea id="qa-actual" value={form.actual_behavior} rows={2}
                  onChange={(e) => setField("actual_behavior")(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || form.title.trim().length < 3}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar Problema
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
