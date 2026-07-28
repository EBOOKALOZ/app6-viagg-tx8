import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { deriveVisualStatus } from "@/lib/groupStatusUtils";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface AdminGroup {
    id: string;
    group_link: string;
    group_name: string;
    city_name: string;
    neighborhood: string;
    status: string; // visual derived
    created_at: string;
    members_count: number;
    min_members_valid: boolean;
    owner_user_id: string;
    owner_name?: string;
    owner_email?: string;
    last_posted_at?: string | null;
    is_valid: boolean;
    valid_for_commission: boolean;
    // Legacy aliases
    link: string;
    city: string;
    group_type: string;
    created_by: string;
}

export interface AdminOperator {
    id: string;
    name: string;
    email: string;
    city?: string;
    state?: string;
    status: string;
    groups_count: number;
    postings_count: number;
    last_activity?: string | null;
}

export interface QueueItem {
    id: string;
    title: string;
    campaign_type: string | null;
    whatsapp_group_id: string | null;
    target_city: string | null;
    target_region: string | null;
    status: string;
    priority: number;
    scheduled_for: string | null;
    posted_at: string | null;
    reviewed_at: string | null;
    operator_user_id: string | null;
    created_at: string;
    // view extras
    is_ready_now?: boolean;
    is_expired?: boolean;
    operational_bucket?: string;
}

export interface PostingLog {
    id: string;
    campaign_queue_id: string | null;
    created_by_user_id: string | null;
    operator_user_id: string | null;
    reviewed_by_user_id: string | null;
    whatsapp_group_id: string | null;
    merchant_store_id: string | null;
    product_id: string | null;
    campaign_type: string | null;
    title: string | null;
    message_text: string | null;
    media_url: string | null;
    target_city: string | null;
    target_region: string | null;
    queue_status_before: string | null;
    final_status: string;
    execution_notes: string | null;
    error_message: string | null;
    scheduled_for: string | null;
    available_from: string | null;
    available_until: string | null;
    posted_at: string;
    created_at: string;
}

export interface RegionHealth {
    city: string;
    total_groups: number;
    valid_groups: number;
    pending_groups: number;
    operators: number;
    at_risk: number;
    health: "healthy" | "attention" | "critical";
}

