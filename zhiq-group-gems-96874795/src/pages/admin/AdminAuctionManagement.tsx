/**
 * AdminAuctionManagement — GESTÃO TRANSACIONAL de leilões (não é dashboard).
 *
 * Fecha a pendência crítica da auditoria: o admin era 100% read-only. Aqui o
 * administrador ENCERRA, CANCELA, BLOQUEIA, APROVA/REPROVA, ARQUIVA e RESTAURA
 * leilões, além de INVALIDAR lances suspeitos — tudo via RPCs SECURITY DEFINER
 * protegidas por has_role admin (admin_auction_action / admin_invalidate_bid),
 * com auditoria em auction_events. Nenhuma escrita direta na tabela.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Loader2, Gavel, StopCircle, XCircle, ShieldOff, CheckCircle2, Ban,
  Archive, RotateCcw, Search, AlertTriangle,
} from "lucide-react";

interface Row {
  id: string; title: string; status: string; moderation_status: string | null;
  current_bid: number | null; total_bids: number | null; ends_at: string | null; owner_user_id: string | null;
}
interface Overview {
  ativos?: number; pausados?: number; encerrados?: number; cancelados?: number;
  bloqueados?: number; arquivados?: number; lances_invalidos?: number;
  comissao_pct?: number; recentes?: Row[];
}
interface BidRow {
  id: string; user_id: string; amount_cents: number;
  is_winning: boolean; is_valid: boolean; is_auto: boolean; created_at: string;
}
type RpcResult = { success?: boolean; error?: string };

// supabase.rpc/from não são tipados aqui (types.ts do projeto é vazio) — helpers
// estreitos evitam espalhar `as any` e mantêm o retorno tipado.
const callRpc = <T,>(fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: T; error: { message: string } | null }>)(fn, args);
const fromTable = (t: string) =>
  (supabase.from as unknown as (name: string) => ReturnType<typeof supabase.from>)(t);

const brl = (v: number | null | undefined) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  ended: "bg-zinc-100 text-zinc-600 border-zinc-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
  draft: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function AdminAuctionManagement() {
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [bidListing, setBidListing] = useState<Row | null>(null);

  const { data, isLoading, refetch } = useQuery<Overview>({
    queryKey: ["admin-auction-overview"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await callRpc<Overview>("admin_auction_overview", {});
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const filtered = useMemo(() => {
    const rows: Row[] = data?.recentes ?? [];
    return rows.filter((r) => !q || r.title?.toLowerCase().includes(q.toLowerCase()) || r.id.includes(q));
  }, [data, q]);

  const act = async (listingId: string, action: string, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    const note = ["cancel", "block", "reject"].includes(action)
      ? (window.prompt("Motivo (opcional, fica no log de auditoria):") ?? undefined)
      : undefined;
    setBusy(`${listingId}:${action}`);
    try {
      const { data, error } = await callRpc<RpcResult>("admin_auction_action", {
        p_listing_id: listingId, p_action: action, p_note: note,
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Falha na ação");
      toast.success("Ação aplicada.");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro (apenas administradores).");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-5">
      <div>
        <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
          <Gavel className="w-6 h-6 text-[#FF6A00]" /> Gestão de Leilões (Admin)
        </h1>
        <p className="text-xs font-bold text-zinc-500">
          Encerrar, cancelar, bloquear, moderar, arquivar e restaurar leilões + invalidar lances. Tudo auditado.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-zinc-400"><Loader2 className="w-6 h-6 animate-spin" /> Carregando…</div>
      ) : (
        <>
          {/* KPIs de gestão */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {[
              ["Ativos", data?.ativos], ["Pausados", data?.pausados], ["Encerrados", data?.encerrados],
              ["Cancelados", data?.cancelados], ["Bloqueados", data?.bloqueados], ["Arquivados", data?.arquivados],
              ["Lances inválidos", data?.lances_invalidos],
            ].map(([label, v]) => (
              <div key={label as string} className="bg-white rounded-2xl border border-zinc-200 p-3 shadow-sm">
                <p className="text-lg font-black text-zinc-900 tabular-nums">{v ?? 0}</p>
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">{label as string}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título ou ID…"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-zinc-200 text-xs outline-none focus:border-[#FF6A00]/60"
              />
            </div>
            <span className="text-[11px] font-bold text-zinc-400">Comissão vigente: {((data?.comissao_pct ?? 0) * 100).toFixed(1)}%</span>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-zinc-500 uppercase text-[10px] font-black tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3">Leilão</th>
                    <th className="text-left px-3 py-3">Status</th>
                    <th className="text-right px-3 py-3">Lance atual</th>
                    <th className="text-center px-3 py-3">Lances</th>
                    <th className="text-right px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-400 font-bold">Nenhum leilão.</td></tr>
                  ) : filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-3">
                        <p className="font-black text-zinc-800 truncate max-w-[240px]">{r.title || "—"}</p>
                        <p className="text-[10px] font-mono text-zinc-400">{r.id.slice(0, 8)}…</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("px-2 py-0.5 rounded-full border text-[9px] font-black uppercase", STATUS_STYLE[r.status] || "bg-zinc-100 text-zinc-500 border-zinc-200")}>{r.status}</span>
                        {r.moderation_status === "blocked" && <span className="ml-1 text-[9px] font-black text-red-500 uppercase">bloqueado</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-black text-zinc-900">{brl(r.current_bid)}</td>
                      <td className="px-3 py-3 text-center tabular-nums">{r.total_bids ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {(r.status === "active" || r.status === "paused") && (
                            <button title="Encerrar" disabled={busy === `${r.id}:end`}
                              onClick={() => act(r.id, "end", "Encerrar este leilão agora?")}
                              className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-600"><StopCircle className="w-4 h-4" /></button>
                          )}
                          {r.status !== "cancelled" && r.status !== "ended" && (
                            <button title="Cancelar" disabled={busy === `${r.id}:cancel`}
                              onClick={() => act(r.id, "cancel", "Cancelar este leilão?")}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><XCircle className="w-4 h-4" /></button>
                          )}
                          {r.moderation_status !== "blocked" ? (
                            <button title="Bloquear" disabled={busy === `${r.id}:block`}
                              onClick={() => act(r.id, "block", "Bloquear (moderação) este leilão?")}
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600"><Ban className="w-4 h-4" /></button>
                          ) : (
                            <button title="Aprovar" disabled={busy === `${r.id}:approve`}
                              onClick={() => act(r.id, "approve")}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"><CheckCircle2 className="w-4 h-4" /></button>
                          )}
                          <button title="Invalidar lance suspeito" onClick={() => setBidListing(r)}
                            className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-600"><ShieldOff className="w-4 h-4" /></button>
                          <button title="Arquivar" disabled={busy === `${r.id}:archive`}
                            onClick={() => act(r.id, "archive", "Arquivar (soft-delete) este leilão?")}
                            className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500"><Archive className="w-4 h-4" /></button>
                          <button title="Restaurar" disabled={busy === `${r.id}:restore`}
                            onClick={() => act(r.id, "restore")}
                            className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500"><RotateCcw className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {bidListing && <BidModerationModal listing={bidListing} onClose={() => { setBidListing(null); refetch(); }} />}
    </div>
  );
}

/** Modal: lista os lances de um leilão e invalida os suspeitos (admin_invalidate_bid). */
function BidModerationModal({ listing, onClose }: { listing: Row; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const { data: bids = [], isLoading, refetch } = useQuery<BidRow[]>({
    queryKey: ["admin-auction-bids", listing.id],
    queryFn: async () => {
      const { data } = await fromTable("auction_bids")
        .select("id, user_id, amount_cents, is_winning, is_valid, is_auto, created_at")
        .eq("listing_id", listing.id).order("amount_cents", { ascending: false });
      return (data ?? []) as unknown as BidRow[];
    },
  });

  const invalidate = async (bidId: string) => {
    const note = window.prompt("Motivo da invalidação (log de auditoria):") ?? undefined;
    setBusy(bidId);
    try {
      const { data, error } = await callRpc<RpcResult>("admin_invalidate_bid", { p_bid_id: bidId, p_note: note });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Falha");
      toast.success("Lance invalidado. Líder recomputado.");
      await refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 max-h-[85vh] overflow-y-auto">
        <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-violet-600" /> Moderação de lances
        </h3>
        <p className="text-[11px] font-bold text-zinc-400 mb-4 truncate">{listing.title}</p>
        {isLoading ? (
          <div className="py-8 text-center text-zinc-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : bids.length === 0 ? (
          <p className="py-8 text-center text-zinc-400 font-bold text-sm">Sem lances.</p>
        ) : (
          <div className="space-y-2">
            {bids.map((b) => (
              <div key={b.id} className={cn("flex items-center justify-between gap-2 rounded-xl border p-3",
                b.is_valid === false ? "border-red-100 bg-red-50/50 opacity-60" : "border-zinc-200")}>
                <div className="min-w-0">
                  <p className="text-xs font-black text-zinc-800">{brl(b.amount_cents / 100)}
                    {b.is_winning && <span className="ml-1.5 text-[9px] text-emerald-600 uppercase">líder</span>}
                    {b.is_auto && <span className="ml-1.5 text-[9px] text-violet-500 uppercase">auto</span>}
                  </p>
                  <p className="text-[10px] font-mono text-zinc-400 truncate">{String(b.user_id).slice(0, 8)}… · {new Date(b.created_at).toLocaleString("pt-BR")}</p>
                </div>
                {b.is_valid === false ? (
                  <span className="text-[10px] font-black text-red-500 uppercase">Invalidado</span>
                ) : (
                  <button disabled={busy === b.id} onClick={() => invalidate(b.id)}
                    className="px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 text-[10px] font-black uppercase tracking-wider hover:bg-violet-200 disabled:opacity-60">
                    {busy === b.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Invalidar"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
