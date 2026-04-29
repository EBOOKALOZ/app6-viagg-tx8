import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StatementEntry } from "@/skills/pay/payTypes";
import { REFETCH_INTERVAL_MS } from "@/skills/pay/payConstants";

const PAGE_SIZE = 30;

// ═══════════════════════════════════════════════════════
// Financial Statement — Paginated ledger with running balance
// ═══════════════════════════════════════════════════════
export function usePayFinancialStatement(filters?: {
  sourceType?: string;
  search?: string;
  period?: string;
  page?: number;
}) {
  const page = filters?.page || 0;

  return useQuery({
    queryKey: ["pay-financial-statement", filters],
    queryFn: async (): Promise<{ rows: StatementEntry[]; count: number }> => {
      let q = supabase
        .from("ledger_entries")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filters?.sourceType && filters.sourceType !== "all") {
        q = q.eq("source_type", filters.sourceType);
      }

      if (filters?.period && filters.period !== "all") {
        const now = new Date();
        let start: Date;
        if (filters.period === "today") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        else if (filters.period === "7d") { start = new Date(); start.setDate(start.getDate() - 7); }
        else if (filters.period === "30d") { start = new Date(); start.setDate(start.getDate() - 30); }
        else if (filters.period === "90d") { start = new Date(); start.setDate(start.getDate() - 90); }
        else start = new Date(0);
        q = q.gte("created_at", start.toISOString());
      }

      if (filters?.search?.trim()) {
        const term = filters.search.trim();
        q = q.or(`source_id.eq.${term},idempotency_key.eq.${term},reference_id.eq.${term}`);
      }

      const { data, error, count } = await q;
      if (error) { console.error("Error fetching statement:", error); return { rows: [], count: 0 }; }

      // Map to StatementEntry with running balance computation
      let runningBalance = 0;
      const rows: StatementEntry[] = (data || []).reverse().map((e: any) => {
        runningBalance += Number(e.amount_cents || 0);
        return {
          id: e.id,
          account_id: e.account_id || "",
          account_kind: e.account_kind || null,
          entry_type: e.entry_type || null,
          source_type: e.source_type || null,
          source_id: e.source_id || null,
          reference_type: e.reference_type || null,
          reference_id: e.reference_id || null,
          amount_cents: Number(e.amount_cents || 0),
          currency: e.currency || "BRL",
          balance_after_cents: runningBalance,
          description: e.description || null,
          profile_type: e.profile_type || null,
          idempotency_key: e.idempotency_key || e.batch_id || null,
          metadata: e.metadata || e.extra || null,
          created_at: e.created_at,
        };
      }).reverse();

      return { rows, count: count || 0 };
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Source Types List (for filter dropdown)
// ═══════════════════════════════════════════════════════
export function usePaySourceTypes() {
  return useQuery({
    queryKey: ["pay-source-types"],
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase
        .from("ledger_entries")
        .select("source_type")
        .not("source_type", "is", null)
        .limit(200);
      return [...new Set((data || []).map((r: any) => r.source_type).filter(Boolean))].sort();
    },
    staleTime: 60_000,
  });
}
