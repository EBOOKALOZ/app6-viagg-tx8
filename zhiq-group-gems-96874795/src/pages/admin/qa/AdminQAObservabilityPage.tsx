/**
 * ORION-QA Fase 3 — Observabilidade (/admin/qa/observabilidade).
 * Visão unificada do ecossistema: dashboard executivo, timeline de eventos,
 * central de alertas, releases e integrações registradas.
 * Admin-only (RLS is_admin() no banco; rota sob ProtectedRoute requireAdmin).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellOff,
  Bug,
  CheckCircle2,
  Clock,
  GitCommitHorizontal,
  Loader2,
  Package,
  Plug,
  Plus,
  Radio,
  Rocket,
  ShieldAlert,
  Timer,
  TrendingUp,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { qaIntegrations } from "@/services/qa/integrations";
import {
  QA_EVENT_SEVERITIES, QA_EVENT_SEVERITY_LABELS, QA_EVENT_SOURCE_LABELS, QA_EVENT_SOURCES,
  QA_EVENT_TYPE_LABELS, type QaAlertRecord, type QaEventRecord, type QaEventSeverity,
  type QaEventSource, type QaEventType, type QaIntegrationRunRecord, type QaReleaseRecord,
} from "@/services/qa/events";
import {
  acknowledgeQaAlert, buildExecutiveDashboard, createQaRelease, getReleaseIssueCounts,
  listQaAlerts, listQaEvents, listQaReleases, listQaRuns, rankBy, updateQaReleaseStatus,
} from "@/services/qa/observability";
import { listQaIssues } from "@/services/qa/qaIssues";

const SEVERITY_STYLES: Record<QaEventSeverity, string> = {
  info: "bg-blue-100 text-blue-800 border-blue-200",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
  error: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200 font-bold",
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  erro_critico: "Erro crítico",
  deploy_falha: "Deploy com falha",
  rollback: "Rollback",
  migration_erro: "Migration com erro",
  build_quebrado: "Build quebrado",
  teste_reprovado: "Teste reprovado",
  performance_degradada: "Performance degradada",
  seguranca: "Segurança",
};

const RUN_STATUS_LABELS: Record<string, string> = {
  executando: "Executando",
  aprovado: "Aprovado",
  aprovado_com_ressalvas: "Aprovado c/ ressalvas",
  reprovado: "Reprovado",
  erro: "Erro",
  cancelado: "Cancelado",
};

const RUN_STATUS_STYLES: Record<string, string> = {
  executando: "bg-blue-500",
  aprovado: "bg-green-600",
  aprovado_com_ressalvas: "bg-yellow-500",
  reprovado: "bg-red-500",
  erro: "bg-red-700",
  cancelado: "bg-gray-500",
};

const RELEASE_STATUSES = ["planejada", "em_homologacao", "publicada", "rollback"] as const;

const RELEASE_STATUS_LABELS: Record<(typeof RELEASE_STATUSES)[number], string> = {
  planejada: "Planejada",
  em_homologacao: "Em homologação",
  publicada: "Publicada",
  rollback: "Rollback",
};

function eventTypeLabel(type: string): string {
  return QA_EVENT_TYPE_LABELS[type as QaEventType] ?? type;
}

function sourceLabel(source: string): string {
  return QA_EVENT_SOURCE_LABELS[source as QaEventSource] ?? source;
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function when(ts: string): string {
  return format(new Date(ts), "dd MMM yyyy, HH:mm:ss", { locale: ptBR });
}

export default function AdminQAObservabilityPage() {
  const queryClient = useQueryClient();

  const [sourceFilter, setSourceFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [onlyOpenAlerts, setOnlyOpenAlerts] = useState(true);
  const [newRelease, setNewRelease] = useState({ version: "", name: "", notes: "" });

  const { data: runs, isLoading: runsLoading, error: runsError } = useQuery({
    queryKey: ["qa-obs-runs"],
    queryFn: () => listQaRuns("all", 200),
    refetchInterval: 30_000,
  });

  const { data: alerts, isLoading: alertsLoading, error: alertsError } = useQuery({
    queryKey: ["qa-obs-alerts", onlyOpenAlerts],
    queryFn: () => listQaAlerts(onlyOpenAlerts),
    refetchInterval: 30_000,
  });

  const { data: events, isLoading: eventsLoading, error: eventsError } = useQuery({
    queryKey: ["qa-obs-events", sourceFilter, severityFilter],
    queryFn: () => listQaEvents({ source: sourceFilter, severity: severityFilter, limit: 200 }),
    refetchInterval: 30_000,
  });

  const { data: allIssues } = useQuery({
    queryKey: ["qa-issues-all"],
    queryFn: () => listQaIssues({}),
  });

  const { data: releases, isLoading: releasesLoading, error: releasesError } = useQuery({
    queryKey: ["qa-obs-releases"],
    queryFn: listQaReleases,
  });

  const { data: releaseCounts } = useQuery({
    queryKey: ["qa-obs-release-counts", (releases ?? []).map((r) => r.version).join("|")],
    queryFn: () => getReleaseIssueCounts((releases ?? []).map((r) => r.version)),
    enabled: (releases?.length ?? 0) > 0,
  });

  const dashboard = useMemo(
    () => buildExecutiveDashboard(runs ?? [], alerts ?? [], events ?? []),
    [runs, alerts, events],
  );

  const openAlertCount = useMemo(
    () => (alerts ?? []).filter((a) => !a.acknowledged_at).length,
    [alerts],
  );

  const porModulo = useMemo(() => rankBy(allIssues ?? [], (i) => i.module), [allIssues]);
  const porRelease = useMemo(
    () => rankBy(allIssues ?? [], (i) => i.fixed_version ?? i.current_version),
    [allIssues],
  );
  const porCommit = useMemo(() => rankBy(allIssues ?? [], (i) => i.commit_hash), [allIssues]);

  const lastRunBySource = useMemo(() => {
    const map = new Map<string, QaIntegrationRunRecord>();
    for (const run of runs ?? []) {
      if (!map.has(run.source)) map.set(run.source, run);
    }
    return map;
  }, [runs]);

  const ackMutation = useMutation({
    mutationFn: (alert: QaAlertRecord) => acknowledgeQaAlert(alert.id),
    onSuccess: () => {
      toast.success("Alerta reconhecido.");
      queryClient.invalidateQueries({ queryKey: ["qa-obs-alerts"] });
    },
    onError: (err: Error) => toast.error(`Erro ao reconhecer alerta: ${err.message}`),
  });

  const createReleaseMutation = useMutation({
    mutationFn: () => createQaRelease(newRelease),
    onSuccess: (release) => {
      toast.success(`Release ${release.version} registrada.`);
      setNewRelease({ version: "", name: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["qa-obs-releases"] });
    },
    onError: (err: Error) => toast.error(`Erro ao registrar release: ${err.message}`),
  });

  const releaseStatusMutation = useMutation({
    mutationFn: ({ release, status }: {
      release: QaReleaseRecord;
      status: (typeof RELEASE_STATUSES)[number];
    }) => updateQaReleaseStatus(release, status),
    onSuccess: (release) => {
      toast.success(`Release ${release.version}: ${RELEASE_STATUS_LABELS[release.status as (typeof RELEASE_STATUSES)[number]] ?? release.status}.`);
      queryClient.invalidateQueries({ queryKey: ["qa-obs-releases"] });
    },
    onError: (err: Error) => toast.error(`Erro ao atualizar release: ${err.message}`),
  });

  const statCards: { title: string; value: string; icon: React.ElementType; accent: string }[] = [
    { title: "Deploys", value: String(dashboard.deploys), icon: Rocket, accent: "text-foreground" },
    { title: "Deploys com falha", value: String(dashboard.deploysComFalha), icon: AlertTriangle, accent: dashboard.deploysComFalha > 0 ? "text-red-600" : "text-muted-foreground" },
    { title: "Builds", value: String(dashboard.builds), icon: Wrench, accent: "text-foreground" },
    { title: "Builds quebrados", value: String(dashboard.buildsQuebrados), icon: Bug, accent: dashboard.buildsQuebrados > 0 ? "text-red-600" : "text-muted-foreground" },
    { title: "Execuções de teste", value: String(dashboard.execucoesTeste), icon: Activity, accent: "text-blue-600" },
    { title: "Testes reprovados", value: String(dashboard.testesReprovados), icon: ShieldAlert, accent: dashboard.testesReprovados > 0 ? "text-orange-600" : "text-muted-foreground" },
    { title: "Taxa de sucesso", value: dashboard.taxaSucesso !== null ? `${dashboard.taxaSucesso}%` : "—", icon: TrendingUp, accent: "text-emerald-600" },
    { title: "Tempo médio de execução", value: formatMs(dashboard.tempoMedioMs), icon: Timer, accent: "text-purple-600" },
    { title: "Alertas abertos", value: String(dashboard.alertasAbertos), icon: Bell, accent: dashboard.alertasAbertos > 0 ? "text-red-600" : "text-green-600" },
    { title: "Eventos (24h)", value: String(dashboard.eventos24h), icon: Radio, accent: "text-cyan-600" },
  ];

  const anyError = runsError ?? alertsError ?? eventsError;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Observabilidade ORION-QA
          </h1>
          <p className="text-muted-foreground">
            Núcleo de monitoramento do ecossistema — eventos, deploys, alertas, releases e integrações.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/admin/qa">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Central de Problemas
          </Link>
        </Button>
      </div>

      {anyError ? (
        <p className="text-sm text-red-500">
          Erro ao carregar observabilidade: {(anyError as Error).message}
        </p>
      ) : null}

      <Tabs defaultValue="visao-geral" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="alertas" className="gap-1.5">
            Alertas
            {openAlertCount > 0 && (
              <Badge className="bg-red-600 text-white border-0 h-5 px-1.5">{openAlertCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="releases">Releases</TabsTrigger>
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
        </TabsList>

        {/* ── Visão Geral (Dashboard Executivo) ─────────────────────────── */}
        <TabsContent value="visao-geral" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {runsLoading || alertsLoading || eventsLoading
              ? Array.from({ length: 10 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-[88px] rounded-xl" />
                ))
              : statCards.map((card) => (
                  <Card key={card.title}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <card.icon className={`h-7 w-7 shrink-0 ${card.accent}`} />
                      <div className="min-w-0">
                        <p className={`text-xl font-bold leading-tight ${card.accent}`}>{card.value}</p>
                        <p className="text-[11px] text-muted-foreground truncate" title={card.title}>
                          {card.title}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              { title: "Problemas por módulo", icon: Package, rows: porModulo },
              { title: "Problemas por release", icon: Rocket, rows: porRelease },
              { title: "Problemas por commit", icon: GitCommitHorizontal, rows: porCommit },
            ] as const).map((section) => (
              <Card key={section.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <section.icon className="h-4 w-4 text-primary" />
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {section.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Sem dados ainda.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {section.rows.map((row) => (
                        <li key={row.label} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-mono text-xs" title={row.label}>{row.label}</span>
                          <Badge variant="outline">{row.count}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Últimas execuções de integrações
              </CardTitle>
              <CardDescription>SHC, Test Lab, Playwright, QA Wolf, BrowserStack e Pipeline.</CardDescription>
            </CardHeader>
            <CardContent>
              <RunsTable runs={(runs ?? []).slice(0, 12)} loading={runsLoading} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Timeline (visão unificada) ────────────────────────────────── */}
        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardContent className="pt-4 flex flex-wrap gap-3">
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Origens</SelectItem>
                  {QA_EVENT_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{QA_EVENT_SOURCE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Severidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Severidades</SelectItem>
                  {QA_EVENT_SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>{QA_EVENT_SEVERITY_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground self-center ml-auto">
                Atualização automática a cada 30s.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              {eventsLoading ? (
                <div className="py-10 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : (events ?? []).length === 0 ? (
                <p className="py-10 text-center text-muted-foreground">
                  <Radio className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhum evento registrado ainda.
                </p>
              ) : (
                <ol className="space-y-3">
                  {(events ?? []).map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Central de Alertas ────────────────────────────────────────── */}
        <TabsContent value="alertas" className="space-y-4">
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <Switch id="qa-only-open" checked={onlyOpenAlerts} onCheckedChange={setOnlyOpenAlerts} />
              <Label htmlFor="qa-only-open" className="text-sm">Somente alertas não reconhecidos</Label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              {alertsLoading ? (
                <div className="py-10 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : (alerts ?? []).length === 0 ? (
                <p className="py-10 text-center text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhum alerta {onlyOpenAlerts ? "aberto" : "registrado"}.
                </p>
              ) : (
                <ul className="space-y-3">
                  {(alerts ?? []).map((alert) => (
                    <li key={alert.id} className="flex items-start justify-between gap-3 border rounded-lg p-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={SEVERITY_STYLES[alert.severity as QaEventSeverity] ?? ""}>
                            {ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type}
                          </Badge>
                          <Badge variant="outline" className="text-xs font-normal">{sourceLabel(alert.source)}</Badge>
                          <span className="text-xs text-muted-foreground">{when(alert.created_at)}</span>
                        </div>
                        <p className="text-sm font-medium break-words">{alert.title}</p>
                        {alert.message ? (
                          <p className="text-xs text-muted-foreground break-words">{alert.message}</p>
                        ) : null}
                        {alert.acknowledged_at ? (
                          <p className="text-xs text-green-600">
                            Reconhecido em {when(alert.acknowledged_at)}
                          </p>
                        ) : null}
                      </div>
                      {!alert.acknowledged_at && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => ackMutation.mutate(alert)}
                          disabled={ackMutation.isPending}
                        >
                          <BellOff className="h-4 w-4 mr-1.5" />
                          Reconhecer
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Releases ──────────────────────────────────────────────────── */}
        <TabsContent value="releases" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Nova release</CardTitle>
              <CardDescription>
                Correlação automática: corrigidos = problemas com “versão corrigida” igual à release;
                conhecidos = problemas abertos com “versão atual” igual à release.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qa-rel-version">Versão *</Label>
                <Input id="qa-rel-version" value={newRelease.version} maxLength={60}
                  placeholder="ex.: 2.15.0"
                  onChange={(e) => setNewRelease((r) => ({ ...r, version: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-rel-name">Nome</Label>
                <Input id="qa-rel-name" value={newRelease.name}
                  placeholder="ex.: Convênios Fase 2"
                  onChange={(e) => setNewRelease((r) => ({ ...r, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="qa-rel-notes">Notas</Label>
                <Textarea id="qa-rel-notes" value={newRelease.notes} rows={1}
                  onChange={(e) => setNewRelease((r) => ({ ...r, notes: e.target.value }))} />
              </div>
              <div className="md:col-span-4 flex justify-end">
                <Button
                  onClick={() => createReleaseMutation.mutate()}
                  disabled={createReleaseMutation.isPending || newRelease.version.trim().length === 0}
                >
                  {createReleaseMutation.isPending
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <Plus className="h-4 w-4 mr-2" />}
                  Registrar Release
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Versão</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-[190px]">Status</TableHead>
                    <TableHead className="w-[120px]">Corrigidos</TableHead>
                    <TableHead className="w-[120px]">Conhecidos</TableHead>
                    <TableHead className="w-[160px]">Publicada em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {releasesLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : releasesError ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-red-500">
                        Erro ao carregar releases: {(releasesError as Error).message}
                      </TableCell>
                    </TableRow>
                  ) : (releases ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        Nenhuma release registrada ainda.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (releases ?? []).map((release) => {
                      const counts = releaseCounts?.get(release.version);
                      return (
                        <TableRow key={release.id}>
                          <TableCell className="font-mono text-sm font-semibold">{release.version}</TableCell>
                          <TableCell className="text-sm">{release.name || "—"}</TableCell>
                          <TableCell>
                            <Select
                              value={release.status}
                              onValueChange={(status) =>
                                releaseStatusMutation.mutate({
                                  release,
                                  status: status as (typeof RELEASE_STATUSES)[number],
                                })
                              }
                            >
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {RELEASE_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>{RELEASE_STATUS_LABELS[s]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-green-600 text-white border-0">{counts?.fixed ?? 0}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${(counts?.known ?? 0) > 0 ? "bg-orange-500" : "bg-gray-400"} text-white border-0`}>
                              {counts?.known ?? 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {release.released_at ? when(release.released_at) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ── Integrações ───────────────────────────────────────────────── */}
        <TabsContent value="integracoes" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {qaIntegrations.list().map((integration) => {
              const lastRun = lastRunBySource.get(integration.source);
              return (
                <Card key={integration.source}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <Plug className="h-4 w-4 text-primary" />
                        {integration.label}
                      </span>
                      <Badge
                        className={`${integration.status === "ativa" ? "bg-green-600" : "bg-blue-500"} text-white border-0 text-[10px] uppercase`}
                      >
                        {integration.status}
                      </Badge>
                    </CardTitle>
                    <CardDescription>v{integration.version}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                      {integration.captures.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                    {lastRun ? (
                      <p className="text-xs pt-1 border-t">
                        Última execução: {when(lastRun.started_at)} —{" "}
                        <Badge className={`${RUN_STATUS_STYLES[lastRun.status] ?? "bg-gray-500"} text-white border-0 text-[10px]`}>
                          {RUN_STATUS_LABELS[lastRun.status] ?? lastRun.status}
                        </Badge>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic pt-1 border-t">
                        Nenhuma execução registrada.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EventRow({ event }: { event: QaEventRecord }) {
  return (
    <li className="flex items-start gap-3 border-l-2 border-border pl-3">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={SEVERITY_STYLES[event.severity as QaEventSeverity] ?? ""}>
            {eventTypeLabel(event.event_type)}
          </Badge>
          <Badge variant="outline" className="text-xs font-normal">{sourceLabel(event.source)}</Badge>
          {event.module ? (
            <Badge variant="outline" className="text-xs font-normal">{event.module}</Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">{when(event.created_at)}</span>
        </div>
        <p className="text-sm break-words">
          {event.issue_id ? (
            <Link to={`/admin/qa/${event.issue_id}`} className="hover:underline text-primary">
              {event.title}
            </Link>
          ) : (
            event.title
          )}
        </p>
        {(event.commit_hash || event.branch || event.release_version) && (
          <p className="text-xs text-muted-foreground font-mono">
            {[
              event.release_version ? `v${event.release_version}` : null,
              event.branch,
              event.commit_hash?.slice(0, 10),
            ].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}

function RunsTable({ runs, loading }: { runs: QaIntegrationRunRecord[]; loading: boolean }) {
  return (
    <div className="rounded-md border border-border/50 overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>Origem</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Testes</TableHead>
            <TableHead className="text-right">Falhas</TableHead>
            <TableHead className="text-right">Tempo</TableHead>
            <TableHead>Módulo</TableHead>
            <TableHead>Início</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={8} className="h-20 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : runs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                Nenhuma execução registrada ainda.
              </TableCell>
            </TableRow>
          ) : (
            runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="text-sm">{sourceLabel(run.source)}</TableCell>
                <TableCell className="text-sm">{run.kind}</TableCell>
                <TableCell>
                  <Badge className={`${RUN_STATUS_STYLES[run.status] ?? "bg-gray-500"} text-white border-0 text-[10px]`}>
                    {RUN_STATUS_LABELS[run.status] ?? run.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-sm">{run.total}</TableCell>
                <TableCell className={`text-right text-sm ${run.failed > 0 ? "text-red-600 font-semibold" : ""}`}>
                  {run.failed}
                </TableCell>
                <TableCell className="text-right text-sm">{formatMs(run.duration_ms)}</TableCell>
                <TableCell className="text-sm">{run.module ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{when(run.started_at)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
