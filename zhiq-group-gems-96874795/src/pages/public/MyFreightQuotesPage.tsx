/**
 * MyFreightQuotesPage — "Minhas Solicitações" (cliente).
 * Status de cada solicitação + COMPARADOR de propostas (ordenação por preço/
 * avaliação/prazo/ORION), aceite (demais recusadas automaticamente), navegação
 * para o perfil público da transportadora (/freteiro/:id).
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import {
  useMyFreightQuotes, freightQuoteActions, type QuoteProposalRow, type QuoteRequestRow,
} from "@/hooks/useFreightQuotes";
import {
  REQUEST_STATUS, QUOTE_SORTS, type QuoteSortKey, brlLabel, timeLeftLabel,
} from "@/lib/freight/quoteEngine";
import {
  Loader2, Truck, ArrowLeft, MapPin, PackageOpen, Star, ShieldCheck,
  CheckCircle2, XCircle, Clock, Store as StoreIcon, Sparkles,
} from "lucide-react";

function sortProposals(list: QuoteProposalRow[], sort: QuoteSortKey): QuoteProposalRow[] {
  const arr = [...list];
  const prazoNum = (p: QuoteProposalRow) => parseFloat(String(p.delivery_eta || "").replace(/\D/g, "")) || 999;
  switch (sort) {
    case "preco": return arr.sort((a, b) => a.price_brl - b.price_brl);
    case "prazo": return arr.sort((a, b) => prazoNum(a) - prazoNum(b));
    case "avaliacao": return arr.sort((a, b) => (b.company?.listings || 0) - (a.company?.listings || 0));
    case "proximo": return arr.sort((a, b) => (a.company?.city ? 0 : 1) - (b.company?.city ? 0 : 1));
    case "orion":
    default:
      // Recomendação ORION: equilíbrio preço × prazo × completude do perfil
      return arr.sort((a, b) => {
        const score = (p: QuoteProposalRow) =>
          p.price_brl / Math.max(...list.map((x) => x.price_brl), 1) * 0.55 +
          prazoNum(p) / Math.max(...list.map(prazoNum), 1) * 0.3 -
          ((p.company?.listings || 0) > 0 ? 0.1 : 0) - (p.has_insurance ? 0.05 : 0);
        return score(a) - score(b);
      });
  }
}

export default function MyFreightQuotesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, invalidate } = useMyFreightQuotes();
  const [sort, setSort] = useState<QuoteSortKey>("orion");
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const requests = data?.requests ?? [];
  const proposalsBy = data?.proposalsByRequest ?? {};

  const act = async (label: string, key: string, fn: () => Promise<any>) => {
    setBusy(key);
    try { await fn(); toast.success(label); await invalidate(); }
    catch (e: any) { toast.error(e.message || "Erro na operação."); }
    finally { setBusy(null); }
  };

  const summary = useMemo(() => ({
    abertas: requests.filter((r) => ["aguardando", "recebendo", "negociacao"].includes(r.status)).length,
    propostas: Object.values(proposalsBy).reduce((s, l) => s + l.length, 0),
  }), [requests, proposalsBy]);

  return (
    <MarketLayout showSearch={false} hideCart blueFooter blueFooterLabel="🚚 Minhas Solicitações" headerChildren={<MarketNavButtons />}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4 pb-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/fretes" className="inline-flex items-center gap-1 text-[11px] font-black text-zinc-500 uppercase tracking-wider hover:text-[#FF6A00]">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar aos fretes
            </Link>
            <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight mt-1">📋 Minhas Solicitações</h1>
            <p className="text-sm text-zinc-600 font-medium">
              {summary.abertas} aberta(s) · {summary.propostas} proposta(s) recebida(s)
            </p>
          </div>
          <Link to="/fretes/solicitar" className="px-5 py-3 rounded-xl bg-[#FF6A00] text-white text-xs font-black uppercase tracking-wider hover:bg-[#E65C00] shadow-lg shadow-[#FF6A00]/25">
            + Nova solicitação
          </Link>
        </div>

        {!user ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm font-bold text-amber-800">
            Entre para ver suas solicitações. <button onClick={() => navigate("/auth")} className="underline">Entrar</button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin" /> Carregando…
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-3xl p-10 text-center space-y-3">
            <PackageOpen className="w-12 h-12 text-zinc-300 mx-auto" />
            <p className="font-black text-zinc-500 uppercase text-sm">Você ainda não tem solicitações</p>
            <Link to="/fretes/solicitar" className="inline-block px-5 py-3 rounded-xl bg-[#FF6A00] text-white text-xs font-black uppercase tracking-wider">
              Solicitar cotações agora
            </Link>
          </div>
        ) : (
          requests.map((r: QuoteRequestRow) => {
            const st = REQUEST_STATUS[r.status] || REQUEST_STATUS.aguardando;
            const props = proposalsBy[r.id] || [];
            const open = expanded === r.id;
            const isOpenStatus = ["aguardando", "recebendo", "negociacao"].includes(r.status);
            return (
              <div key={r.id} className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
                <button onClick={() => setExpanded(open ? null : r.id)} className="w-full text-left p-5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Truck className="w-4 h-4 text-[#FF6A00] shrink-0" />
                      <span className="font-black text-zinc-900 text-sm truncate">{r.cargo_type || "Carga"}</span>
                      {r.weight_kg && <span className="text-[11px] font-bold text-zinc-400">· {r.weight_kg} kg</span>}
                    </div>
                    <span className={cn("px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider", st.className)}>
                      {st.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-zinc-500">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-emerald-500" /> {r.origin_city || "—"}/{r.origin_state || ""}</span>
                    <span>→</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-red-400" /> {r.dest_city || "—"}/{r.dest_state || ""}</span>
                    {r.desired_date && <span>📅 {new Date(r.desired_date + "T12:00:00").toLocaleDateString("pt-BR")}</span>}
                    {isOpenStatus && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeLeftLabel(r.expires_at)}</span>}
                    <span className="ml-auto text-[#FF6A00]">{props.length} proposta(s) {open ? "▲" : "▼"}</span>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-zinc-100 p-5 space-y-4 bg-zinc-50/60">
                    {r.allowed_vehicle_types.length > 0 && (
                      <p className="text-[10px] font-bold text-zinc-400 flex flex-wrap items-center gap-1">
                        <Sparkles className="w-3 h-3 text-violet-500" /> ORION liberou para:
                        {r.allowed_vehicle_types.map((t) => <span key={t} className="px-1.5 py-0.5 bg-white border border-zinc-200 rounded-md">{t}</span>)}
                      </p>
                    )}

                    {props.length === 0 ? (
                      <p className="text-xs font-bold text-zinc-400 text-center py-4">
                        Nenhuma proposta ainda — transportadores compatíveis já foram avisados.
                      </p>
                    ) : (
                      <>
                        {/* COMPARADOR — ordenação */}
                        <div className="flex flex-wrap gap-1.5">
                          {QUOTE_SORTS.map((s) => (
                            <button key={s.key} onClick={() => setSort(s.key)}
                              className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border",
                                sort === s.key ? "bg-zinc-900 border-zinc-900 text-white" : "bg-white border-zinc-200 text-zinc-500")}>
                              {s.label}
                            </button>
                          ))}
                        </div>
                        <div className="space-y-2.5">
                          {sortProposals(props, sort).map((p, idx) => (
                            <div key={p.id} className={cn(
                              "bg-white rounded-2xl border p-4 flex flex-wrap items-center gap-3",
                              p.status === "aceita" ? "border-emerald-300 ring-1 ring-emerald-200" :
                              p.status === "recusada" ? "border-zinc-100 opacity-55" : "border-zinc-200"
                            )}>
                              <Link to={`/freteiro/${p.transporter_user_id}?tab=fretes`} className="flex items-center gap-2.5 min-w-0 flex-1 group">
                                <span className="w-11 h-11 rounded-xl bg-zinc-100 border border-zinc-200 overflow-hidden flex items-center justify-center shrink-0">
                                  {p.company?.logoUrl
                                    ? <img src={p.company.logoUrl} alt="" className="w-full h-full object-cover" />
                                    : <StoreIcon className="w-5 h-5 text-zinc-400" />}
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-xs font-black text-zinc-800 truncate group-hover:text-[#FF6A00]">
                                    {p.company?.name || "Transportador"}
                                    {sort === "orion" && idx === 0 && p.status === "enviada" && (
                                      <span className="ml-1.5 text-[8px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-md uppercase">ORION recomenda</span>
                                    )}
                                  </span>
                                  <span className="block text-[10px] font-bold text-zinc-400 truncate">
                                    <Star className="inline w-3 h-3 fill-amber-400 text-amber-400 -mt-0.5" /> 4.9 · {p.company?.listings || 0} anúncio(s)
                                    {p.company?.city ? ` · ${p.company.city}` : ""}{p.vehicle_type ? ` · ${p.vehicle_type}` : ""}
                                  </span>
                                </span>
                              </Link>
                              <div className="text-right">
                                <p className="text-base font-black text-zinc-900">{brlLabel(p.price_brl)}</p>
                                <p className="text-[10px] font-bold text-zinc-400">
                                  {p.pickup_eta ? `coleta ${p.pickup_eta}` : ""}{p.delivery_eta ? ` · entrega ${p.delivery_eta}` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                                {p.has_insurance && (
                                  <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase"><ShieldCheck className="w-3.5 h-3.5" /> Seguro</span>
                                )}
                                {p.status === "aceita" ? (
                                  <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase"><CheckCircle2 className="w-4 h-4" /> Contratada</span>
                                ) : p.status === "recusada" ? (
                                  <span className="flex items-center gap-1 text-[10px] font-black text-zinc-400 uppercase"><XCircle className="w-4 h-4" /> Recusada</span>
                                ) : isOpenStatus ? (
                                  <button
                                    disabled={busy === p.id}
                                    onClick={() => {
                                      if (!window.confirm(`Confirmar contratação de ${p.company?.name || "este transportador"} por ${brlLabel(p.price_brl)}? As demais propostas serão recusadas.`)) return;
                                      act("Proposta aceita! O transportador foi confirmado. 🚚", p.id, () => freightQuoteActions.acceptProposal(p.id));
                                    }}
                                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600 disabled:opacity-60"
                                  >
                                    {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : "Aceitar"}
                                  </button>
                                ) : null}
                              </div>
                              {p.services.length > 0 && (
                                <p className="w-full text-[10px] font-bold text-zinc-400">Inclui: {p.services.join(" · ")}</p>
                              )}
                              {p.notes && <p className="w-full text-[10px] text-zinc-500 italic">"{p.notes}"</p>}
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {isOpenStatus && (
                        <button
                          disabled={busy === `cancel-${r.id}`}
                          onClick={() => {
                            if (!window.confirm("Cancelar esta solicitação? As propostas serão recusadas.")) return;
                            act("Solicitação cancelada.", `cancel-${r.id}`, () => freightQuoteActions.setStatus(r.id, "cancelada"));
                          }}
                          className="px-4 py-2 rounded-xl border border-red-200 text-red-500 text-[10px] font-black uppercase tracking-wider hover:bg-red-50"
                        >
                          Cancelar solicitação
                        </button>
                      )}
                      {r.status === "aceita" && (
                        <button
                          disabled={busy === `fin-${r.id}`}
                          onClick={() => act("Transporte finalizado! 🎉", `fin-${r.id}`, () => freightQuoteActions.setStatus(r.id, "finalizada"))}
                          className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-[10px] font-black uppercase tracking-wider"
                        >
                          Marcar como finalizada
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </MarketLayout>
  );
}
