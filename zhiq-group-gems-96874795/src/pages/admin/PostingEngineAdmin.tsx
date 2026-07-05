/**
 * PostingEngineAdmin — Centro de Controle do Motor Universal de Postagens
 * Tier 2.2: Dashboard único para todos os perfis (Lojista / Motorista / Moto Táxi / Motoboy)
 *
 * Abas: Dashboard · Workers · Campanhas · Fila · DLQ · Rate Limit · Alertas · Métricas · Auditoria
 * Filtro global por perfil de origem.
 */

import { useState, useEffect, useCallback } from "react";
import {
  BarChart2, Cpu, Megaphone, List, AlertTriangle,
  Gauge, Bell, TrendingUp, FileText, RefreshCw,
  CheckCircle2, XCircle, Clock, Zap, Activity,
  Users, Trash2, RotateCcw, Filter, ChevronRight,
  Shield, Lock, Calendar, Settings, Heart,
  History, DollarSign, UserCheck, Key,
  Flag, Link2, Globe, Database, GitBranch, Archive, Bot,
  ToggleLeft, ToggleRight, Copy, Package, Star, Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* ── Tipos ─────────────────────────────────────────────────────────────── */
type ProfileFilter = "all" | "lojista" | "driver" | "motoboy" | "mototaxi";

type DashboardSummary = {
  profile_type:       string;
  total_campaigns:    number;
  draft:              number;
  ready:              number;
  queued:             number;
  generating:         number;
  posting:            number;
  waiting:            number;
  paused:             number;
  completed:          number;
  cancelled:          number;
  error:              number;
  expired:            number;
  campaigns_today:    number;
};

type Worker = {
  id:             string;
  worker_name:    string;
  status:         string;
  last_heartbeat: string | null;
  version:        string | null;
  cpu_percent:    number | null;
  memory_mb:      number | null;
  created_at:     string;
};

type Campaign = {
  id:                  string;
  user_id:             string;
  name:                string | null;
  status:              string;
  priority:            string;
  origin_profile_type: string;
  retry_count:         number;
  created_at:          string;
  updated_at:          string;
};

type DLQSummary = {
  total:     number;
  failed:    number;
  retrying:  number;
  recovered: number;
  discarded: number;
  retriable: number;
  by_profile?: Record<string, number>;
};

type MetricRow = {
  date:             string;
  profile_type:     string;
  lots_created:     number;
  lots_posted:      number;
  lots_failed:      number;
  campaigns_run:    number;
  avg_post_time_ms: number | null;
};

type AlertHistoryRow = {
  id:           string;
  rule_name:    string;
  message:      string;
  severity:     string;
  fired_at:     string;
  acknowledged_at: string | null;
  resolved_at:  string | null;
};

type EventLogRow = {
  id:         string;
  event_type: string;
  profile:    string | null;
  success:    boolean;
  timestamp:  string;
  origin:     string | null;
};

type RateLimitRow = {
  profile_type:   string;
  max_per_minute: number;
  max_per_hour:   number;
  max_per_day:    number;
};

/* ── Novos tipos PRÉ-2.3 ──────────────────────────────────────────────── */

type MotorHealth = {
  workers_online:    number;
  workers_offline:   number;
  workers_busy:      number;
  last_heartbeat:    string | null;
  lots_available:    number;
  lots_processing:   number;
  lots_posted_total: number;
  campaigns_active:  number;
  campaigns_paused:  number;
  campaigns_error:   number;
  completed_today:   number;
  dlq_failed:        number;
  active_locks:      number;
  errors_last_hour:  number;
  avg_post_ms:       number;
  health_score:      number;
  health_status:     "excellent" | "good" | "warning" | "critical";
  checked_at:        string;
};

type ChangeLogRow = {
  id:          string;
  campaign_id: string;
  changed_by:  string | null;
  changed_at:  string;
  field_name:  string;
  old_value:   string | null;
  new_value:   string | null;
  origin:      string;
};

type ConfigRow = {
  key:                string;
  value:              string;
  value_type:         string;
  description:        string | null;
  module:             string;
  is_editable_admin:  boolean;
  updated_at:         string;
};

type SystemRole = {
  id:           string;
  name:         string;
  display_name: string;
  description:  string | null;
  is_system:    boolean;
  sort_order:   number;
};

type SystemPermission = {
  id:          string;
  name:        string;
  module:      string;
  description: string | null;
};

type CommissionSummary = {
  profile_type:     string;
  pending_count:    number;
  approved_count:   number;
  cancelled_count:  number;
  paid_count:       number;
  pending_cents:    number;
  approved_cents:   number;
  paid_cents:       number;
  unique_operators: number;
};

/* ── Novos tipos Tier 2.2.5 ───────────────────────────────────────────── */

type FeatureFlag = {
  id:                 string;
  key:                string;
  name:               string;
  description:        string | null;
  is_enabled:         boolean;
  allowed_profiles:   string[] | null;
  rollout_percentage: number;
  environment:        string;
  expires_at:         string | null;
  updated_at:         string;
};

type WebhookEndpointRow = {
  id:                 string;
  tenant_id:          string;
  name:               string;
  url:                string;
  events:             string[];
  is_active:          boolean;
  timeout_ms:         number;
  retry_count:        number;
  created_at:         string;
  total_deliveries:   number;
  failed_deliveries:  number;
};

type VersionEntry = {
  version:          string;
  description:      string | null;
  migration_number: number | null;
  deployed_at:      string;
  changelog:        string | null;
};

type CacheStatusRow = {
  key:                    string;
  fresh:                  boolean;
  expires_at:             string;
  refreshed_at:           string;
  hit_count:              number;
  ttl_remaining_seconds:  number;
};

type SnapshotEntry = {
  id:           string;
  label:        string;
  trigger:      string;
  modules:      string[];
  is_pinned:    boolean;
  created_at:   string;
  notes:        string | null;
  module_count: number;
};

type SchedulerHour = {
  profile_type:    string;
  hour_of_day:     number;
  total:           number;
  successes:       number;
  failures:        number;
  success_rate_pct: number;
  data_days:       number;
  rank:            number;
  confidence:      string;
};

type WorkerRanking = {
  worker_id:       string;
  worker_name:     string;
  status:          string;
  profile_type:    string;
  success_rate_pct: number;
  total_events_30d: number;
  rank_in_profile: number;
};

type AiInsight = {
  high_error_campaigns: { id: string; name: string; profile_type: string; error_count: number }[] | null;
  idle_campaigns:       { id: string; name: string; origin_profile_type: string; idle_duration: string }[] | null;
  overloaded_workers:   { id: string; name: string; assigned_campaigns: number }[] | null;
  best_posting_hours:   { hour_of_day: number; success_rate_pct: number; total: number }[] | null;
  profile_performance:  { profile_type: string; completion_rate_pct: number; total_campaigns: number }[] | null;
  computed_at:          string;
};

type ProfileEngineConfigRow = {
  profile_type:       string;
  max_per_minute:     number | null;
  max_per_hour:       number | null;
  max_per_day:        number | null;
  cooldown_seconds:   number | null;
  max_retries:        number | null;
  balancing_strategy: string;
  default_priority:   string | null;
  max_lot_size:       number | null;
  is_active:          boolean;
  notes:              string | null;
};

/* ── Helpers ────────────────────────────────────────────────────────────── */
const PROFILE_COLOR: Record<string, string> = {
  lojista:  "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  driver:   "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  motoboy:  "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
  mototaxi: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",
};

const STATUS_COLOR: Record<string, string> = {
  idle:       "text-emerald-500",
  busy:       "text-amber-500",
  dead:       "text-red-500",
  starting:   "text-blue-500",
  paused:     "text-zinc-400",
  stopping:   "text-orange-400",
  completed:  "text-emerald-500",
  error:      "text-red-500",
  queued:     "text-blue-500",
  posting:    "text-violet-500",
  cancelled:  "text-zinc-400",
  ready:      "text-sky-500",
  draft:      "text-zinc-400",
  generating: "text-amber-500",
  waiting:    "text-orange-400",
  expired:    "text-zinc-500",
  failed:     "text-red-500",
  retrying:   "text-amber-500",
  recovered:  "text-emerald-500",
  discarded:  "text-zinc-500",
};

function ProfileBadge({ profile }: { profile: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PROFILE_COLOR[profile] ?? "bg-zinc-100 text-zinc-600"}`}>
      {profile}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  return <span className={`font-semibold text-sm capitalize ${STATUS_COLOR[status] ?? "text-zinc-500"}`}>{status}</span>;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

const TABS = [
  { key: "dashboard",   label: "Dashboard",    icon: BarChart2 },
  { key: "saude",       label: "Saúde",        icon: Heart },
  { key: "workers",     label: "Workers",      icon: Cpu },
  { key: "campanhas",   label: "Campanhas",    icon: Megaphone },
  { key: "fila",        label: "Fila",         icon: List },
  { key: "dlq",         label: "DLQ",          icon: AlertTriangle },
  { key: "ratelimit",   label: "Rate Limit",   icon: Gauge },
  { key: "alertas",     label: "Alertas",      icon: Bell },
  { key: "metricas",    label: "Métricas",     icon: TrendingUp },
  { key: "auditoria",   label: "Auditoria",    icon: FileText },
  { key: "historico",   label: "Histórico",    icon: History },
  { key: "config",      label: "Config",       icon: Settings },
  { key: "papeis",      label: "Papéis",       icon: UserCheck },
  { key: "permissoes",  label: "Permissões",   icon: Key },
  { key: "comissoes",   label: "Comissões",    icon: DollarSign },
  // Tier 2.2.5
  { key: "flags",       label: "Feature Flags", icon: Flag },
  { key: "webhooks",    label: "Webhooks",      icon: Link2 },
  { key: "apis",        label: "APIs",          icon: Globe },
  { key: "cache",       label: "Cache",         icon: Database },
  { key: "versoes",     label: "Versões",       icon: GitBranch },
  { key: "backup",      label: "Backup",        icon: Archive },
  { key: "scheduler",   label: "Scheduler IA",  icon: Bot },
];

const PROFILES: { key: ProfileFilter; label: string }[] = [
  { key: "all",      label: "Todos"     },
  { key: "lojista",  label: "Lojista"   },
  { key: "driver",   label: "Motorista" },
  { key: "motoboy",  label: "Motoboy"   },
  { key: "mototaxi", label: "Moto Táxi" },
];

/* ══════════════════════════════════════════════════════════════════════════
 * COMPONENTE PRINCIPAL
 * ══════════════════════════════════════════════════════════════════════════ */

export default function PostingEngineAdmin() {
  const [tab,     setTab]     = useState("dashboard");
  const [profile, setProfile] = useState<ProfileFilter>("all");
  const [loading, setLoading] = useState(false);

  // Estado por aba
  const [summary,     setSummary]    = useState<DashboardSummary[]>([]);
  const [workers,     setWorkers]    = useState<Worker[]>([]);
  const [campaigns,   setCampaigns]  = useState<Campaign[]>([]);
  const [dlqSummary,  setDlqSummary] = useState<DLQSummary | null>(null);
  const [metrics,     setMetrics]    = useState<MetricRow[]>([]);
  const [alerts,      setAlerts]     = useState<AlertHistoryRow[]>([]);
  const [events,      setEvents]     = useState<EventLogRow[]>([]);
  const [rateLimits,  setRateLimits] = useState<RateLimitRow[]>([]);
  const [lotCount,    setLotCount]   = useState<number>(0);
  // PRÉ-2.3
  const [health,      setHealth]     = useState<MotorHealth | null>(null);
  const [changeLog,   setChangeLog]  = useState<ChangeLogRow[]>([]);
  const [configs,     setConfigs]    = useState<ConfigRow[]>([]);
  const [roles,       setRoles]      = useState<SystemRole[]>([]);
  const [permissions, setPermissions]= useState<SystemPermission[]>([]);
  const [commissions, setCommissions]= useState<CommissionSummary[]>([]);
  // Tier 2.2.5
  const [featureFlags,    setFeatureFlags]    = useState<FeatureFlag[]>([]);
  const [webhookEndpoints,setWebhookEndpoints]= useState<WebhookEndpointRow[]>([]);
  const [versions,        setVersions]        = useState<Record<string, VersionEntry>>({});
  const [cacheStatus,     setCacheStatus]     = useState<CacheStatusRow[]>([]);
  const [snapshots,       setSnapshots]       = useState<SnapshotEntry[]>([]);
  const [schedulerRec,    setSchedulerRec]    = useState<{
    best_hours_by_profile: SchedulerHour[];
    top_workers: WorkerRanking[];
    ai_insights?: AiInsight;
    note?: string;
  } | null>(null);
  const [profileConfigs,  setProfileConfigs]  = useState<ProfileEngineConfigRow[]>([]);

  /* ── Fetch por aba ─────────────────────────────────────────────────── */

  const loadDashboard = useCallback(async () => {
    const { data } = await supabase
      .from("posting_engine_dashboard_summary" as any)
      .select("*");
    setSummary((data ?? []) as DashboardSummary[]);
    const { count } = await supabase
      .from("posting_lots" as any)
      .select("*", { count: "exact", head: true })
      .eq("status", "available");
    setLotCount(count ?? 0);
  }, []);

  const loadWorkers = useCallback(async () => {
    const { data } = await supabase
      .from("posting_workers" as any)
      .select("*")
      .order("last_heartbeat", { ascending: false });
    setWorkers((data ?? []) as Worker[]);
  }, []);

  const loadCampaigns = useCallback(async () => {
    let q = supabase
      .from("posting_campaigns" as any)
      .select("id,user_id,name,status,priority,origin_profile_type,retry_count,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (profile !== "all") q = q.eq("origin_profile_type", profile);
    const { data } = await q;
    setCampaigns((data ?? []) as Campaign[]);
  }, [profile]);

  const loadDLQ = useCallback(async () => {
    const { data } = await supabase.rpc("get_dlq_summary" as any);
    setDlqSummary((data as any) ?? null);
  }, []);

  const loadRateLimits = useCallback(async () => {
    const { data } = await supabase
      .from("rate_limit_config" as any)
      .select("profile_type, max_per_minute, max_per_hour, max_per_day")
      .order("profile_type");
    setRateLimits((data ?? []) as RateLimitRow[]);
  }, []);

  const loadAlerts = useCallback(async () => {
    const { data } = await supabase
      .from("alerts_history" as any)
      .select("id,rule_name,message,severity,fired_at,acknowledged_at,resolved_at")
      .order("fired_at", { ascending: false })
      .limit(30);
    setAlerts((data ?? []) as AlertHistoryRow[]);
  }, []);

  const loadMetrics = useCallback(async () => {
    let q = supabase
      .from("posting_metrics_daily" as any)
      .select("date,profile_type,lots_created,lots_posted,lots_failed,campaigns_run,avg_post_time_ms")
      .order("date", { ascending: false })
      .limit(30);
    if (profile !== "all") q = q.eq("profile_type", profile);
    const { data } = await q;
    setMetrics((data ?? []) as MetricRow[]);
  }, [profile]);

  const loadEvents = useCallback(async () => {
    let q = supabase
      .from("posting_event_log" as any)
      .select("id,event_type,profile,success,timestamp,origin")
      .order("timestamp", { ascending: false })
      .limit(50);
    if (profile !== "all") q = q.eq("profile", profile);
    const { data } = await q;
    setEvents((data ?? []) as EventLogRow[]);
  }, [profile]);

  /* ── PRÉ-2.3: novas loaders ────────────────────────────────────────── */

  const loadHealth = useCallback(async () => {
    const { data } = await supabase.rpc("get_motor_health" as any);
    if (data) setHealth(data as MotorHealth);
  }, []);

  const loadChangeLog = useCallback(async () => {
    const { data } = await supabase
      .from("campaign_change_log" as any)
      .select("id,campaign_id,changed_by,changed_at,field_name,old_value,new_value,origin")
      .order("changed_at", { ascending: false })
      .limit(100);
    setChangeLog((data ?? []) as ChangeLogRow[]);
  }, []);

  const loadConfigs = useCallback(async () => {
    const { data } = await supabase
      .from("motor_universal_config" as any)
      .select("key,value,value_type,description,module,is_editable_admin,updated_at")
      .order("module", { ascending: true })
      .order("key",    { ascending: true });
    setConfigs((data ?? []) as ConfigRow[]);
  }, []);

  const loadRoles = useCallback(async () => {
    const { data } = await supabase
      .from("system_roles" as any)
      .select("id,name,display_name,description,is_system,sort_order")
      .order("sort_order", { ascending: true });
    setRoles((data ?? []) as SystemRole[]);
  }, []);

  const loadPermissions = useCallback(async () => {
    const { data } = await supabase
      .from("system_permissions" as any)
      .select("id,name,module,description")
      .order("module", { ascending: true })
      .order("name",   { ascending: true });
    setPermissions((data ?? []) as SystemPermission[]);
  }, []);

  const loadCommissions = useCallback(async () => {
    const { data } = await supabase
      .from("commission_summary_by_profile" as any)
      .select("*")
      .order("profile_type");
    setCommissions((data ?? []) as CommissionSummary[]);
  }, []);

  /* ── Tier 2.2.5: loaders ───────────────────────────────────────────── */

  const loadFeatureFlags = useCallback(async () => {
    const { data } = await supabase.rpc("get_feature_flags" as any);
    setFeatureFlags((Array.isArray(data) ? data : []) as FeatureFlag[]);
  }, []);

  const loadWebhooks = useCallback(async () => {
    const { data } = await supabase.rpc("get_webhook_endpoints" as any);
    setWebhookEndpoints((Array.isArray(data) ? data : []) as WebhookEndpointRow[]);
  }, []);

  const loadVersions = useCallback(async () => {
    const { data } = await supabase.rpc("get_motor_versions" as any);
    setVersions((data ?? {}) as Record<string, VersionEntry>);
  }, []);

  const loadCacheStatus = useCallback(async () => {
    const { data } = await supabase.rpc("get_cache_status" as any);
    setCacheStatus((Array.isArray(data) ? data : []) as CacheStatusRow[]);
  }, []);

  const loadSnapshots = useCallback(async () => {
    const { data } = await supabase.rpc("list_motor_snapshots" as any, { p_limit: 20 });
    setSnapshots((Array.isArray(data) ? data : []) as SnapshotEntry[]);
  }, []);

  const loadScheduler = useCallback(async () => {
    const [rec, insights] = await Promise.all([
      supabase.rpc("get_scheduler_recommendations" as any),
      supabase.from("motor_ai_insights" as any).select("*").limit(1).single(),
    ]);
    const base = (rec.data ?? {}) as any;
    setSchedulerRec({
      best_hours_by_profile: base.best_hours_by_profile ?? [],
      top_workers:           base.top_workers ?? [],
      ai_insights:           insights.data as AiInsight | undefined,
      note:                  base.note,
    });
  }, []);

  const loadProfileConfigs = useCallback(async () => {
    const { data } = await supabase
      .from("profile_engine_config" as any)
      .select("*")
      .order("profile_type");
    setProfileConfigs((data ?? []) as ProfileEngineConfigRow[]);
  }, []);

  /* ── refresh — todas as loaders ────────────────────────────────────── */
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        tab === "dashboard"  && loadDashboard(),
        tab === "saude"      && loadHealth(),
        tab === "workers"    && loadWorkers(),
        tab === "campanhas"  && loadCampaigns(),
        tab === "dlq"        && loadDLQ(),
        tab === "ratelimit"  && loadRateLimits(),
        tab === "alertas"    && loadAlerts(),
        tab === "metricas"   && loadMetrics(),
        tab === "auditoria"  && loadEvents(),
        tab === "fila"       && loadDashboard(),
        tab === "historico"  && loadChangeLog(),
        tab === "config"     && loadConfigs(),
        tab === "papeis"     && loadRoles(),
        tab === "permissoes" && loadPermissions(),
        tab === "comissoes"  && loadCommissions(),
        tab === "flags"      && loadFeatureFlags(),
        tab === "webhooks"   && loadWebhooks(),
        tab === "versoes"    && loadVersions(),
        tab === "cache"      && loadCacheStatus(),
        tab === "backup"     && loadSnapshots(),
        tab === "scheduler"  && loadScheduler(),
        tab === "apis"       && loadProfileConfigs(),
      ].filter(Boolean));
    } finally {
      setLoading(false);
    }
  }, [tab, loadDashboard, loadWorkers, loadCampaigns, loadDLQ, loadRateLimits, loadAlerts, loadMetrics, loadEvents,
      loadHealth, loadChangeLog, loadConfigs, loadRoles, loadPermissions, loadCommissions,
      loadFeatureFlags, loadWebhooks, loadVersions, loadCacheStatus, loadSnapshots,
      loadScheduler, loadProfileConfigs]);

  useEffect(() => { refresh(); }, [refresh]);

  async function deactivateDeadWorkers() {
    await supabase.rpc("deactivate_dead_workers" as any, { timeout_minutes: 5 });
    await loadWorkers();
  }

  async function cleanupLocks() {
    await supabase.rpc("cleanup_expired_locks" as any);
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  const filteredSummary = profile === "all"
    ? summary
    : summary.filter(s => s.profile_type === profile);

  const totalCampaigns = filteredSummary.reduce((a, s) => a + (s.total_campaigns ?? 0), 0);
  const totalToday     = filteredSummary.reduce((a, s) => a + (s.campaigns_today ?? 0), 0);
  const totalErrors    = filteredSummary.reduce((a, s) => a + (s.error ?? 0), 0);
  const totalActive    = filteredSummary.reduce((a, s) => a + (s.queued ?? 0) + (s.generating ?? 0) + (s.posting ?? 0), 0);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">

      {/* ── Header ── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Activity size={22} className="text-violet-600" />
              Motor Universal · Centro de Controle
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Tier 2.1/2.2 — Todos os perfis · Workers · Campanhas · Fila · DLQ · Métricas
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filtro de perfil */}
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
              <Filter size={14} className="text-zinc-400 ml-1" />
              {PROFILES.map(p => (
                <button
                  key={p.key}
                  onClick={() => setProfile(p.key)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    profile === p.key
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-4 overflow-x-auto scrollbar-hide">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? "bg-violet-600 text-white"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">

        {/* ══ DASHBOARD ══ */}
        {tab === "dashboard" && (
          <div className="space-y-6">
            {/* KPIs globais */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Total Campanhas",  value: totalCampaigns, icon: <Megaphone size={20} className="text-violet-500" /> },
                { label: "Em Execução",       value: totalActive,    icon: <Zap size={20} className="text-amber-500" /> },
                { label: "Hoje",              value: totalToday,     icon: <Calendar size={20} className="text-sky-500" /> },
                { label: "Erros",             value: totalErrors,    icon: <XCircle size={20} className="text-red-500" /> },
                { label: "Fila (Lotes)",      value: lotCount,       icon: <List size={20} className="text-indigo-500" /> },
                { label: "Workers",           value: workers.length || "—", icon: <Cpu size={20} className="text-emerald-500" /> },
                { label: "DLQ Total",         value: dlqSummary?.total ?? "—", icon: <AlertTriangle size={20} className="text-orange-500" /> },
                { label: "DLQ Retriáveis",    value: dlqSummary?.retriable ?? "—", icon: <RotateCcw size={20} className="text-teal-500" /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span></div>
                  <p className="text-2xl font-bold text-zinc-900 dark:text-white">{value}</p>
                </div>
              ))}
            </div>

            {/* Por perfil */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Campanhas por Perfil</h2>
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                    <tr>
                      {["Perfil","Total","Ativas","Fila","Postando","Completas","Erros","Hoje"].map(h => (
                        <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filteredSummary.map(row => (
                      <tr key={row.profile_type} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-3"><ProfileBadge profile={row.profile_type} /></td>
                        <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">{row.total_campaigns}</td>
                        <td className="px-4 py-3 text-blue-600">{(row.queued ?? 0) + (row.generating ?? 0) + (row.posting ?? 0)}</td>
                        <td className="px-4 py-3">{row.queued ?? 0}</td>
                        <td className="px-4 py-3 text-violet-600">{row.posting ?? 0}</td>
                        <td className="px-4 py-3 text-emerald-600">{row.completed ?? 0}</td>
                        <td className="px-4 py-3 text-red-500">{row.error ?? 0}</td>
                        <td className="px-4 py-3 text-sky-600">{row.campaigns_today ?? 0}</td>
                      </tr>
                    ))}
                    {filteredSummary.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-400 text-sm">Sem dados</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ WORKERS ══ */}
        {tab === "workers" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Registry de Workers</h2>
              <button
                onClick={deactivateDeadWorkers}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 transition-colors"
              >
                <XCircle size={13} /> Desativar Workers Mortos
              </button>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                  <tr>
                    {["Worker","Status","Heartbeat","CPU","RAM","Versão"].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {workers.map(w => (
                    <tr key={w.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">{w.worker_name}</td>
                      <td className="px-4 py-3"><StatusDot status={w.status} /></td>
                      <td className="px-4 py-3 text-zinc-500">{relativeTime(w.last_heartbeat)}</td>
                      <td className="px-4 py-3 text-zinc-500">{w.cpu_percent != null ? `${w.cpu_percent}%` : "—"}</td>
                      <td className="px-4 py-3 text-zinc-500">{w.memory_mb != null ? `${w.memory_mb}MB` : "—"}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{w.version ?? "—"}</td>
                    </tr>
                  ))}
                  {workers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400 text-sm">Nenhum worker registrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ CAMPANHAS ══ */}
        {tab === "campanhas" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-zinc-900 dark:text-white">
                Campanhas {profile !== "all" ? `· ${profile}` : "· Todos os perfis"}
              </h2>
              <span className="text-xs text-zinc-400">{campaigns.length} registros</span>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                    <tr>
                      {["ID","Nome","Perfil","Status","Prioridade","Retries","Criada"].map(h => (
                        <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {campaigns.map(c => (
                      <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-3 font-mono text-xs text-zinc-400">{c.id.slice(0,8)}…</td>
                        <td className="px-4 py-3 text-zinc-900 dark:text-white max-w-[200px] truncate">{c.name ?? "—"}</td>
                        <td className="px-4 py-3"><ProfileBadge profile={c.origin_profile_type} /></td>
                        <td className="px-4 py-3"><StatusDot status={c.status} /></td>
                        <td className="px-4 py-3 capitalize text-zinc-600 dark:text-zinc-400">{c.priority}</td>
                        <td className="px-4 py-3 text-zinc-500">{c.retry_count}</td>
                        <td className="px-4 py-3 text-zinc-400 text-xs">{relativeTime(c.created_at)}</td>
                      </tr>
                    ))}
                    {campaigns.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400 text-sm">Sem campanhas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ FILA ══ */}
        {tab === "fila" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4">
                <p className="text-xs text-zinc-500 mb-1">Lotes Disponíveis</p>
                <p className="text-2xl font-bold text-blue-600">{lotCount}</p>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4">
                <p className="text-xs text-zinc-500 mb-1">Engine Status</p>
                <p className="text-sm font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={14} /> Motor Universal Ativo
                </p>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4">
                <button onClick={cleanupLocks} className="text-xs text-zinc-500 hover:text-zinc-700 flex items-center gap-1">
                  <Lock size={12} /> Limpar Locks Expirados
                </button>
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300">
              <strong>Fila gerenciada pelo Motor Universal.</strong> Workers consomem lotes via
              <code className="mx-1 text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">get_campaigns_for_processing()</code>
              com <code className="text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">FOR UPDATE SKIP LOCKED</code>.
            </div>
          </div>
        )}

        {/* ══ DLQ ══ */}
        {tab === "dlq" && dlqSummary && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total DLQ",  value: dlqSummary.total,     color: "text-zinc-900 dark:text-white" },
                { label: "Falhou",     value: dlqSummary.failed,    color: "text-red-600" },
                { label: "Retentando", value: dlqSummary.retrying,  color: "text-amber-600" },
                { label: "Recuperado", value: dlqSummary.recovered, color: "text-emerald-600" },
                { label: "Descartado", value: dlqSummary.discarded, color: "text-zinc-400" },
                { label: "Retriável",  value: dlqSummary.retriable, color: "text-teal-600" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4">
                  <p className="text-xs text-zinc-500 mb-1">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            {dlqSummary.by_profile && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-3">Por Perfil</h3>
                <div className="flex gap-3 flex-wrap">
                  {Object.entries(dlqSummary.by_profile).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <ProfileBadge profile={k} />
                      <span className="text-sm font-semibold text-zinc-900 dark:text-white">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3">
              Use <code>retry_from_dlq(dlq_id)</code> para reprocessar ou <code>discard_dlq_entry(dlq_id)</code> para descartar.
            </div>
          </div>
        )}

        {/* ══ RATE LIMIT ══ */}
        {tab === "ratelimit" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Configuração de Rate Limit por Perfil</h2>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                  <tr>
                    {["Perfil", "Por Minuto", "Por Hora", "Por Dia"].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {rateLimits.map(r => (
                    <tr key={r.profile_type} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-3"><ProfileBadge profile={r.profile_type} /></td>
                      <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">{r.max_per_minute}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{r.max_per_hour}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{r.max_per_day}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-zinc-400">Janelas deslizantes de 3 camadas (minuto/hora/dia). Alterações via UPDATE em rate_limit_config — sem deploy.</p>
          </div>
        )}

        {/* ══ ALERTAS ══ */}
        {tab === "alertas" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Histórico de Alertas</h2>
            <div className="space-y-2">
              {alerts.map(a => (
                <div key={a.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
                  a.resolved_at ? "bg-zinc-50 dark:bg-zinc-800/30 border-zinc-100 dark:border-zinc-800 opacity-60"
                    : a.severity === "critical" ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                    : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                }`}>
                  <Bell size={16} className={a.severity === "critical" ? "text-red-500 mt-0.5" : "text-amber-500 mt-0.5"} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-zinc-900 dark:text-white">{a.rule_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                        a.severity === "critical"
                          ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                          : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                      }`}>{a.severity}</span>
                      {a.resolved_at && <span className="text-xs text-emerald-600">Resolvido</span>}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{a.message}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{relativeTime(a.fired_at)}</p>
                  </div>
                  {!a.acknowledged_at && (
                    <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                      Pendente
                    </span>
                  )}
                </div>
              ))}
              {alerts.length === 0 && (
                <div className="text-center py-8 text-zinc-400 text-sm">
                  <CheckCircle2 size={32} className="mx-auto mb-2 opacity-40" />
                  Nenhum alerta disparado
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ MÉTRICAS ══ */}
        {tab === "metricas" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Métricas Diárias</h2>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                    <tr>
                      {["Data","Perfil","Lotes Criados","Lotes Postados","Falhas","Campanhas","Tempo Médio"].map(h => (
                        <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {metrics.map((m, i) => (
                      <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 text-xs">{m.date}</td>
                        <td className="px-4 py-3"><ProfileBadge profile={m.profile_type} /></td>
                        <td className="px-4 py-3 text-zinc-900 dark:text-white font-semibold">{m.lots_created}</td>
                        <td className="px-4 py-3 text-emerald-600">{m.lots_posted}</td>
                        <td className="px-4 py-3 text-red-500">{m.lots_failed}</td>
                        <td className="px-4 py-3 text-violet-600">{m.campaigns_run}</td>
                        <td className="px-4 py-3 text-zinc-500">{m.avg_post_time_ms != null ? `${m.avg_post_time_ms}ms` : "—"}</td>
                      </tr>
                    ))}
                    {metrics.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400 text-sm">Sem métricas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ AUDITORIA ══ */}
        {tab === "auditoria" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Log de Eventos</h2>
            <div className="space-y-1.5">
              {events.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.success ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="text-xs font-mono text-zinc-400 w-12 shrink-0">{relativeTime(e.timestamp)}</span>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 w-40 shrink-0 truncate">{e.event_type}</span>
                  {e.profile && <ProfileBadge profile={e.profile} />}
                  <span className="text-xs text-zinc-400 flex-1 truncate">{e.origin ?? "—"}</span>
                  <span className={`text-xs ${e.success ? "text-emerald-500" : "text-red-500"}`}>
                    {e.success ? "✓" : "✗"}
                  </span>
                </div>
              ))}
              {events.length === 0 && (
                <div className="text-center py-8 text-zinc-400 text-sm">Sem eventos registrados</div>
              )}
            </div>
          </div>
        )}

        {/* ══ SAÚDE ══ */}
        {tab === "saude" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Saúde do Motor Universal</h2>
              {health && (
                <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${
                  health.health_status === "excellent" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                  : health.health_status === "good"    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : health.health_status === "warning" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                  :                                       "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                }`}>
                  {health.health_status}
                </span>
              )}
            </div>

            {health ? (
              <>
                {/* Score bar */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-5">
                  <div className="flex items-end gap-4 mb-3">
                    <span className={`text-5xl font-bold tabular-nums ${
                      health.health_score >= 90 ? "text-emerald-500"
                      : health.health_score >= 70 ? "text-blue-500"
                      : health.health_score >= 50 ? "text-amber-500"
                      : "text-red-500"
                    }`}>{health.health_score}</span>
                    <span className="text-zinc-400 text-sm mb-1">/ 100</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        health.health_score >= 90 ? "bg-emerald-500"
                        : health.health_score >= 70 ? "bg-blue-500"
                        : health.health_score >= 50 ? "bg-amber-500"
                        : "bg-red-500"
                      }`}
                      style={{ width: `${health.health_score}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 mt-2">Verificado {relativeTime(health.checked_at)}</p>
                </div>

                {/* KPI grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Workers Online",    value: health.workers_online,    color: "text-emerald-600" },
                    { label: "Workers Offline",   value: health.workers_offline,   color: health.workers_offline > 0 ? "text-red-600" : "text-zinc-400" },
                    { label: "Workers Ocupados",  value: health.workers_busy,      color: "text-blue-600" },
                    { label: "Lotes na Fila",     value: health.lots_available,    color: "text-violet-600" },
                    { label: "Lotes Processando", value: health.lots_processing,   color: "text-blue-500" },
                    { label: "Campanhas Ativas",  value: health.campaigns_active,  color: "text-indigo-600" },
                    { label: "Erros Última Hora", value: health.errors_last_hour,  color: health.errors_last_hour > 0 ? "text-red-500" : "text-zinc-400" },
                    { label: "DLQ Falhados",      value: health.dlq_failed,        color: health.dlq_failed > 0 ? "text-orange-600" : "text-zinc-400" },
                    { label: "Locks Ativos",      value: health.active_locks,      color: "text-zinc-600 dark:text-zinc-300" },
                    { label: "Camp. c/ Erro",     value: health.campaigns_error,   color: health.campaigns_error > 0 ? "text-red-500" : "text-zinc-400" },
                    { label: "Concluídas Hoje",   value: health.completed_today,   color: "text-emerald-500" },
                    { label: "Tempo Médio (ms)",  value: health.avg_post_ms > 0 ? `${health.avg_post_ms}ms` : "—", color: "text-zinc-600 dark:text-zinc-300" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-3">
                      <p className="text-xs text-zinc-500 mb-1">{label}</p>
                      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-zinc-400 text-sm">
                <Activity size={32} className="mx-auto mb-2 opacity-40" />
                Carregando dados de saúde…
              </div>
            )}
          </div>
        )}

        {/* ══ HISTÓRICO ══ */}
        {tab === "historico" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Histórico de Alterações em Campanhas</h2>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                    <tr>
                      {["Campanha", "Campo", "Anterior", "Novo", "Origem", "Quando"].map(h => (
                        <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {changeLog.map(row => (
                      <tr key={row.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-3 font-mono text-xs text-zinc-400">{row.campaign_id.slice(0, 8)}…</td>
                        <td className="px-4 py-3 font-semibold text-zinc-800 dark:text-zinc-200 text-xs">{row.field_name}</td>
                        <td className="px-4 py-3 text-zinc-500 text-xs max-w-[120px] truncate">{row.old_value ?? <span className="italic text-zinc-300">null</span>}</td>
                        <td className="px-4 py-3 text-zinc-900 dark:text-white text-xs max-w-[120px] truncate">{row.new_value ?? <span className="italic text-zinc-300">null</span>}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            row.origin === "admin"     ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                            : row.origin === "worker"  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                            : row.origin === "rpc"     ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                            :                            "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                          }`}>{row.origin}</span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-xs">{relativeTime(row.changed_at)}</td>
                      </tr>
                    ))}
                    {changeLog.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400 text-sm">Nenhuma alteração registrada ainda</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-zinc-400">Registros gerados automaticamente pelo trigger <code>trg_campaign_change_log</code> em posting_campaigns.</p>
          </div>
        )}

        {/* ══ CONFIG ══ */}
        {tab === "config" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Configurações do Motor Universal</h2>
              <span className="text-xs text-zinc-400">{configs.length} parâmetros · sem deploy</span>
            </div>
            {["rate_limit", "retry", "worker", "motor", "campaign"].map(mod => {
              const group = configs.filter(c => c.module === mod);
              if (group.length === 0) return null;
              return (
                <div key={mod} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                  <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-700">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{mod.replace("_", " ")}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-zinc-400">
                      <tr>
                        {["Chave", "Valor", "Tipo", "Editável", "Descrição", "Atualizado"].map(h => (
                          <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {group.map(cfg => (
                        <tr key={cfg.key} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                          <td className="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">{cfg.key}</td>
                          <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">{cfg.value}</td>
                          <td className="px-4 py-3 text-xs text-zinc-400">{cfg.value_type}</td>
                          <td className="px-4 py-3">
                            {cfg.is_editable_admin
                              ? <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> Sim</span>
                              : <span className="text-xs text-zinc-300 flex items-center gap-1"><XCircle size={12} /> Fixo</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500 max-w-[200px] truncate">{cfg.description ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-zinc-400">{relativeTime(cfg.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {configs.length === 0 && (
              <div className="text-center py-12 text-zinc-400 text-sm">
                <Settings size={32} className="mx-auto mb-2 opacity-40" />
                Nenhuma configuração encontrada — execute a migration M28
              </div>
            )}
          </div>
        )}

        {/* ══ PAPÉIS ══ */}
        {tab === "papeis" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Papéis do Sistema (RBAC)</h2>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                  <tr>
                    {["Papel", "Nome interno", "Descrição", "Sistema", "Ordem"].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {roles.map(r => (
                    <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">{r.display_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-violet-600 dark:text-violet-400">{r.name}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500 max-w-[240px]">{r.description ?? "—"}</td>
                      <td className="px-4 py-3">
                        {r.is_system
                          ? <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><Shield size={11} /> Sistema</span>
                          : <span className="text-xs text-zinc-400">Custom</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400 tabular-nums">{r.sort_order}</td>
                    </tr>
                  ))}
                  {roles.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400 text-sm">Nenhum papel — execute a migration M27</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ PERMISSÕES ══ */}
        {tab === "permissoes" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Permissões do Sistema (RBAC)</h2>
              <span className="text-xs text-zinc-400">{permissions.length} permissões</span>
            </div>
            {Array.from(new Set(permissions.map(p => p.module))).sort().map(mod => {
              const group = permissions.filter(p => p.module === mod);
              return (
                <div key={mod} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                  <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-700 flex items-center gap-2">
                    <Key size={12} className="text-zinc-400" />
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{mod}</span>
                    <span className="text-xs text-zinc-400 ml-auto">{group.length}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {group.map(perm => (
                        <tr key={perm.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                          <td className="px-4 py-3 font-mono text-xs text-indigo-600 dark:text-indigo-400 w-48">{perm.name}</td>
                          <td className="px-4 py-3 text-xs text-zinc-500">{perm.description ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {permissions.length === 0 && (
              <div className="text-center py-12 text-zinc-400 text-sm">
                <Lock size={32} className="mx-auto mb-2 opacity-40" />
                Nenhuma permissão — execute a migration M27
              </div>
            )}
          </div>
        )}

        {/* ══ COMISSÕES ══ */}
        {tab === "comissoes" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Comissões por Perfil</h2>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                    <tr>
                      {["Perfil", "Pendentes", "Aprovadas", "Canceladas", "Pagas", "Valor Pendente", "Valor Aprovado", "Valor Pago", "Operadores"].map(h => (
                        <th key={h} className="px-4 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {commissions.map(c => (
                      <tr key={c.profile_type} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-3"><ProfileBadge profile={c.profile_type} /></td>
                        <td className="px-4 py-3 text-amber-600 font-semibold tabular-nums">{c.pending_count}</td>
                        <td className="px-4 py-3 text-blue-600 font-semibold tabular-nums">{c.approved_count}</td>
                        <td className="px-4 py-3 text-zinc-400 tabular-nums">{c.cancelled_count}</td>
                        <td className="px-4 py-3 text-emerald-600 font-semibold tabular-nums">{c.paid_count}</td>
                        <td className="px-4 py-3 text-amber-600 tabular-nums">
                          {c.pending_cents != null ? `R$ ${(c.pending_cents / 100).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-blue-600 tabular-nums">
                          {c.approved_cents != null ? `R$ ${(c.approved_cents / 100).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-emerald-600 tabular-nums">
                          {c.paid_cents != null ? `R$ ${(c.paid_cents / 100).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 tabular-nums">{c.unique_operators}</td>
                      </tr>
                    ))}
                    {commissions.length === 0 && (
                      <tr><td colSpan={9} className="px-4 py-8 text-center text-zinc-400 text-sm">
                        Nenhuma comissão registrada — execute a migration M31
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-zinc-400">
              Aprovações via RPC <code className="font-mono">approve_operator_commission()</code> · Cancelamentos via <code className="font-mono">cancel_operator_commission()</code>.
            </p>
          </div>
        )}

        {/* ══ FEATURE FLAGS ══ */}
        {tab === "flags" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Feature Flags</h2>
              <span className="text-xs text-zinc-400">{featureFlags.length} flags · alterações sem deploy</span>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                    <tr>
                      {["Status", "Chave", "Nome", "Perfis", "Rollout", "Ambiente", "Expira"].map(h => (
                        <th key={h} className="px-4 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {featureFlags.map(ff => (
                      <tr key={ff.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-3">
                          <button
                            onClick={async () => {
                              await supabase.rpc("toggle_feature_flag" as any, { p_key: ff.key, p_enabled: !ff.is_enabled });
                              await loadFeatureFlags();
                            }}
                            title={ff.is_enabled ? "Desabilitar" : "Habilitar"}
                          >
                            {ff.is_enabled
                              ? <ToggleRight size={24} className="text-emerald-500" />
                              : <ToggleLeft  size={24} className="text-zinc-300 dark:text-zinc-600" />
                            }
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-violet-600 dark:text-violet-400">{ff.key}</td>
                        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200 text-xs">{ff.name}</td>
                        <td className="px-4 py-3">
                          {ff.allowed_profiles
                            ? <div className="flex gap-1 flex-wrap">{ff.allowed_profiles.map(p => <ProfileBadge key={p} profile={p} />)}</div>
                            : <span className="text-xs text-zinc-400">Todos</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${ff.rollout_percentage}%` }} />
                            </div>
                            <span className="text-xs tabular-nums text-zinc-500">{ff.rollout_percentage}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            ff.environment === "all"        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                            : ff.environment === "production" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                            :                                   "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                          }`}>{ff.environment}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-400">
                          {ff.expires_at ? relativeTime(ff.expires_at) : "nunca"}
                        </td>
                      </tr>
                    ))}
                    {featureFlags.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400 text-sm">
                        Nenhuma flag — execute a migration M33
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-zinc-400">
              Targeting: perfil, tenant, cidade, estado, região, rollout percentual. RPC: <code className="font-mono">is_feature_enabled(key, profile, ...)</code>
            </p>
          </div>
        )}

        {/* ══ WEBHOOKS ══ */}
        {tab === "webhooks" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Webhooks</h2>
              <span className="text-xs text-zinc-400">{webhookEndpoints.length} endpoints</span>
            </div>
            {webhookEndpoints.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-8 text-center">
                <Link2 size={32} className="mx-auto mb-2 text-zinc-300" />
                <p className="text-sm text-zinc-500 mb-1">Nenhum endpoint registrado</p>
                <p className="text-xs text-zinc-400">Execute a migration M35 e registre com <code className="font-mono">register_webhook_endpoint()</code></p>
              </div>
            ) : (
              <div className="space-y-3">
                {webhookEndpoints.map(ep => {
                  const successRate = ep.total_deliveries > 0
                    ? Math.round((1 - ep.failed_deliveries / ep.total_deliveries) * 100)
                    : null;
                  return (
                    <div key={ep.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${ep.is_active ? "bg-emerald-500" : "bg-zinc-300"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-sm text-zinc-900 dark:text-white">{ep.name}</span>
                            <span className="text-xs text-zinc-400 font-mono truncate max-w-[240px]">{ep.url}</span>
                            {!ep.is_active && <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">Inativo</span>}
                          </div>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {ep.events.slice(0, 6).map(ev => (
                              <span key={ev} className="text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded">{ev}</span>
                            ))}
                            {ep.events.length > 6 && <span className="text-xs text-zinc-400">+{ep.events.length - 6}</span>}
                          </div>
                          <div className="flex gap-4 text-xs text-zinc-500">
                            <span>Entregas: <strong className="text-zinc-800 dark:text-zinc-200">{ep.total_deliveries}</strong></span>
                            <span>Falhas: <strong className={ep.failed_deliveries > 0 ? "text-red-500" : "text-zinc-400"}>{ep.failed_deliveries}</strong></span>
                            {successRate !== null && (
                              <span>Taxa de sucesso: <strong className={successRate >= 95 ? "text-emerald-500" : successRate >= 80 ? "text-amber-500" : "text-red-500"}>{successRate}%</strong></span>
                            )}
                            <span>Timeout: {ep.timeout_ms}ms</span>
                            <span>Retries: {ep.retry_count}</span>
                          </div>
                        </div>
                        {ep.is_active && (
                          <button
                            onClick={async () => {
                              await supabase.rpc("deactivate_webhook_endpoint" as any, { p_endpoint_id: ep.id });
                              await loadWebhooks();
                            }}
                            className="text-xs text-red-500 hover:text-red-700 shrink-0"
                          >
                            Desativar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
              <strong>Entrega HTTP assíncrona.</strong> Os registros em <code className="font-mono">webhook_deliveries</code> são consumidos por uma Edge Function (Tier 2.3). Emissão via <code className="font-mono">emit_webhook_event(event_type, payload)</code>.
            </div>
          </div>
        )}

        {/* ══ APIs ══ */}
        {tab === "apis" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Referência de APIs — Motor Universal 2.2.5</h2>
              <span className="text-xs text-zinc-400">SECURITY DEFINER · via Supabase RPC</span>
            </div>
            {/* Config por perfil */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-700">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Configurações por Perfil</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-400">
                  <tr>
                    {["Perfil", "Balanceamento", "Prioridade", "Max Lote", "Cooldown (s)", "Max/min", "Max/h", "Max/dia", "Ativo"].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {profileConfigs.map(pc => (
                    <tr key={pc.profile_type} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-3"><ProfileBadge profile={pc.profile_type} /></td>
                      <td className="px-4 py-3 text-xs text-violet-600 dark:text-violet-400 font-mono">{pc.balancing_strategy}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{pc.default_priority ?? <span className="italic text-zinc-300">global</span>}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{pc.max_lot_size ?? <span className="italic text-zinc-300">global</span>}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{pc.cooldown_seconds ?? <span className="italic text-zinc-300">global</span>}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{pc.max_per_minute ?? <span className="italic text-zinc-300">global</span>}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{pc.max_per_hour ?? <span className="italic text-zinc-300">global</span>}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{pc.max_per_day ?? <span className="italic text-zinc-300">global</span>}</td>
                      <td className="px-4 py-3">
                        {pc.is_active
                          ? <CheckCircle2 size={14} className="text-emerald-500" />
                          : <XCircle size={14} className="text-zinc-300" />
                        }
                      </td>
                    </tr>
                  ))}
                  {profileConfigs.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-6 text-center text-zinc-400 text-xs">Execute a migration M34 para ver configurações por perfil</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* RPC reference */}
            {[
              { domain: "Campanhas", color: "text-violet-600", rpcs: [
                { name: "create_posting_campaign(user_id, profile, ...)", desc: "Cria campanha no Motor Universal" },
                { name: "cancel_campaign(campaign_id)", desc: "Cancela campanha ativa" },
                { name: "pause_campaign(campaign_id)", desc: "Pausa campanha em execução" },
                { name: "get_campaign_status(campaign_id)", desc: "Retorna status atual da campanha" },
              ]},
              { domain: "Feature Flags", color: "text-emerald-600", rpcs: [
                { name: "is_feature_enabled(key, profile, tenant, city, state, region)", desc: "Verifica se flag está ativa para o contexto" },
                { name: "toggle_feature_flag(key, enabled)", desc: "Liga/desliga flag globalmente" },
                { name: "upsert_feature_flag(key, name, description, targeting)", desc: "Cria ou atualiza flag com targeting completo" },
                { name: "get_feature_flags()", desc: "Lista todas as flags com targeting" },
              ]},
              { domain: "Webhooks", color: "text-blue-600", rpcs: [
                { name: "emit_webhook_event(event_type, payload)", desc: "Enfileira evento para endpoints ativos" },
                { name: "register_webhook_endpoint(url, events, name, tenant_id, secret)", desc: "Registra endpoint receptor" },
                { name: "deactivate_webhook_endpoint(endpoint_id)", desc: "Desativa endpoint" },
                { name: "get_webhook_endpoints()", desc: "Lista endpoints com estatísticas de entrega" },
              ]},
              { domain: "Configurações", color: "text-amber-600", rpcs: [
                { name: "update_motor_config(key, value)", desc: "Atualiza parâmetro global do Motor (sem deploy)" },
                { name: "get_effective_engine_config(profile_type)", desc: "Config efetiva = global + overrides do perfil" },
                { name: "update_profile_engine_config(profile_type, config)", desc: "Override por perfil" },
                { name: "reset_profile_engine_config(profile_type)", desc: "Volta perfil para herdar global" },
              ]},
              { domain: "Saúde & Observabilidade", color: "text-red-600", rpcs: [
                { name: "get_motor_health()", desc: "Snapshot de saúde: health_score, workers, DLQ, errors" },
                { name: "get_advanced_observability()", desc: "Throughput, SLA, availability, AI insights" },
                { name: "get_scheduler_recommendations(profile, city, state)", desc: "Melhores horários e workers por contexto" },
                { name: "log_scheduler_performance(hour, profile, success, duration_ms, city, state)", desc: "Registra resultado de postagem para o Scheduler" },
              ]},
              { domain: "Cache & Versões", color: "text-indigo-600", rpcs: [
                { name: "refresh_motor_cache()", desc: "Recalcula todos os buckets de cache" },
                { name: "get_cache_status()", desc: "Status de frescor de cada bucket" },
                { name: "get_motor_versions()", desc: "Versão atual de cada componente" },
                { name: "register_motor_version(component, version, description)", desc: "Registra nova versão após deploy" },
              ]},
              { domain: "Backup", color: "text-zinc-600", rpcs: [
                { name: "create_motor_snapshot(label, trigger, modules[])", desc: "Cria snapshot de motor_config, feature_flags, RBAC, rate_limits, versions" },
                { name: "list_motor_snapshots(limit)", desc: "Lista snapshots disponíveis" },
                { name: "restore_motor_config_from_snapshot(snapshot_id, dry_run)", desc: "Restaura motor_config de um snapshot (dry_run=true para preview)" },
                { name: "delete_motor_snapshot(snapshot_id)", desc: "Remove snapshot não fixado" },
              ]},
            ].map(({ domain, color, rpcs }) => (
              <div key={domain} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-700 flex items-center gap-2">
                  <Globe size={12} className={color} />
                  <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{domain}</span>
                </div>
                <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                  {rpcs.map(rpc => (
                    <div key={rpc.name} className="px-4 py-2.5 flex items-start gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <code className={`text-xs font-mono shrink-0 ${color}`}>{rpc.name}</code>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{rpc.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ CACHE ══ */}
        {tab === "cache" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Camada de Cache</h2>
              <button
                onClick={async () => {
                  await supabase.rpc("refresh_motor_cache" as any);
                  await loadCacheStatus();
                }}
                className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
              >
                <RefreshCw size={12} /> Refresh Todos
              </button>
            </div>
            {cacheStatus.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-sm">
                <Database size={32} className="mx-auto mb-2 opacity-40" />
                Cache vazio — clique em "Refresh Todos" ou execute M38
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cacheStatus.map(c => (
                  <div key={c.key} className={`rounded-xl border p-4 ${
                    c.fresh
                      ? "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800"
                      : "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30"
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${c.fresh ? "bg-emerald-500" : "bg-red-400"}`} />
                      <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300 font-semibold">{c.key}</span>
                    </div>
                    <div className="space-y-0.5 text-xs text-zinc-500">
                      <div className="flex justify-between">
                        <span>Status</span>
                        <span className={c.fresh ? "text-emerald-600" : "text-red-500"}>{c.fresh ? "Fresco" : "Expirado"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>TTL restante</span>
                        <span className="tabular-nums">{c.fresh ? `${c.ttl_remaining_seconds}s` : "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Hits</span>
                        <span className="tabular-nums text-zinc-800 dark:text-zinc-200 font-semibold">{c.hit_count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Atualizado</span>
                        <span>{relativeTime(c.refreshed_at)}</span>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await supabase.rpc("cache_invalidate" as any, { p_key: c.key });
                        await loadCacheStatus();
                      }}
                      className="mt-2 text-xs text-zinc-400 hover:text-red-500 flex items-center gap-1"
                    >
                      <Trash2 size={10} /> Invalidar
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-zinc-400">
              Cache em <code className="font-mono">motor_cache_store</code>. Substituição por Redis/Upstash planejada para Tier 2.3.
              Invalidação automática em <code className="font-mono">motor_universal_config</code> via trigger.
            </p>
          </div>
        )}

        {/* ══ VERSÕES ══ */}
        {tab === "versoes" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Versões do Motor Universal</h2>
            {Object.keys(versions).length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-sm">
                <GitBranch size={32} className="mx-auto mb-2 opacity-40" />
                Sem dados de versão — execute a migration M36
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(versions).sort(([a],[b]) => a.localeCompare(b)).map(([component, v]) => (
                  <div key={component} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{component.replace(/_/g, " ")}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-lg font-bold text-zinc-900 dark:text-white">{v.version}</span>
                          {v.migration_number && (
                            <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">M{v.migration_number}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-zinc-400 shrink-0">{relativeTime(v.deployed_at)}</span>
                    </div>
                    {v.description && <p className="text-xs text-zinc-500 mb-1">{v.description}</p>}
                    {v.changelog && (
                      <p className="text-xs text-zinc-400 italic truncate" title={v.changelog}>{v.changelog}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ BACKUP ══ */}
        {tab === "backup" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Backup Lógico — Snapshots</h2>
              <button
                onClick={async () => {
                  const label = `Manual ${new Date().toISOString().slice(0,16).replace("T"," ")}`;
                  await supabase.rpc("create_motor_snapshot" as any, { p_label: label, p_trigger: "manual" });
                  await loadSnapshots();
                }}
                className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
              >
                <Archive size={12} /> Criar Snapshot
              </button>
            </div>
            {snapshots.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-sm">
                <Archive size={32} className="mx-auto mb-2 opacity-40" />
                Nenhum snapshot — clique em "Criar Snapshot" ou execute M39
              </div>
            ) : (
              <div className="space-y-2">
                {snapshots.map(snap => (
                  <div key={snap.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4">
                    <div className="flex items-start gap-3">
                      {snap.is_pinned && <Star size={14} className="text-amber-500 mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm text-zinc-900 dark:text-white">{snap.label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            snap.trigger === "manual"      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                            : snap.trigger === "pre_deploy" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                            :                                 "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          }`}>{snap.trigger}</span>
                          <span className="text-xs text-zinc-400">{snap.module_count} módulos</span>
                        </div>
                        <div className="flex gap-1 flex-wrap mb-1">
                          {snap.modules.map(m => (
                            <span key={m} className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded">{m}</span>
                          ))}
                        </div>
                        <p className="text-xs text-zinc-400">{relativeTime(snap.created_at)}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={async () => {
                            const r = await supabase.rpc("restore_motor_config_from_snapshot" as any, {
                              p_snapshot_id: snap.id, p_dry_run: true
                            });
                            alert(`Dry-run: ${(r.data as any)?.config_count ?? 0} parâmetros seriam restaurados`);
                          }}
                          className="text-xs text-blue-500 hover:text-blue-700"
                        >
                          Dry-run
                        </button>
                        {!snap.is_pinned && (
                          <button
                            onClick={async () => {
                              await supabase.rpc("delete_motor_snapshot" as any, { p_snapshot_id: snap.id });
                              await loadSnapshots();
                            }}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-zinc-400">
              Módulos suportados: motor_config, profile_config, feature_flags, rbac, rate_limits, versions, tenant_config.
              Restauração seletiva via <code className="font-mono">restore_motor_config_from_snapshot(id, dry_run)</code>.
            </p>
          </div>
        )}

        {/* ══ SCHEDULER INTELIGENTE ══ */}
        {tab === "scheduler" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Scheduler Inteligente — IA de Administração</h2>
              <button
                onClick={async () => {
                  await supabase.rpc("refresh_scheduler_preferences" as any);
                  await loadScheduler();
                }}
                className="flex items-center gap-1.5 text-xs bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 px-3 py-1.5 rounded-lg"
              >
                <RefreshCw size={12} /> Recalcular
              </button>
            </div>

            {/* AI Insights */}
            {schedulerRec?.ai_insights && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Bot size={13} /> Insights Automáticos
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Campanhas com mais erros */}
                  {(schedulerRec.ai_insights.high_error_campaigns?.length ?? 0) > 0 && (
                    <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2 text-red-600 dark:text-red-400">
                        <AlertTriangle size={13} />
                        <span className="text-xs font-semibold">Campanhas com mais erros</span>
                      </div>
                      <div className="space-y-1">
                        {schedulerRec.ai_insights.high_error_campaigns!.slice(0,4).map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-[160px]">{c.name ?? c.id.slice(0,8)}</span>
                            <div className="flex items-center gap-1">
                              <ProfileBadge profile={c.profile_type} />
                              <span className="text-red-600 font-semibold">{c.error_count} erros</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Campanhas paradas */}
                  {(schedulerRec.ai_insights.idle_campaigns?.length ?? 0) > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2 text-amber-600 dark:text-amber-400">
                        <Clock size={13} />
                        <span className="text-xs font-semibold">Campanhas paradas há +2h</span>
                      </div>
                      <div className="space-y-1">
                        {schedulerRec.ai_insights.idle_campaigns!.slice(0,4).map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-[160px]">{c.name ?? c.id.slice(0,8)}</span>
                            <span className="text-amber-600 font-mono">{c.idle_duration?.slice(0,8) ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Melhor horário */}
                  {(schedulerRec.ai_insights.best_posting_hours?.length ?? 0) > 0 && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2 text-emerald-600 dark:text-emerald-400">
                        <Zap size={13} />
                        <span className="text-xs font-semibold">Melhores horários de postagem</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {schedulerRec.ai_insights.best_posting_hours!.slice(0,5).map((h, i) => (
                          <div key={i} className="text-center bg-white dark:bg-zinc-900 rounded-lg border border-emerald-100 dark:border-emerald-900/30 px-2 py-1">
                            <div className="text-sm font-bold text-zinc-900 dark:text-white">{String(h.hour_of_day).padStart(2,"0")}h</div>
                            <div className="text-xs text-emerald-600">{h.success_rate_pct}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Performance por perfil */}
                  {(schedulerRec.ai_insights.profile_performance?.length ?? 0) > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2 text-blue-600 dark:text-blue-400">
                        <TrendingUp size={13} />
                        <span className="text-xs font-semibold">Performance por perfil (30d)</span>
                      </div>
                      <div className="space-y-1.5">
                        {schedulerRec.ai_insights.profile_performance!.map((p, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <ProfileBadge profile={p.profile_type} />
                            <div className="flex-1 h-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.completion_rate_pct}%` }} />
                            </div>
                            <span className="text-blue-700 dark:text-blue-300 tabular-nums">{p.completion_rate_pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Melhores horários por perfil */}
            {(schedulerRec?.best_hours_by_profile?.length ?? 0) > 0 ? (
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Calendar size={12} /> Melhores horários por perfil (últimos 30 dias)
                </h3>
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-400">
                        <tr>
                          {["Perfil", "Hora", "Rank", "Sucessos", "Falhas", "Taxa", "Dados", "Confiança"].map(h => (
                            <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {schedulerRec!.best_hours_by_profile.map((h, i) => (
                          <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                            <td className="px-4 py-2"><ProfileBadge profile={h.profile_type} /></td>
                            <td className="px-4 py-2 font-semibold text-zinc-900 dark:text-white tabular-nums">{String(h.hour_of_day).padStart(2,"0")}h</td>
                            <td className="px-4 py-2">
                              <span className={`text-xs font-bold ${h.rank === 1 ? "text-amber-500" : h.rank === 2 ? "text-zinc-500" : "text-zinc-400"}`}>#{h.rank}</span>
                            </td>
                            <td className="px-4 py-2 text-emerald-600 tabular-nums">{h.successes}</td>
                            <td className="px-4 py-2 text-red-500 tabular-nums">{h.failures}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${h.success_rate_pct}%` }} />
                                </div>
                                <span className="text-xs tabular-nums text-zinc-700 dark:text-zinc-300">{h.success_rate_pct}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-xs text-zinc-400">{h.data_days}d</td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                h.confidence === "high"   ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                                : h.confidence === "medium" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                                :                             "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                              }`}>{h.confidence}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-6 text-center">
                <Bot size={32} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-600" />
                <p className="text-sm text-zinc-500 mb-1">Ainda sem dados históricos</p>
                <p className="text-xs text-zinc-400">
                  {schedulerRec?.note ?? "As recomendações ficam disponíveis após o Motor processar campanhas e o Worker chamar log_scheduler_performance()."}
                </p>
              </div>
            )}

            {/* Top Workers */}
            {(schedulerRec?.top_workers?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Cpu size={12} /> Workers mais eficientes (últimos 30 dias)
                </h3>
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-400">
                      <tr>
                        {["Rank", "Worker", "Status", "Perfil", "Eventos", "Taxa de Sucesso"].map(h => (
                          <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {schedulerRec!.top_workers.map((w, i) => (
                        <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                          <td className="px-4 py-2">
                            <span className={`text-xs font-bold ${w.rank_in_profile === 1 ? "text-amber-500" : "text-zinc-400"}`}>#{w.rank_in_profile}</span>
                          </td>
                          <td className="px-4 py-2 text-sm font-semibold text-zinc-900 dark:text-white">{w.worker_name}</td>
                          <td className="px-4 py-2"><StatusDot status={w.status} /></td>
                          <td className="px-4 py-2">{w.profile_type ? <ProfileBadge profile={w.profile_type} /> : <span className="text-zinc-400 text-xs">—</span>}</td>
                          <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400 tabular-nums">{w.total_events_30d}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${w.success_rate_pct >= 95 ? "bg-emerald-500" : w.success_rate_pct >= 80 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${w.success_rate_pct}%` }} />
                              </div>
                              <span className="text-xs tabular-nums text-zinc-700 dark:text-zinc-300">{w.success_rate_pct}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
