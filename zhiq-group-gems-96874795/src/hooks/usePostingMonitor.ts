import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { callAIEngine } from "@/lib/ai/aiEngineClient";
import type { AIEngineResponse } from "@/types/aiEngine";

// ── Types ────────────────────────────────────────────────────

export type CampaignMonitorStatus =
  | "draft" | "ready" | "generating" | "queued" | "posting"
  | "waiting" | "paused" | "completed" | "cancelled" | "expired" | "error";

export interface CampaignMonitorItem {
  id: string;
  name: string;
  status: CampaignMonitorStatus;
  priority: string;
  priority_score: number;
  starvation_ticks: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  scheduled_at: string | null;
  retry_count: number;
  final_error: string | null;
  // From latest ai_campaign_decision_log
  queue_position: number | null;
  estimated_at: string | null;
  explanation: string | null;
  plan_level: string;
  last_decision: string | null;
}

export interface QueueStatus {
  campaign_id: string;
  status: string;
  priority: string;
  priority_score: number;
  starvation_ticks: number;
  queue_position: number;
  total_in_queue: number;
  prev_position: number | null;
  estimated_publish_at: string | null;
  plan_level: string;
  credits_available: number;
  daily_limit: number;
  daily_used: number;
  criteria_json: CriteriaItem[];
  explanation_text: string | null;
  last_decision_at: string | null;
  created_at: string;
  completed_at: string | null;
  final_error: string | null;
}

export interface CriteriaItem {
  label: string;
  value: string;
  contribution: number;
  positive: boolean;
}

export interface TimelineEvent {
  event_type: "pipeline_stage" | "ai_decision" | "ai_call" | "click" | "view";
  occurred_at: string;
  stage: string;
  responsible: string;
  title: string;
  duration_ms: number | null;
  notes: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
}

export interface AIDecisionResult {
  execution_id: string;
  campaign_id: string;
  queue_position: number;
  total_in_queue: number;
  priority_score: number;
  criteria_json: CriteriaItem[];
  plan_level: string;
  estimated_minutes: number;
  context: Record<string, string>;
  // Populated after gateway call
  explanation?: string;
  highlights?: string[];
  tips?: string[];
  criteria_summary?: Array<{ label: string; value: string; contribution: number; positive: boolean }>;
}

export interface AdminQueueItem {
  position: number;
  id: string;
  user_id: string;
  name: string;
  status: string;
  priority: string;
  priority_score: number;
  starvation_ticks: number;
  plan_level: string | null;
  credits_available: number | null;
  daily_limit: number | null;
  daily_used: number | null;
  estimated_at: string | null;
  explanation: string | null;
  created_at: string;
  started_at: string | null;
}

// ── Status config ────────────────────────────────────────────

export const MONITOR_STATUS_CONFIG: Record<string, {
  label: string; color: string; bg: string; dot: string;
}> = {
  draft:     { label: "Rascunho",     color: "text-zinc-400",    bg: "bg-zinc-800",       dot: "bg-zinc-500"    },
  ready:     { label: "Pronta",       color: "text-sky-400",     bg: "bg-sky-500/15",     dot: "bg-sky-400"     },
  generating:{ label: "Gerando IA",   color: "text-violet-400",  bg: "bg-violet-500/15",  dot: "bg-violet-400 animate-pulse"  },
  queued:    { label: "Na Fila",      color: "text-amber-400",   bg: "bg-amber-500/15",   dot: "bg-amber-400"   },
  posting:   { label: "Publicando",   color: "text-emerald-400", bg: "bg-emerald-500/15", dot: "bg-emerald-400 animate-pulse" },
  waiting:   { label: "Aguardando",   color: "text-amber-300",   bg: "bg-amber-500/10",   dot: "bg-amber-300"   },
  paused:    { label: "Pausada",      color: "text-zinc-400",    bg: "bg-zinc-800",       dot: "bg-zinc-400"    },
  completed: { label: "Concluída",    color: "text-emerald-400", bg: "bg-emerald-500/10", dot: "bg-emerald-400" },
  cancelled: { label: "Cancelada",    color: "text-zinc-500",    bg: "bg-zinc-800",       dot: "bg-zinc-500"    },
  expired:   { label: "Expirada",     color: "text-rose-400",    bg: "bg-rose-500/15",    dot: "bg-rose-400"    },
  error:     { label: "Erro",         color: "text-red-400",     bg: "bg-red-500/15",     dot: "bg-red-400"     },
};

export const PIPELINE_STAGES = [
  { key: "queued",            label: "Na Fila",         icon: "list-ordered" },
  { key: "in_analysis",       label: "Análise da IA",   icon: "brain"        },
  { key: "approved",          label: "Aprovado",        icon: "check"        },
  { key: "scheduling",        label: "Scheduler",       icon: "clock"        },
  { key: "sent_to_postador",  label: "Enviado",         icon: "send"         },
  { key: "publishing",        label: "Publicando",      icon: "zap"          },
  { key: "published",         label: "Publicado",       icon: "check-circle" },
];

