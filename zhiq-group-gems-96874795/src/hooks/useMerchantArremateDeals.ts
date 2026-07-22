/**
 * useMerchantArremateDeals — deals pós-arremate do VENDEDOR (ORION Marketplace).
 *
 * Lê orion_alc_deals filtrando pelo seller (RLS já garante: seller_user_id=auth.uid()).
 * Toda regra/estado vem do backend — o front só exibe e dispara RPCs oficiais
 * (arremate_seller_confirmar_pagamento, arremate_seller_enviar, arremate_solicitar_entrega,
 * arremate_abrir_disputa, arremate_cancelar, orion_alc_set_status). Realtime nos deals.
 * NENHUMA regra financeira aqui: comissão/líquido vêm de orion_auction_settlements.
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Status REAIS do CHECK de orion_alc_deals (não inventar):
export type AlcStatus =
  | "aguardando_contato" | "contato_realizado" | "em_andamento"
  | "pagamento_combinado" | "entregue" | "servico_executado"
  | "concluida" | "cancelada" | "em_disputa";

export interface ArremateDeal {
  id: string;
  listing_id: string;
  seller_user_id: string;
  buyer_user_id: string | null;
  amount: number;
  listing_type: string | null;
  category: string | null;
  city: string | null;
  status: AlcStatus;
  first_contact_at: string | null;
  concluded_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useMerchantArremateDeals() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["merchant-arremate-deals", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ArremateDeal[]> => {
      const { data, error } = await (supabase.from("orion_alc_deals") as any)
        .select("id, listing_id, seller_user_id, buyer_user_id, amount, listing_type, category, city, status, first_contact_at, concluded_at, canceled_at, created_at, updated_at")
        .eq("seller_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data || []) as ArremateDeal[];
    },
  });

  // Realtime: qualquer mudança em deals do vendedor revalida
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel("merchant-arremate-deals")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "orion_alc_deals", filter: `seller_user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["merchant-arremate-deals", user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  return query;
}

// ── Ação oficial: dispara a RPC do backend e revalida ──
export async function runDealAction(fn: string, args: Record<string, unknown>) {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) return { ok: false, error: error.message };
  if (data && typeof data === "object" && (data as any).success === false) {
    return { ok: false, error: (data as any).error || "erro" };
  }
  return { ok: true, data };
}

// Financeiro do arremate (comissão/líquido): fonte = orion_auction_settlements (backend).
export function useArremateSettlement(listingId: string | null) {
  return useQuery({
    queryKey: ["arremate-settlement", listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const { data } = await (supabase.from("orion_auction_settlements") as any)
        .select("listing_id, status, valor_final, comissao_valor, valor_liquido, winner_user_id, arremate_status")
        .eq("listing_id", listingId)
        .maybeSingle();
      return data || null;
    },
  });
}

// ── Metadados de status: rótulo, cor, ícone (mapeados dos status REAIS) ──
export const STATUS_META: Record<AlcStatus, { label: string; emoji: string; cls: string; dot: string }> = {
  aguardando_contato:  { label: "Aguardando contato",   emoji: "🟡", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40",     dot: "bg-amber-400" },
  contato_realizado:   { label: "Contato realizado",    emoji: "🟢", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40", dot: "bg-emerald-400" },
  em_andamento:        { label: "Em andamento",         emoji: "🔵", cls: "bg-sky-500/15 text-sky-400 border-sky-500/40",             dot: "bg-sky-400" },
  pagamento_combinado: { label: "Pagamento combinado",  emoji: "💳", cls: "bg-violet-500/15 text-violet-300 border-violet-500/40",    dot: "bg-violet-400" },
  entregue:            { label: "Entregue",             emoji: "📦", cls: "bg-teal-500/15 text-teal-300 border-teal-500/40",          dot: "bg-teal-400" },
  servico_executado:   { label: "Serviço executado",   emoji: "🛠️", cls: "bg-teal-500/15 text-teal-300 border-teal-500/40",          dot: "bg-teal-400" },
  concluida:           { label: "Concluída",            emoji: "✅", cls: "bg-emerald-600/20 text-emerald-300 border-emerald-600/50",  dot: "bg-emerald-500" },
  cancelada:           { label: "Cancelada",            emoji: "❌", cls: "bg-red-500/15 text-red-400 border-red-500/40",             dot: "bg-red-400" },
  em_disputa:          { label: "Em disputa",           emoji: "⚠️", cls: "bg-orange-500/15 text-orange-400 border-orange-500/40",     dot: "bg-orange-400" },
};

// Ordem da linha do tempo (para desenhar o progresso)
export const TIMELINE_ORDER: AlcStatus[] = [
  "aguardando_contato", "contato_realizado", "em_andamento",
  "pagamento_combinado", "entregue", "concluida",
];

export function useArremateKpis(deals: ArremateDeal[] | undefined) {
  return useMemo(() => {
    const list = deals || [];
    const concl = list.filter(d => d.status === "concluida");
    const canc = list.filter(d => d.status === "cancelada");
    const totalConcl = concl.reduce((s, d) => s + Number(d.amount || 0), 0);
    return {
      total: list.length,
      valorTotal: totalConcl,
      ticketMedio: concl.length ? totalConcl / concl.length : 0,
      entregues: concl.length,
      cancelados: canc.length,
      emDisputa: list.filter(d => d.status === "em_disputa").length,
      conversao: list.length ? Math.round((concl.length / list.length) * 100) : 0,
    };
  }, [deals]);
}
