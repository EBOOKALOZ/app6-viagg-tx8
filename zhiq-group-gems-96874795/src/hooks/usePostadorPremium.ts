import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMotoboyCommission } from "@/hooks/useMotoboyCommission";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
    PendingQueueItem,
    PostadorKPIsView,
    PostadorOperatorKPIsView,
    PostadorHistoryViewItem,
    PostadorMyHistoryItem,
    GroupRuntimeView,
    PostadorOperacionalBoardItem,
} from "@/types/postador";

// ═══════════════════════════════════════
// usePostadorPremium — Backend Real (Views + RPCs)
// POSTADOR 2 — com fluxo de reserva (claim)/confirmação/prova
// ═══════════════════════════════════════

export function usePostadorPremium() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const commission = useMotoboyCommission(user?.id);
    const [actionState, setActionState] = useState<Record<string, "loading" | "success" | "error">>({});

    // Guardas contra clique duplo
    const pendingKeys = useRef<Set<string>>(new Set());
    const confirmedKeys = useRef<Set<string>>(new Set());

    // ── 1. Fila de Campanhas Pendentes ──
    const {
        data: pendingQueue = [],
        isLoading: loadingQueue,
        isError: errorQueue,
    } = useQuery<PendingQueueItem[]>({
        queryKey: ["postador-premium-queue"],
        queryFn: async () => {
            const { data, error } = await (supabase.from("postador_queue_cards_view") as any)
                .select("*")
                .order("priority", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false })
                .limit(50);
            if (error) { console.error("[PostadorPremium] queue error:", error); return []; }
            return (data || []) as PendingQueueItem[];
        },
        enabled: !!user,
        staleTime: 20_000,
    });

    // ── 2. KPIs Globais ──
    const {
        data: kpisGlobal,
        isLoading: loadingKpis,
    } = useQuery<PostadorKPIsView>({
        queryKey: ["postador-premium-kpis"],
        queryFn: async () => {
            const { data, error } = await (supabase.from("postador_kpis_view") as any)
                .select("*").limit(1).maybeSingle();
            if (error) { console.error("[PostadorPremium] kpis error:", error); return { pending_count: 0, posted_count: 0, cancelled_count: 0, last_posted_at: null }; }
            return (data || { pending_count: 0, posted_count: 0, cancelled_count: 0, last_posted_at: null }) as PostadorKPIsView;
        },
        enabled: !!user,
        staleTime: 15_000,
    });

    // ── 3. KPIs do Operador ──
    const {
        data: kpisOperator,
        isLoading: loadingOperatorKpis,
    } = useQuery<PostadorOperatorKPIsView>({
        queryKey: ["postador-premium-operator-kpis", user?.id],
        queryFn: async () => {
            const { data, error } = await (supabase.from("postador_operator_kpis_view") as any)
                .select("*").eq("operator_user_id", user!.id).maybeSingle();
            if (error) { console.error("[PostadorPremium] operator kpis error:", error); return { operator_user_id: user!.id, my_posted_count: 0, my_last_posted_at: null }; }
            return (data || { operator_user_id: user!.id, my_posted_count: 0, my_last_posted_at: null }) as PostadorOperatorKPIsView;
        },
        enabled: !!user,
        staleTime: 15_000,
    });

    // ── 4. Histórico Geral ──
    const {
        data: historyAll = [],
        isLoading: loadingHistory,
    } = useQuery<PostadorHistoryViewItem[]>({
        queryKey: ["postador-premium-history"],
        queryFn: async () => {
            const { data, error } = await (supabase.from("postador_history_view") as any)
                .select("*").order("posted_at", { ascending: false }).limit(30);
            if (error) { console.error("[PostadorPremium] history error:", error); return []; }
            return (data || []) as PostadorHistoryViewItem[];
        },
        enabled: !!user,
        staleTime: 20_000,
    });

    // ── 5. Meu Histórico ──
    const {
        data: historyMine = [],
        isLoading: loadingMyHistory,
    } = useQuery<PostadorMyHistoryItem[]>({
        queryKey: ["postador-premium-my-history", user?.id],
        queryFn: async () => {
            const { data, error } = await (supabase.from("postador_history_by_operator_view") as any)
                .select("*").eq("operator_user_id", user!.id).order("posted_at", { ascending: false }).limit(30);
            if (error) { console.error("[PostadorPremium] my history error:", error); return []; }
            return (data || []) as PostadorMyHistoryItem[];
        },
        enabled: !!user,
        staleTime: 20_000,
    });

    // ── 6. Runtime de Postagem de Grupos (Cooldown por Grupo) ──
    const {
        data: groupRuntimes = [],
        isLoading: loadingRuntimes,
    } = useQuery<GroupRuntimeView[]>({
        queryKey: ["postador-premium-runtimes", user?.id],
        queryFn: async () => {
            const { data, error } = await (supabase.from("group_posting_runtime_view") as any)
                .select("*")
                .order("updated_at", { ascending: false });
            if (error) { console.error("[PostadorPremium] erro nos runtimes:", error); return []; }
            return (data || []) as GroupRuntimeView[];
        },
        enabled: !!user,
        staleTime: 10_000,
    });

    // Mapa de runtime para buscas rápidas
    const runtimeMap = new Map<string, GroupRuntimeView>();
    groupRuntimes.forEach((r) => runtimeMap.set(r.whatsapp_group_id, r));

    // Grupos prontos para postar (fora do tempo de espera/cooldown)
    const groupsReady = groupRuntimes.filter((r) => !r.is_in_cooldown);
    const groupsInCooldown = groupRuntimes.filter((r) => r.is_in_cooldown);

    // ═══════════════════════════════════════
    // 7. Operational Board (postador_operacional_board)
    // Fonte de verdade: target_id é a chave primária
    // ═══════════════════════════════════════
    const {
        data: operationalBoard = [],
        isLoading: loadingBoard,
    } = useQuery<PostadorOperacionalBoardItem[]>({
        queryKey: ["postador-operational-board"],
        queryFn: async () => {
            const { data, error } = await (supabase.from("postador_operacional_board") as any)
                .select("*")
                .in("target_status", ["available", "pending", "claimed"])
                .order("target_created_at", { ascending: false })
                .limit(50);
            if (error) { console.error("[PostadorPremium] board error:", error); return []; }
            return (data || []) as PostadorOperacionalBoardItem[];
        },
        enabled: !!user,
        staleTime: 15_000,
    });

    // ═══════════════════════════════════════
    // 8. CONFIRMAR POSTAGEM — orientado por target_id
    // claimTarget(targetId) + confirmWithProof(targetId, ...)
    // ═══════════════════════════════════════
    const confirmPosting = useCallback(
        async (
            targetId: string,
            proofType?: string,
            proofText?: string,
            proofUrl?: string,
            postedMessage?: string,
            notes?: string,
        ) => {
            if (!user) return;

            // Guard key: usa target_id diretamente — SEM composição manual
            const key = targetId;

            // GUARD: clique duplo
            if (pendingKeys.current.has(key)) {
                console.warn("[PostadorPremium] Chamada duplicada bloqueada:", key);
                return;
            }
            if (confirmedKeys.current.has(key)) {
                console.warn("[PostadorPremium] Re-confirmação bloqueada:", key);
                return;
            }

            pendingKeys.current.add(key);
            setActionState((prev) => ({ ...prev, [key]: "loading" }));

            try {
                // ═══════════════════════════════════════
                // Step 1: CLAIM via target_id (POSTADOR 2)
                // ═══════════════════════════════════════
                let usedClaimFlow = false;

                let claimData: any = null;
                let claimErr: any = null;
                try {
                    const claimResult = await (supabase.rpc as any)(
                        "claim_campaign_posting_target",
                        { p_target_id: targetId }
                    );
                    claimData = claimResult.data;
                    claimErr = claimResult.error;
                } catch {
                    claimData = null;
                    claimErr = { code: "RPC_NOT_FOUND" };
                }

                if (!claimErr && claimData && claimData.ok !== false) {
                    usedClaimFlow = true;
                }
                // Se o reservamento (claim) falhar, tenta confirmar direto (target pode já estar reservado)

                // ═══════════════════════════════════════
                // Step 2: CONFIRM via target_id com prova (POSTADOR 2)
                // ═══════════════════════════════════════
                let success = false;

                let confirmData: any = null;
                let confirmErr: any = null;
                try {
                    const confirmResult = await (supabase.rpc as any)(
                        "confirm_campaign_posting",
                        {
                            p_target_id: targetId,
                            p_proof_type: proofType || null,
                            p_proof_text: proofText || null,
                            p_proof_url: proofUrl || null,
                            p_posted_message: postedMessage || null,
                            p_notes: notes || null,
                        }
                    );
                    confirmData = confirmResult.data;
                    confirmErr = confirmResult.error;
                } catch {
                    confirmData = null;
                    confirmErr = { code: "RPC_NOT_FOUND" };
                }

                if (!confirmErr && confirmData && confirmData.ok !== false) {
                    success = true;

                    // ═══════════════════════════════════════
                    // 💰 PONTO_INTEGRACAO_PAGAMENTO — Modelo Econômico Postador
                    //
                    // Cada postagem confirmada COM PROVA gera evento elegível financeiro.
                    //
                    // Estrutura econômica:
                    //   Lojista paga ≈ R$ 12,60 por campanha/alvo
                    //   Base operacional motoboy: R$ 9,00 (referência: R$ 3,00 por postagem)
                    //   Margem direta da plataforma: R$ 3,60
                    //
                    // 📊 PONTO_INTEGRACAO_COMISSAO_DINAMICA
                    //   Comissão dinâmica incide sobre a base do motoboy (R$ 9,00)
                    //   Taxa varia conforme quantidade de grupos válidos e tier do motoboy
                    //
                    // ⚠️ GRUPO_SEM_POSTAGEM_PERDE_BENEFICIO
                    //   Grupo sem postagem real confirmada não conta para:
                    //   - comissão válida
                    //   - tier de benefício
                    //   - elegibilidade financeira
                    // ═══════════════════════════════════════
                    console.log("[PostadorPremium] 💰 PAYOUT_ELIGIBLE:", {
                        targetId, userId: user.id,
                        proofType, proofUrl, baseAmountBrl: 3.00,
                    });
                } else if (confirmErr || (confirmData && confirmData.ok === false)) {
                    const reason = confirmData?.reason || "Falha ao confirmar postagem.";
                    toast.error(`❌ ${reason}`);
                    setActionState((prev) => ({ ...prev, [key]: "error" }));
                    return;
                }

                // ═══════════════════════════════════════
                // FALLBACK LEGADO: register_postador_action (POSTADOR 1)
                // Isolado — só é ativado se ambas RPCs do POSTADOR 2 falharem.
                // NÃO contamina a arquitetura principal baseada em target_id.
                // ═══════════════════════════════════════
                if (!success) {
                    console.warn("[PostadorPremium] POSTADOR 2 RPCs failed. Attempting LEGACY fallback.");
                    // NOTE: O fallback não usa target_id. Usa campaignQueueId + groupId
                    // extraidos do board item se disponível. Isso é temporário.
                    const boardItem = operationalBoard.find(b => b.target_id === targetId);
                    const { data, error } = await (supabase.rpc as any)(
                        "register_postador_action",
                        {
                            p_campaign_queue_id: boardItem?.campaign_queue_id || targetId,
                            p_motoboy_user_id: user.id,
                            p_whatsapp_group_id: boardItem?.whatsapp_group_id || null,
                            p_execution_notes: notes || null,
                        }
                    );

                    if (error) throw error;

                    if (data && typeof data === "object" && data.ok === false) {
                        const reason = data.reason || data.error || "Ação não permitida no momento.";
                        toast.error(`❌ ${reason}`);
                        setActionState((prev) => ({ ...prev, [key]: "error" }));
                        return;
                    }

                    console.log("[PostadorPremium] 💰 PAYOUT_ELIGIBLE (legacy fallback):", {
                        targetId, userId: user.id, amountBrl: 3.00,
                    });
                }

                // ── Success ──
                toast.success("✅ Postagem confirmada com sucesso!");
                setActionState((prev) => ({ ...prev, [key]: "success" }));

                confirmedKeys.current.add(key);
                setTimeout(() => confirmedKeys.current.delete(key), 5000);

                invalidateAll();

                setTimeout(() => setActionState((prev) => {
                    const n = { ...prev }; delete n[key]; return n;
                }), 3000);
            } catch (err: any) {
                console.error("[PostadorPremium] confirmPosting error:", err);
                toast.error("Ocorreu um erro inesperado. Tente novamente.");
                setActionState((prev) => ({ ...prev, [key]: "error" }));
            } finally {
                pendingKeys.current.delete(key);
                setTimeout(() => {
                    setActionState((prev) => {
                        if (prev[key] === "error") {
                            const n = { ...prev }; delete n[key]; return n;
                        }
                        return prev;
                    });
                }, 4000);
            }
        },
        [user, queryClient, operationalBoard]
    );

    // ── 8b. LIBERAR RESERVA (RELEASE CLAIM) — operador libera voluntariamente ──
    const releaseClaim = useCallback(
        async (targetId: string) => {
            if (!user) return;

            const key = targetId;
            if (pendingKeys.current.has(key)) return;

            pendingKeys.current.add(key);
            setActionState((prev) => ({ ...prev, [key]: "loading" }));

            try {
                const { data, error } = await (supabase.rpc as any)(
                    "release_my_claim",
                    { p_target_id: targetId }
                );

                if (error) throw error;

                if (data && data.ok === false) {
                    toast.error(data.reason || "Não foi possível liberar o claim.");
                    setActionState((prev) => ({ ...prev, [key]: "error" }));
                    return;
                }

                toast.success("Claim liberado com sucesso.");
                setActionState((prev) => { const n = { ...prev }; delete n[key]; return n; });
                invalidateAll();
            } catch (err: any) {
                console.error("[PostadorPremium] releaseClaim error:", err);
                toast.error("Erro ao liberar claim.");
                setActionState((prev) => ({ ...prev, [key]: "error" }));
            } finally {
                pendingKeys.current.delete(key);
                setTimeout(() => {
                    setActionState((prev) => {
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

    // ── 9. Invalidate All ──
    const invalidateAll = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["postador-premium-queue"] });
        queryClient.invalidateQueries({ queryKey: ["postador-premium-kpis"] });
        queryClient.invalidateQueries({ queryKey: ["postador-premium-operator-kpis"] });
        queryClient.invalidateQueries({ queryKey: ["postador-premium-history"] });
        queryClient.invalidateQueries({ queryKey: ["postador-premium-my-history"] });
        queryClient.invalidateQueries({ queryKey: ["postador-premium-runtimes"] });
        queryClient.invalidateQueries({ queryKey: ["postador-operational-board"] });
    }, [queryClient]);

    // ── 10. Realtime Subscriptions ──
    useEffect(() => {
        if (!user) return;
        const ch = supabase
            .channel(`postador-premium-${user.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "campaign_queue" }, () => {
                queryClient.invalidateQueries({ queryKey: ["postador-premium-queue"] });
                queryClient.invalidateQueries({ queryKey: ["postador-premium-kpis"] });
                queryClient.invalidateQueries({ queryKey: ["postador-premium-operator-kpis"] });
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "posting_history" }, () => {
                queryClient.invalidateQueries({ queryKey: ["postador-premium-history"] });
                queryClient.invalidateQueries({ queryKey: ["postador-premium-my-history"] });
                queryClient.invalidateQueries({ queryKey: ["postador-premium-kpis"] });
                queryClient.invalidateQueries({ queryKey: ["postador-premium-operator-kpis"] });
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "group_posting_runtime" }, () => {
                queryClient.invalidateQueries({ queryKey: ["postador-premium-runtimes"] });
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "campaign_posting_targets" }, () => {
                queryClient.invalidateQueries({ queryKey: ["postador-operational-board"] });
            })
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, [user, queryClient]);

    return {
        // Data
        pendingQueue,
        operationalBoard,
        kpis: kpisGlobal || { pending_count: 0, posted_count: 0, cancelled_count: 0, last_posted_at: null },
        operatorKpis: kpisOperator || { operator_user_id: user?.id || "", my_posted_count: 0, my_last_posted_at: null },
        historyAll,
        historyMine,
        groupRuntimes,
        runtimeMap,
        groupsReady,
        groupsInCooldown,

        // Commission (from useMotoboyCommission)
        commission,

        // Loading
        isLoading: loadingQueue || loadingKpis,
        loadingQueue,
        loadingKpis,
        loadingOperatorKpis,
        loadingHistory,
        loadingMyHistory,
        loadingRuntimes,
        loadingBoard,
        hasError: errorQueue,

        // Actions — target_id como chave principal
        confirmPosting,
        releaseClaim,
        actionState,
        refetchAll: invalidateAll,
    };
}