// ── Hook: lista de campanhas do lojista ───────────────────────

export function useAdvertiserCampaignsMonitor(options?: {
  status?: string[];
  limit?: number;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<{ total: number; items: CampaignMonitorItem[] }>({
    queryKey: ["posting-monitor", user?.id, options?.status],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_advertiser_campaigns_monitor" as never,
        {
          p_user_id: user!.id,
          p_status:  options?.status ?? null,
          p_limit:   options?.limit ?? 20,
          p_offset:  0,
        } as never
      );
      if (error) throw new Error(error.message);
      return (data as { total: number; items: CampaignMonitorItem[] }) ?? { total: 0, items: [] };
    },
    enabled: !!user,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Realtime: recalcula ao mudar posting_campaigns
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`monitor-campaigns-${user.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "posting_campaigns",
        filter: `user_id=eq.${user.id}`,
      }, () => queryClient.invalidateQueries({ queryKey: ["posting-monitor"] }))
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "ai_campaign_decision_log",
        filter: `user_id=eq.${user.id}`,
      }, () => queryClient.invalidateQueries({ queryKey: ["posting-monitor"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, queryClient]);

  return { ...query, refetch: query.refetch };
}

// ── Hook: status de fila de uma campanha ─────────────────────

export function useCampaignQueueStatus(campaignId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery<QueueStatus>({
    queryKey: ["queue-status", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_campaign_queue_status" as never,
        { p_campaign_id: campaignId } as never
      );
      if (error) throw new Error(error.message);
      return data as QueueStatus;
    },
    enabled: !!campaignId,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });

  useEffect(() => {
    if (!campaignId) return;
    const ch = supabase
      .channel(`queue-status-${campaignId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "posting_campaigns",
        filter: `id=eq.${campaignId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ["queue-status", campaignId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId, queryClient]);

  return query;
}

// ── Hook: timeline de uma campanha ───────────────────────────

export function useCampaignTimeline(campaignId: string | null) {
  return useQuery<TimelineEvent[]>({
    queryKey: ["campaign-timeline", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_campaign_timeline" as never,
        { p_campaign_id: campaignId } as never
      );
      if (error) throw new Error(error.message);
      return (data as TimelineEvent[]) ?? [];
    },
    enabled: !!campaignId,
    staleTime: 15_000,
  });
}

// ── Hook: explicação da decisão da IA ────────────────────────

export function useAIDecisionExplainer() {
  return useMutation<AIDecisionResult, Error, string>({
    mutationFn: async (campaignId: string) => {
      // Passo 1: chama a RPC explain_ai_decision (Action Router + Prompt Selector)
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "explain_ai_decision" as never,
        { p_campaign_id: campaignId } as never
      );
      if (rpcError) throw new Error(rpcError.message);

      const rpc = rpcData as AIDecisionResult;

      // Passo 2: chama a Edge Function com o execution_id
      const gateway = await callAIEngine({
        module:  "postador",
        action:  "explain_priority",
        profile: "marketplace",
        context: rpc.context as Record<string, string>,
      });

      // gateway.data contém o JSON gerado pelo Claude
      const gd = gateway.data as {
        explanation?: string;
        highlights?: string[];
        tips?: string[];
        criteria_summary?: AIDecisionResult["criteria_summary"];
        estimated_minutes?: number;
      };

      // Atualiza o explanation_text no banco
      if (rpc.execution_id && gd.explanation) {
        await supabase.rpc("ai_engine_complete" as never, {
          p_execution_id:  rpc.execution_id,
          p_response:      gateway.data,
          p_model_used:    gateway.model_used,
          p_tokens_input:  gateway.tokens_input,
          p_tokens_output: gateway.tokens_output,
          p_latency_ms:    gateway.latency_ms,
          p_error:         null,
        } as never);
      }

      return {
        ...rpc,
        explanation:      gd.explanation,
        highlights:       gd.highlights,
        tips:             gd.tips,
        criteria_summary: gd.criteria_summary,
      };
    },
  });
}

// ── Hook: fila admin ─────────────────────────────────────────

export function useAdminPostingQueue(limit = 50) {
  return useQuery<{ total: number; items: AdminQueueItem[] }>({
    queryKey: ["admin-posting-queue", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_full_posting_queue" as never,
        { p_limit: limit, p_offset: 0 } as never
      );
      if (error) throw new Error(error.message);
      return (data as { total: number; items: AdminQueueItem[] }) ?? { total: 0, items: [] };
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