export interface AdminPostingKPIs {
    totalGroups: number;
    validGroups: number;
    pendingGroups: number;
    rejectedGroups: number;
    activeCampaigns: number;
    queuePending: number;
    activeOperators: number;
    regionsCount: number;
    atRiskGroups: number;
    expiredGroups: number;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const daysSince = (dateStr: string | null | undefined): number => {
    if (!dateStr) return 999;
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// ─────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────
export function useAdminPostingData() {
    // 1. ALL GROUPS
    const groupsQuery = useQuery({
        queryKey: ["admin-posting-groups"],
        queryFn: async () => {
            const { data, error } = await (supabase
                .from("whatsapp_groups") as unknown)
                .select("id, group_link, group_name, city_name, neighborhood, validation_status, is_active, is_valid, valid_for_commission, members_count, created_at, owner_user_id")
                .order("created_at", { ascending: false });

            if (error) throw error;

            // Fetch owner profiles
            const ownerIds = [...new Set((data || []).map((g: unknown) => g.owner_user_id).filter(Boolean))];
            const profileMap: Record<string, { name: string; email: string }> = {};

            if (ownerIds.length > 0) {
                const { data: profiles } = await supabase
                    .from("profiles")
                    .select("id, name, email")
                    .in("id", ownerIds);

                (profiles || []).forEach((p: unknown) => {
                    profileMap[p.id] = { name: p.name || "Sem nome", email: p.email || "" };
                });
            }

            // Fetch last post dates
            const groupIds = (data || []).map((g: unknown) => g.id);
            const postMap: Record<string, string> = {};

            if (groupIds.length > 0) {
                const { data: posts } = await (supabase
                    .from("posting_history") as unknown)
                    .select("whatsapp_group_id, posted_at")
                    .in("whatsapp_group_id", groupIds)
                    .eq("final_status", "posted")
                    .order("posted_at", { ascending: false });

                (posts || []).forEach((p: unknown) => {
                    if (!postMap[p.whatsapp_group_id]) {
                        postMap[p.whatsapp_group_id] = p.posted_at;
                    }
                });
            }

            return (data || []).map((g: unknown): AdminGroup => ({
                id: g.id,
                group_link: g.group_link || "",
                group_name: g.group_name || "",
                city_name: g.city_name || "Desconhecida",
                neighborhood: g.neighborhood || "",
                status: deriveVisualStatus(g),
                created_at: g.created_at,
                members_count: g.members_count || 0,
                min_members_valid: (g.members_count || 0) >= 90,
                owner_user_id: g.owner_user_id || "",
                owner_name: profileMap[g.owner_user_id]?.name,
                owner_email: profileMap[g.owner_user_id]?.email,
                last_posted_at: postMap[g.id] || null,
                is_valid: Boolean(g.is_valid),
                valid_for_commission: Boolean(g.valid_for_commission),
                // Legacy aliases
                link: g.group_link || "",
                city: g.city_name || "Desconhecida",
                group_type: g.neighborhood || "Geral",
                created_by: g.owner_user_id || "",
            }));
        },
        staleTime: 30_000,
    });

    // 2. QUEUE — uses real v_campaign_queue_operational view
    const queueQuery = useQuery({
        queryKey: ["admin-posting-queue"],
        queryFn: async () => {
            // Try operational view first, fall back to direct table
            let result;
            try {
                result = await (supabase.from as unknown)("v_campaign_queue_operational")
                    .select("*")
                    .order("priority", { ascending: false })
                    .order("scheduled_for", { ascending: true, nullsFirst: false })
                    .order("created_at", { ascending: false })
                    .limit(100);
            } catch {
                result = await (supabase.from as unknown)("campaign_queue")
                    .select("id, title, campaign_type, whatsapp_group_id, target_city, target_region, status, priority, scheduled_for, posted_at, reviewed_at, operator_user_id, created_at")
                    .order("priority", { ascending: false })
                    .order("created_at", { ascending: false })
                    .limit(100);
            }

            if (result.error) {
                console.error('[AdminPosting] queue fetch error:', result.error);
                return [];
            }
            return (result.data || []) as QueueItem[];
        },
        staleTime: 30_000,
    });

    // 3. POSTING LOGS — uses real posting_history table
    const logsQuery = useQuery({
        queryKey: ["admin-posting-logs"],
        queryFn: async () => {
            const { data, error } = await (supabase
                .from("posting_history") as unknown)
                .select("id, campaign_queue_id, created_by_user_id, operator_user_id, whatsapp_group_id, campaign_type, title, target_city, target_region, queue_status_before, final_status, posted_at, execution_notes, error_message, created_at")
                .order("posted_at", { ascending: false })
                .limit(50);

            if (error) {
                console.error('[AdminPosting] logs fetch error:', error);
                return [];
            }
            return (data || []) as PostingLog[];
        },
        staleTime: 30_000,
    });

    // 4. OPERATORS (motoboys with groups)
    const operatorsQuery = useQuery({
        queryKey: ["admin-posting-operators"],
        queryFn: async () => {
            const { data: profiles, error } = await supabase
                .from("profiles")
                .select("id, name, email, city, state, status")
                .eq("user_type", "motoboy")
                .order("name");

            if (error) throw error;

            // Count groups per operator
            const { data: groupCounts } = await (supabase
                .from("whatsapp_groups") as unknown)
                .select("created_by, id")
                .eq("is_active", true);

            const groupMap: Record<string, number> = {};
            (groupCounts || []).forEach((g: unknown) => {
                groupMap[g.created_by] = (groupMap[g.created_by] || 0) + 1;
            });

            // Count postings per operator
            const { data: postCounts } = await (supabase
                .from("posting_history") as unknown)
                .select("operator_user_id, id")
                .eq("final_status", "posted");

            const postMap: Record<string, number> = {};
            (postCounts || []).forEach((p: unknown) => {
                if (p.operator_user_id) postMap[p.operator_user_id] = (postMap[p.operator_user_id] || 0) + 1;
            });

            return (profiles || [])
                .filter((p: unknown) => groupMap[p.id] || postMap[p.id])
                .map((p: unknown): AdminOperator => ({
                    id: p.id,
                    name: p.name || "Sem nome",
                    email: p.email || "",
                    city: p.city,
                    state: p.state,
                    status: p.status || "ativo",
                    groups_count: groupMap[p.id] || 0,
                    postings_count: postMap[p.id] || 0,
                    last_activity: null,
                }));
        },
        staleTime: 60_000,
    });

    // ─────────────────────────────────────────────
    // Derived data
    // ─────────────────────────────────────────────
    const groups = groupsQuery.data || [];
    const queue = queueQuery.data || [];
    const logs = logsQuery.data || [];
    const operators = operatorsQuery.data || [];

    const validGroups = groups.filter(
        (g) => g.status === "ativo" && g.min_members_valid && daysSince(g.last_posted_at) <= 30
    );
    const pendingGroups = groups.filter((g) => g.status === "em_analise");
    const rejectedGroups = groups.filter((g) => g.status === "bloqueado");
    const expiredGroups = groups.filter(
        (g) => g.status === "ativo" && daysSince(g.last_posted_at) > 30
    );
    const atRiskGroups = groups.filter(
        (g) => g.status === "ativo" && daysSince(g.last_posted_at) > 20 && daysSince(g.last_posted_at) <= 30
    );

    const queuePending = queue.filter((q) => q.status === "pending" || q.status === "scheduled");

    const activeOperators = operators.filter((o) => o.groups_count > 0);

    // Cities / Regions
    const citiesSet = new Set<string>(groups.map((g) => g.city).filter((c): c is string => Boolean(c)));
    const regionHealth: RegionHealth[] = [...citiesSet].map((city: string) => {
        const cityGroups = groups.filter((g) => g.city === city);
        const valid = cityGroups.filter(
            (g) => g.status === "ativo" && g.min_members_valid && daysSince(g.last_posted_at) <= 30
        ).length;
        const pending = cityGroups.filter((g) => g.status === "em_analise").length;
        const risk = cityGroups.filter(
            (g) => g.status === "ativo" && daysSince(g.last_posted_at) > 20
        ).length;
        const ops = new Set(cityGroups.map((g) => g.created_by).filter(Boolean)).size;

        let health: "healthy" | "attention" | "critical" = "healthy";
        if (valid === 0 || ops === 0) health = "critical";
        else if (risk > 0 || pending > valid) health = "attention";

        return {
            city,
            total_groups: cityGroups.length,
            valid_groups: valid,
            pending_groups: pending,
            operators: ops,
            at_risk: risk,
            health,
        };
    }).sort((a, b) => {
        const order = { critical: 0, attention: 1, healthy: 2 };
        return order[a.health] - order[b.health];
    });

    const kpis: AdminPostingKPIs = {
        totalGroups: groups.length,
        validGroups: validGroups.length,
        pendingGroups: pendingGroups.length,
        rejectedGroups: rejectedGroups.length,
        activeCampaigns: queue.filter((q) => q.status === "active").length,
        queuePending: queuePending.length,
        activeOperators: activeOperators.length,
        regionsCount: citiesSet.size,
        atRiskGroups: atRiskGroups.length,
        expiredGroups: expiredGroups.length,
    };

    // Alerts
    const alerts: { type: "danger" | "warning" | "info"; label: string; count: number }[] = [];
    if (atRiskGroups.length > 0) alerts.push({ type: "danger", label: "Grupos próximos de perder validade (>20 dias)", count: atRiskGroups.length });
    if (expiredGroups.length > 0) alerts.push({ type: "danger", label: "Grupos sem postagem há 30+ dias", count: expiredGroups.length });
    if (pendingGroups.length > 0) alerts.push({ type: "warning", label: "Grupos pendentes de auditoria", count: pendingGroups.length });
    const lowMemberGroups = groups.filter((g) => g.status === "ativo" && !g.min_members_valid);
    if (lowMemberGroups.length > 0) alerts.push({ type: "warning", label: "Grupos abaixo de 90 membros", count: lowMemberGroups.length });
    const criticalRegions = regionHealth.filter((r) => r.health === "critical");
    if (criticalRegions.length > 0) alerts.push({ type: "info", label: "Regiões com cobertura fraca", count: criticalRegions.length });

    return {
        groups,
        validGroups,
        pendingGroups,
        rejectedGroups,
        expiredGroups,
        atRiskGroups,
        queue,
        queuePending,
        logs,
        operators,
        activeOperators,
        regionHealth,
        kpis,
        alerts,
        isLoading: groupsQuery.isLoading || queueQuery.isLoading || logsQuery.isLoading || operatorsQuery.isLoading,
        refetch: () => {
            groupsQuery.refetch();
            queueQuery.refetch();
            logsQuery.refetch();
            operatorsQuery.refetch();
        },
    };
}
