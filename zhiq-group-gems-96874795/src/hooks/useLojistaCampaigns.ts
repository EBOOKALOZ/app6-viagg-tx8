import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════
export interface LojistaCampaign {
    id: string;
    title: string;
    message_text: string | null;
    media_url: string | null;
    campaign_type: string | null;
    target_city: string | null;
    target_region: string | null;
    status: string;
    created_at: string;
    available_from: string | null;
    available_until: string | null;
}

export interface LojistaPostingEntry {
    id: string;
    campaign_queue_id: string;
    whatsapp_group_id: string;
    operator_user_id: string;
    final_status: string;
    message_text: string | null;
    template_hash: string | null;
    execution_notes: string | null;
    posted_at: string;
}

export interface CampaignStats {
    totalPosts: number;
    lastPostedAt: string | null;
    uniqueGroups: number;
}

export interface LojistaKPIs {
    totalCampaigns: number;
    activeCampaigns: number;
    totalPosts: number;
    uniqueGroups: number;
}

// ═══════════════════════════════════════
// STATUS CONFIG
// ═══════════════════════════════════════
export type CampaignVisualStatus = "active" | "queued" | "cancelled" | "expired" | "review";

const ACTIVE_STATUSES = ["ready", "approved", "pending", "scheduled"];
const QUEUED_STATUSES = ["processing", "queued"];

export function deriveCampaignStatus(status: string, availableUntil?: string | null): CampaignVisualStatus {
    if (status === "cancelled") return "cancelled";
    if (status === "expired") return "expired";
    if (availableUntil && new Date(availableUntil).getTime() < Date.now()) return "expired";
    if (ACTIVE_STATUSES.includes(status)) return "active";
    if (QUEUED_STATUSES.includes(status)) return "queued";
    return "review";
}

export const CAMPAIGN_STATUS_CONFIG: Record<CampaignVisualStatus, {
    label: string; color: string; bg: string; borderColor: string;
}> = {
    active: { label: "Ativa", color: "text-emerald-400", bg: "bg-emerald-500/10", borderColor: "border-emerald-500/15" },
    queued: { label: "Em Fila", color: "text-amber-400", bg: "bg-amber-500/10", borderColor: "border-amber-500/15" },
    cancelled: { label: "Cancelada", color: "text-zinc-400", bg: "bg-zinc-500/10", borderColor: "border-zinc-500/15" },
    expired: { label: "Expirada", color: "text-rose-400", bg: "bg-rose-500/10", borderColor: "border-rose-500/15" },
    review: { label: "Em Análise", color: "text-sky-400", bg: "bg-sky-500/10", borderColor: "border-sky-500/15" },
};

// ═══════════════════════════════════════
// HOOK
// ═══════════════════════════════════════
export function useLojistaCampaigns() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // ── 1. Campaigns ──
    const { data: campaigns = [], isLoading: loadingCampaigns, isError: errorCampaigns } = useQuery<LojistaCampaign[]>({
        queryKey: ["lojista-campaigns", user?.id],
        queryFn: async () => {
            // @ts-expect-error - Some schemas might not be fully typed yet
            const { data, error } = await supabase.from("campaign_queue")
                .select("id, title, message_text, media_url, campaign_type, target_city, target_region, status, created_at, available_from, available_until")
                .eq("created_by_user_id", user!.id)
                .order("created_at", { ascending: false })
                .limit(50);
            if (error) { console.error("[Lojista] campaigns error:", error); return []; }
            return (data || []) as LojistaCampaign[];
        },
        enabled: !!user,
        staleTime: 30_000,
    });

    // ── 2. Posting History for all campaigns ──
    const campaignIds = campaigns.map(c => c.id);
    const { data: postings = [], isLoading: loadingPostings } = useQuery<LojistaPostingEntry[]>({
        queryKey: ["lojista-postings", campaignIds],
        queryFn: async () => {
            if (!campaignIds.length) return [];
            // @ts-expect-error - Some schemas might not be fully typed yet
            const { data, error } = await supabase.from("posting_history")
                .select("id, campaign_queue_id, whatsapp_group_id, operator_user_id, final_status, message_text, template_hash, execution_notes, posted_at")
                .in("campaign_queue_id", campaignIds)
                .order("posted_at", { ascending: false })
                .limit(200);
            if (error) { console.error("[Lojista] postings error:", error); return []; }
            return (data || []) as LojistaPostingEntry[];
        },
        enabled: campaignIds.length > 0,
        staleTime: 20_000,
    });

    // ── 3. Per-campaign stats map ──
    const campaignStatsMap = new Map<string, CampaignStats>();
    campaignIds.forEach(id => {
        const entries = postings.filter(p => p.campaign_queue_id === id);
        const uniqueGroupIds = new Set(entries.map(e => e.whatsapp_group_id));
        const sorted = entries.sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
        campaignStatsMap.set(id, {
            totalPosts: entries.length,
            lastPostedAt: sorted[0]?.posted_at || null,
            uniqueGroups: uniqueGroupIds.size,
        });
    });

    // ── 4. KPIs ──
    const allUniqueGroups = new Set(postings.map(p => p.whatsapp_group_id));
    const kpis: LojistaKPIs = {
        totalCampaigns: campaigns.length,
        activeCampaigns: campaigns.filter(c => ACTIVE_STATUSES.includes(c.status) || QUEUED_STATUSES.includes(c.status)).length,
        totalPosts: postings.length,
        uniqueGroups: allUniqueGroups.size,
    };

    // ── 5. Helper: get postings for a campaign ──
    function getPostingsForCampaign(campaignId: string): LojistaPostingEntry[] {
        return postings
            .filter(p => p.campaign_queue_id === campaignId)
            .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
    }

    // ── 6. Realtime ──
    useEffect(() => {
        if (!user) return;
        const ch = supabase
            .channel(`lojista-campaigns-${user.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "campaign_queue" }, () => {
                queryClient.invalidateQueries({ queryKey: ["lojista-campaigns"] });
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "posting_history" }, () => {
                queryClient.invalidateQueries({ queryKey: ["lojista-postings"] });
            })
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, [user, queryClient]);

    return {
        campaigns,
        postings,
        campaignStatsMap,
        kpis,
        getPostingsForCampaign,
        deriveCampaignStatus,
        isLoading: loadingCampaigns,
        loadingPostings,
        hasError: errorCampaigns,
        refetchAll: () => {
            queryClient.invalidateQueries({ queryKey: ["lojista-campaigns"] });
            queryClient.invalidateQueries({ queryKey: ["lojista-postings"] });
        },
    };
}
