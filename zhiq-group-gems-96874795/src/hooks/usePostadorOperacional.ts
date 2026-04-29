import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
    CampaignQueueItem,
    WhatsAppGroupItem,
    GroupRuntime,
    PostingHistoryEntry,
    PostadorKPIs,
    GroupPostingStatus,
    PostingCardItem,
    PostingEligibilityResult,
    ConfirmPostingResult,
    GroupPostingRuntimeItem,
    PostingHistoryItem,
} from "@/types/postador";

// Re-export all types for consumers
export type {
    CampaignQueueItem, WhatsAppGroupItem, GroupRuntime, PostingHistoryEntry,
    PostadorKPIs, GroupPostingStatus, PostingCardItem,
    PostingEligibilityResult, ConfirmPostingResult,
    GroupPostingRuntimeItem, PostingHistoryItem,
};

// ═══════════════════════════════════════
// Mapeamento de mensagens de erro
// ═══════════════════════════════════════
const ERROR_MESSAGES: Record<string, string> = {
    campaign_not_found: "Campanha não encontrada.",
    group_cooldown_active: "Este grupo ainda está em cooldown. Aguarde o término.",
    template_blocked: "Este conteúdo já foi usado recentemente neste grupo.",
    operator_delay_active: "Aguarde antes de confirmar nova postagem.",
    campaign_not_started: "A campanha ainda não começou.",
    campaign_expired: "A campanha expirou.",
    group_not_found: "Grupo não encontrado.",
    not_eligible: "Grupo não elegível para postagem neste momento.",
    unknown_error: "Ocorreu um erro inesperado. Tente novamente.",
    invalid_response: "Resposta inesperada do servidor. Tente novamente.",
};

function friendlyError(reason: string | null | undefined): string {
    if (!reason) return "Ação não permitida no momento.";
    return ERROR_MESSAGES[reason] || reason;
}

// ═══════════════════════════════════════
// GANCHO PRINCIPAL (MAIN HOOK)
// ═══════════════════════════════════════

