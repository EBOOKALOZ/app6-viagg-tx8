import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PostingLot, LotKPIs } from "@/types/postador";
import { startAuditEntry, finishAuditEntry, type AuditProfileType } from "@/lib/postingAudit";

// ═══════════════════════════════════════
// usePostadorLotes — POSTADOR 3
// Lotes de 3 produtos por loja
// ═══════════════════════════════════════

export function usePostadorLotes(callerProfileType: AuditProfileType = "postador") {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [actionState, setActionState] = useState<Record<string, "loading" | "success" | "error">>({});
    const pendingKeys = useRef<Set<string>>(new Set());
    const confirmedKeys = useRef<Set<string>>(new Set());

    // ── 1. Lotes Disponíveis (available + reservados por mim/claimed) ──
    const {
        data: availableLots = [],
        isLoading: loadingAvailable,
        isError: errorAvailable,
    } = useQuery<PostingLot[]>({
        queryKey: ["postador-lots-available", user?.id],
        queryFn: async () => {
            // @ts-expect-error - Type definitions may be missing
            const { data, error } = await supabase.from("postador_lotes_board")
                .select("*")
                .in("lot_status", ["available", "claimed"])
                .order("lot_created_at", { ascending: false })
                .limit(30);
            if (error) { console.error("[PostadorLotes] erro nos disponíveis:", error); return []; }
            return (data || []) as PostingLot[];
        },
        enabled: !!user,
        staleTime: 15_000,
    });

    // ── 2. Lotes em Espera (meus lotes em cooldown) ──
    const {
        data: cooldownLots = [],
        isLoading: loadingCooldown,
    } = useQuery<PostingLot[]>({
        queryKey: ["postador-lots-cooldown", user?.id],
        queryFn: async () => {
            // @ts-expect-error - Type definitions may be missing
            const { data, error } = await supabase.from("postador_lotes_board")
                .select("*")
                .eq("lot_status", "cooldown")
                .order("cooldown_until", { ascending: true })
                .limit(20);
            if (error) { console.error("[PostadorLotes] erro no cooldown:", error); return []; }
            return (data || []) as PostingLot[];
        },
        enabled: !!user,
        staleTime: 20_000,
    });

    // ── 3. Histórico (meus lotes postados) ──
    const {
        data: historyLots = [],
        isLoading: loadingHistory,
    } = useQuery<PostingLot[]>({
        queryKey: ["postador-lots-history", user?.id],
        queryFn: async () => {
            // @ts-expect-error - Type definitions may be missing
            const { data, error } = await supabase.from("postador_lotes_board")
                .select("*")
                .eq("operator_user_id", user!.id)
                .in("lot_status", ["cooldown", "posted", "expired"])
                .order("posted_at", { ascending: false })
                .limit(30);
            if (error) { console.error("[PostadorLotes] erro no histórico:", error); return []; }
            return (data || []) as PostingLot[];
        },
        enabled: !!user,
        staleTime: 20_000,
    });

    // ── 4. KPIs ──
    const {
        data: kpis,
        isLoading: loadingKpis,
    } = useQuery<LotKPIs>({
        queryKey: ["postador-lots-kpis", user?.id],
        queryFn: async () => {
            // @ts-expect-error - Type definitions may be missing
            const { data, error } = await supabase.rpc("get_my_lot_kpis");
            if (error) {
                console.error("[PostadorLotes] erro nos kpis:", error);
                return { ok: true, posted_count: 0, claimed_count: 0, cooldown_count: 0, last_posted_at: null, next_available_at: null };
            }
            return (data || { ok: true, posted_count: 0, claimed_count: 0, cooldown_count: 0, last_posted_at: null, next_available_at: null }) as LotKPIs;
        },
        enabled: !!user,
        staleTime: 15_000,
    });

    // ── 5. Reservar Lote (Claim Lot) ──
    const claimLot = useCallback(
        async (lotId: string) => {
            if (!user) return;
            const key = lotId;

            if (pendingKeys.current.has(key)) return;
            if (confirmedKeys.current.has(key)) return;

            pendingKeys.current.add(key);
            setActionState((prev) => ({ ...prev, [key]: "loading" }));

            try {
                // @ts-expect-error - Type definitions may be missing
                const { data, error } = await supabase.rpc(
                    "claim_posting_lot",
                    { p_lot_id: lotId }
                );

                if (error) throw error;
                if (data && data.ok === false) {
                    toast.error(`❌ ${data.reason || "Não foi possível reservar o lote."}`);
                    setActionState((prev) => ({ ...prev, [key]: "error" }));
                    return;
                }

                toast.success("📦 Lote reservado! Confirme a postagem em até 30 minutos.");
                setActionState((prev) => ({ ...prev, [key]: "success" }));
                confirmedKeys.current.add(key);
                setTimeout(() => confirmedKeys.current.delete(key), 3000);
                invalidateAll();

                setTimeout(() => setActionState((prev) => {
                    const n = { ...prev }; delete n[key]; return n;
                }), 3000);
            } catch (err: unknown) {
                console.error("[PostadorLotes] erro ao reservar lote (claimLot):", err);
                toast.error("Erro ao reservar lote. Tente novamente.");
                setActionState((prev) => ({ ...prev, [key]: "error" }));
            } finally {
                pendingKeys.current.delete(key);
                setTimeout(() => {
                    setActionState((prev) => {
                        if (prev[key] === "error") { const n = { ...prev }; delete n[key]; return n; }
                        return prev;
                    });
                }, 4000);
            }
        },
        [user, queryClient]
    );

    // ── 6. Confirmar Lote (Confirm Lot) ──
    const confirmLot = useCallback(
        async (lotId: string, proofType?: string, proofUrl?: string, proofText?: string, notes?: string) => {
            if (!user) return;
            const key = lotId;

            if (pendingKeys.current.has(key)) return;
            if (confirmedKeys.current.has(key)) return;

            pendingKeys.current.add(key);
            setActionState((prev) => ({ ...prev, [key]: "loading" }));

            // Auditoria operacional (silenciosa)
            const lot = availableLots.find((l) => l.lot_id === lotId);
            let auditId: string | null = null;
            auditId = await startAuditEntry({
                operatorId: user.id,
                profileType: callerProfileType,
            });

            try {
                // Passo 1: Reservar (Claim) se ainda não estiver reservado
                if (lot && lot.lot_status === "available") {
                    // @ts-expect-error - Type definitions may be missing
                    const { data: claimData, error: claimErr } = await supabase.rpc(
                        "claim_posting_lot",
                        { p_lot_id: lotId }
                    );
                    if (claimErr || (claimData && claimData.ok === false)) {
                        const reason = claimData?.reason || "Não foi possível reservar o lote.";
                        toast.error(`❌ ${reason}`);
                        setActionState((prev) => ({ ...prev, [key]: "error" }));
                        return;
                    }
                }

                // Passo 2: Confirmar
                // @ts-expect-error - Type definitions may be missing
                const { data, error } = await supabase.rpc(
                    "confirm_posting_lot",
                    {
                        p_lot_id: lotId,
                        p_proof_type: proofType || null,
                        p_proof_url: proofUrl || null,
                        p_proof_text: proofText || null,
                        p_notes: notes || null,
                    }
                );

                if (error) throw error;
                if (data && data.ok === false) {
                    toast.error(`❌ ${data.reason || "Erro ao confirmar postagem."}`);
                    setActionState((prev) => ({ ...prev, [key]: "error" }));
                    return;
                }

                if (auditId) void finishAuditEntry(auditId, { success: true, proofType, proofUrl });
                toast.success("✅ Lote confirmado! Cooldown de 6 dias ativado.");
                setActionState((prev) => ({ ...prev, [key]: "success" }));
                confirmedKeys.current.add(key);
                setTimeout(() => confirmedKeys.current.delete(key), 5000);
                invalidateAll();

                setTimeout(() => setActionState((prev) => {
                    const n = { ...prev }; delete n[key]; return n;
                }), 3000);
            } catch (err: unknown) {
                console.error("[PostadorLotes] erro ao confirmar lote (confirmLot):", err);
                if (auditId) void finishAuditEntry(auditId, { success: false, errorMessage: err instanceof Error ? err.message : String(err) });
                toast.error("Erro ao confirmar postagem. Tente novamente.");
                setActionState((prev) => ({ ...prev, [key]: "error" }));
            } finally {
                pendingKeys.current.delete(key);
                setTimeout(() => {
                    setActionState((prev) => {
                        if (prev[key] === "error") { const n = { ...prev }; delete n[key]; return n; }
                        return prev;
                    });
                }, 4000);
            }
        },
        [user, queryClient, availableLots]
    );

    // ── 7. Liberar Lote (Release Lot) ──
    const releaseLot = useCallback(
        async (lotId: string) => {
            if (!user) return;
            const key = lotId;
            if (pendingKeys.current.has(key)) return;

            pendingKeys.current.add(key);
            setActionState((prev) => ({ ...prev, [key]: "loading" }));

            try {
                // @ts-expect-error - Type definitions may be missing
                const { data, error } = await supabase.rpc(
                    "release_lot_claim",
                    { p_lot_id: lotId }
                );
                if (error) throw error;
                if (data && data.ok === false) {
                    toast.error(data.reason || "Não foi possível liberar.");
                    setActionState((prev) => ({ ...prev, [key]: "error" }));
                    return;
                }

                toast.success("Lote liberado com sucesso.");
                setActionState((prev) => { const n = { ...prev }; delete n[key]; return n; });
                invalidateAll();
            } catch (err: unknown) {
                console.error("[PostadorLotes] erro ao liberar lote (releaseLot):", err);
                toast.error("Erro ao liberar lote.");
                setActionState((prev) => ({ ...prev, [key]: "error" }));
            } finally {
                pendingKeys.current.delete(key);
                setTimeout(() => {
                    setActionState((prev) => {
                        if (prev[key] === "error") { const n = { ...prev }; delete n[key]; return n; }
                        return prev;
                    });
                }, 4000);
            }
        },
        [user, queryClient]
    );

    // ── 8. Rastrear Evento de Visualização (Track View Event) ──
    const trackView = useCallback(
        async (lotId: string) => {
            if (!user) return;
            try {
                // @ts-expect-error - Type definitions may be missing
                await supabase.from("posting_lot_events").insert({
                    lot_id: lotId,
                    event_type: "viewed",
                    user_id: user.id,
                });
            } catch { /* silent */ }
        },
        [user]
    );

    // ── 9. Invalidação Total (Invalidate All) ──
    const invalidateAll = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["postador-lots-available"] });
        queryClient.invalidateQueries({ queryKey: ["postador-lots-cooldown"] });
        queryClient.invalidateQueries({ queryKey: ["postador-lots-history"] });
        queryClient.invalidateQueries({ queryKey: ["postador-lots-kpis"] });
    }, [queryClient]);

    // ── 10. Tempo Real (Realtime) ──
    useEffect(() => {
        if (!user) return;
        const ch = supabase
            .channel(`postador-lots-${user.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "posting_lots" }, () => {
                invalidateAll();
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "posting_lot_items" }, () => {
                invalidateAll();
            })
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, [user, invalidateAll]);

    return {
        availableLots,
        cooldownLots,
        historyLots,
        kpis: kpis || { ok: true, posted_count: 0, claimed_count: 0, cooldown_count: 0, last_posted_at: null, next_available_at: null },
        isLoading: loadingAvailable || loadingKpis,
        loadingAvailable,
        loadingCooldown,
        loadingHistory,
        loadingKpis,
        hasError: errorAvailable,
        actionState,
        claimLot,
        confirmLot,
        releaseLot,
        trackView,
        refetchAll: invalidateAll,
    };
}