export function usePostadorOperacional() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [postingState, setPostingState] = useState<Record<string, "loading" | "success" | "error">>({});

    // ── Guardas de Produção (Production Guards) ──
    // pendingKeys: previne chamadas RPC duplicadas simultâneas (clique duplo)
    const pendingKeys = useRef<Set<string>>(new Set());
    // confirmedKeys: bloqueia re-confirmação por 5s após o sucesso
    const confirmedKeys = useRef<Set<string>>(new Set());

    // ── 1. Perfil do Motoboy (para correspondência territorial de cidade) ──
    // motoboy_profiles confirmado: colunas cidade, estado, user_id
    const { data: motoboyProfile } = useQuery({
        queryKey: ["postador-motoboy-profile", user?.id],
        queryFn: async () => {
            const { data } = await (supabase.from("motoboy_profiles") as any)
                .select("cidade, estado")
                .eq("user_id", user!.id)
                .maybeSingle();
            return data as { cidade: string | null; estado: string | null } | null;
        },
        enabled: !!user,
        staleTime: 120_000,
    });

    // ── 2. Campaign Queue ──
    // CORR #2: Filter campaigns by real columns only (target_city, status)
    // CORR #1: No status='ativo' — using actual status enum values from campaign_queue
    const { data: campaigns = [], isLoading: loadingCampaigns, isError: errorCampaigns } = useQuery<CampaignQueueItem[]>({
        queryKey: ["postador-campaigns", user?.id, motoboyProfile?.cidade],
        queryFn: async () => {
            const { data, error } = await (supabase.from("campaign_queue") as any)
                .select("id, created_by_user_id, merchant_store_id, product_id, campaign_type, title, message_text, media_url, target_city, target_region, status, scheduled_for, available_from, available_until, created_at")
                .in("status", ["ready", "approved", "processing", "pending", "scheduled", "queued"])
                .order("created_at", { ascending: false })
                .limit(50);
            if (error) { console.error("[Postador] campaigns error:", error); return []; }

            // CORR #2: motoboy_profiles.cidade is ✓ confirmed real
            if (!motoboyProfile?.cidade) return (data || []) as CampaignQueueItem[];

            const normalize = (s: string | null) =>
                (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/\s*[-/]\s*[a-z]{2}\s*$/i, "").replace(/[^a-z0-9\s]/g, "")
                    .replace(/\s+/g, " ").trim();
            const mCity = normalize(motoboyProfile.cidade);

            return ((data || []) as CampaignQueueItem[]).filter((c) => {
                const cCity = normalize(c.target_city);
                if (!cCity) return true; // campaigns without city target → show to all
                if (!cCity) return true; // campanhas sem alvo de cidade → mostrar para todos
                return cCity === mCity;
            });
        },
        enabled: !!user,
        staleTime: 30_000,
    });
 
    // ── 3. WhatsApp Groups ──
    // CORR #1: uses owner_user_id, is_active, is_valid, validation_status (NOT user_id, NOT status='ativo')
    // CORR #6: uses group_name, city_name, state_code
    const { data: groups = [], isLoading: loadingGroups, isError: errorGroups } = useQuery<WhatsAppGroupItem[]>({
        queryKey: ["postador-groups", user?.id],
        queryFn: async () => {
            const { data, error } = await (supabase.from("whatsapp_groups") as any)
                .select("id, group_name, group_link, neighborhood, city_name, state_code, members_count, is_active, is_valid, validation_status, invalid_reason, last_posted_at, valid_for_commission, created_at, updated_at")
                .eq("owner_user_id", user!.id)
                .order("updated_at", { ascending: false })
                .limit(100);
            if (error) { console.error("[Postador] groups error:", error); return []; }
            return (data || []) as WhatsAppGroupItem[];
        },
        enabled: !!user,
        staleTime: 30_000,
    });

    // CORR #4: Only eligible groups (is_active=true, is_valid=true) for card matching
    const eligibleGroups = groups.filter((g) => g.is_active && g.is_valid);

    // ── 4. Group Posting Runtime ──
    // CORR #6: uses whatsapp_group_id (not group_id)
    const groupIds = groups.map((g) => g.id);
    const { data: runtimes = [], isLoading: loadingRuntime } = useQuery<GroupRuntime[]>({
        queryKey: ["postador-runtime", groupIds],
        queryFn: async () => {
            if (!groupIds.length) return [];
            const { data, error } = await (supabase.from("group_posting_runtime") as any)
                .select("id, whatsapp_group_id, last_posted_at, cooldown_until, next_allowed_at, total_posts, created_at, updated_at")
                .in("whatsapp_group_id", groupIds)
                .order("updated_at", { ascending: false });
            if (error) { console.error("[Postador] runtime error:", error); return []; }
            return (data || []) as GroupRuntime[];
        },
        enabled: groupIds.length > 0,
        staleTime: 15_000,
    });

    // Runtime map for quick lookups
    const runtimeMap = new Map<string, GroupRuntime>();
    runtimes.forEach((r) => runtimeMap.set(r.whatsapp_group_id, r));

    // ── 5. Posting History ──
    // CORR #3: includes execution_notes
    // CORR #6: uses operator_user_id, whatsapp_group_id, final_status
    const { data: history = [], isLoading: loadingHistory } = useQuery<PostingHistoryEntry[]>({
        queryKey: ["postador-history", user?.id],
        queryFn: async () => {
            const { data, error } = await (supabase.from("posting_history") as any)
                .select("id, campaign_queue_id, whatsapp_group_id, operator_user_id, final_status, template_hash, message_text, execution_notes, posted_at")
                .eq("operator_user_id", user!.id)
                .order("posted_at", { ascending: false })
                .limit(20);
            if (error) { console.error("[Postador] history error:", error); return []; }
            return (data || []) as PostingHistoryEntry[];
        },
        enabled: !!user,
        staleTime: 20_000,
    });
 
    // ── 6. KPIs ──
    const now = Date.now();
    const kpis: PostadorKPIs = {
        totalGroups: eligibleGroups.length,
        groupsInCooldown: eligibleGroups.filter((g) => {
            const rt = runtimeMap.get(g.id);
            return rt?.next_allowed_at && new Date(rt.next_allowed_at).getTime() > now;
        }).length,
        totalPostings: history.length,
        nextRelease: (() => {
            const upcoming = runtimes
                .map((r) => r.next_allowed_at)
                .filter((d): d is string => !!d && new Date(d).getTime() > now)
                .sort();
            return upcoming[0] || null;
        })(),
    };

    // ── 7. Group Status Derivation ──
    // CORR #1: Uses is_active, is_valid, validation_status — NOT status='ativo'
    function getGroupStatus(group: WhatsAppGroupItem): GroupPostingStatus {
        if (!group.is_active) return "inactive";
        if (!group.is_valid && group.validation_status !== "approved") return "invalid";
        const rt = runtimeMap.get(group.id);
        if (rt?.next_allowed_at && new Date(rt.next_allowed_at).getTime() > now) return "cooldown";
        return "eligible";
    }
 
    // ── 8. Build PostingCardItem items per campaign ──
    // CORR #4: Campaigns are the primary dimension. Each campaign lists its eligible groups.
    // Not a blind cross-product — only eligible groups are included.
    function buildCardsForCampaign(campaign: CampaignQueueItem): PostingCardItem[] {
        return eligibleGroups.map((group) => ({
            campaign,
            group,
            runtime: runtimeMap.get(group.id) || null,
            groupStatus: getGroupStatus(group),
            operator_user_id: user?.id || "",
            template_hash: null,
        }));
    }

    // ── 9. Ação Marcar como Postado (REFORÇADA/HARDENED) ──
    const markAsPosted = useCallback(
        async (campaignId: string, groupId: string, templateHash?: string | null, notes?: string | null) => {
            if (!user) return;

            const key = `${campaignId}-${groupId}`;

            // GUARDA 1: Prevenir chamadas duplicadas simultâneas (clique duplo)
            if (pendingKeys.current.has(key)) {
                console.warn("[Postador] Chamada duplicada bloqueada:", key);
                return;
            }
            // GUARDA 2: Prevenir re-confirmação em até 5s após o sucesso
            if (confirmedKeys.current.has(key)) {
                console.warn("[Postador] Re-confirmação bloqueada (cooldown):", key);
                return;
            }

            pendingKeys.current.add(key);
            setPostingState((prev) => ({ ...prev, [key]: "loading" }));

            try {
                // Step 1: Check eligibility via RPC
                const { data: eligibility, error: eligErr } = await (supabase.rpc as any)(
                    "check_group_posting_eligibility",
                    {
                        p_campaign_queue_id: campaignId,
                        p_whatsapp_group_id: groupId,
                        p_template_hash: templateHash || null,
                        p_operator_user_id: user.id,
                    }
                );

                if (eligErr) throw eligErr;

                // GUARD 3: Safe response parsing
                if (!eligibility || typeof eligibility !== "object") {
                    toast.error(friendlyError("invalid_response"));
                    setPostingState((prev) => ({ ...prev, [key]: "error" }));
                    return;
                }

                const eligResult = eligibility as PostingEligibilityResult;

                if (eligResult && !eligResult.ok) {
                    const reason = eligResult.reason || eligResult.error || "not_eligible";
                    toast.error(friendlyError(reason));
                    setPostingState((prev) => ({ ...prev, [key]: "error" }));
                    return;
                }

                // Step 2: Confirm posting with cooldown via RPC
                const { data: confirmResult, error: confErr } = await (supabase.rpc as any)(
                    "confirm_posting_with_cooldown",
                    {
                        p_campaign_queue_id: campaignId,
                        p_whatsapp_group_id: groupId,
                        p_operator_user_id: user.id,
                        p_template_hash: templateHash || null,
                        p_execution_notes: notes || null,
                    }
                );

                if (confErr) throw confErr;

                // GUARD 4: Safe response parsing
                if (!confirmResult || typeof confirmResult !== "object") {
                    toast.error(friendlyError("invalid_response"));
                    setPostingState((prev) => ({ ...prev, [key]: "error" }));
                    return;
                }

                const confData = confirmResult as ConfirmPostingResult;
                if (confData && confData.ok === false) {
                    toast.error(friendlyError(confData.reason || confData.error));
                    setPostingState((prev) => ({ ...prev, [key]: "error" }));
                    return;
                }

                // ── Success ──
                toast.success("✅ Postagem confirmada com sucesso!");
                setPostingState((prev) => ({ ...prev, [key]: "success" }));

                // GUARD 5: Post-success cooldown lock (5s)
                confirmedKeys.current.add(key);
                setTimeout(() => confirmedKeys.current.delete(key), 5000);

                // GUARD 6: Smarter invalidation — only runtime and history changed
                // Campaigns did NOT change, so skip campaign refetch to avoid flicker
                queryClient.invalidateQueries({ queryKey: ["postador-runtime"] });
                queryClient.invalidateQueries({ queryKey: ["postador-history"] });

                // Clear success visual after 3s
                setTimeout(() => setPostingState((prev) => { const n = { ...prev }; delete n[key]; return n; }), 3000);
            } catch (err: any) {
                console.error("[Postador] markAsPosted error:", err);
                // GUARDA 7: Nunca expor erro bruto — sempre use mensagem amigável
                toast.error(friendlyError("unknown_error"));
                setPostingState((prev) => ({ ...prev, [key]: "error" }));
            } finally {
                // Always release the pending lock
                pendingKeys.current.delete(key);
                // Clear error state after 4s
                setTimeout(() => {
                    setPostingState((prev) => {
                        if (prev[key] === "error") {
                            const n = { ...prev }; delete n[key]; return n;
                        }
                        return prev;
                    });
                }, 4000);
            }
        },
        [user, queryClient]
    );

    // ── 10. Realtime Subscriptions ──
    // CORR #5: Apenas assinar tabelas que mudam operacionalmente
    // - posting_history: novas entradas após postar
    // - group_posting_runtime: mudanças de cooldown
    // - campaign_queue: novas campanhas ou campanhas atualizadas
    // NÃO whatsapp_groups (raramente muda durante uma sessão)
    useEffect(() => {
        if (!user) return;
        const ch = supabase
            .channel(`postador-ops-${user.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "campaign_queue" }, () => {
                queryClient.invalidateQueries({ queryKey: ["postador-campaigns"] });
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "posting_history" }, () => {
                queryClient.invalidateQueries({ queryKey: ["postador-history"] });
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "group_posting_runtime" }, () => {
                queryClient.invalidateQueries({ queryKey: ["postador-runtime"] });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(ch);
        };
    }, [user, queryClient]);

    return {
        // Data
        campaigns,
        groups,
        eligibleGroups,
        runtimes,
        runtimeMap,
        history,
        kpis,
        motoboyProfile,

        // Loading states
        isLoading: loadingCampaigns || loadingGroups,
        hasError: errorCampaigns || errorGroups,
        loadingCampaigns,
        loadingGroups,
        loadingRuntime,
        loadingHistory,

        // Derived
        getGroupStatus,
        buildCardsForCampaign,

        // Actions
        markAsPosted,
        postingState,

        // Refresh
        refetchAll: () => {
            queryClient.invalidateQueries({ queryKey: ["postador-campaigns"] });
            queryClient.invalidateQueries({ queryKey: ["postador-groups"] });
            queryClient.invalidateQueries({ queryKey: ["postador-runtime"] });
            queryClient.invalidateQueries({ queryKey: ["postador-history"] });
        },
    };
}
