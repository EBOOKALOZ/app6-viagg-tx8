/**
 * AdvertiserFreightOpportunitiesPage — "Oportunidades" do fretista.
 * Feed de solicitações COMPATÍVEIS (distribuição automática ORION: veículo/
 * frota/capacidade/região), com dashboard do fretista e ações:
 * Aceitar Serviço (fecha na hora, registra comissão configurável),
 * Negociar valor (proposta), Recusar, Ignorar, Favoritar.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useTransporterFreightQuotes, freightQuoteActions, type QuoteRequestRow,
} from "@/hooks/useFreightQuotes";
import {
  PROPOSAL_SERVICES, REQUEST_STATUS, brlLabel, timeLeftLabel,
} from "@/lib/freight/quoteEngine";
import {
  Loader2, MapPin, Clock, Star, X, Truck, Route as RouteIcon,
  CheckCircle2, HandCoins, EyeOff, ThumbsDown, Package, Wallet, Gauge, Sparkles,
} from "lucide-react";

type Tab = "compativeis" | "favoritas" | "respondidas" | "descartadas";

function StatChip({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <div className="flex items-center gap-2 bg-white rounded-2xl border border-zinc-200 px-4 py-3 shadow-sm">
      <Icon className="w-4 h-4 text-[#FF6A00] shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-black text-zinc-900 leading-none tabular-nums truncate">{value}</p>
        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider truncate">{label}</p>
      </div>
    </div>
  );
}

export default function AdvertiserFreightOpportunitiesPage() {
  const { data, isLoading, invalidate } = useTransporterFreightQuotes();
  const [tab, setTab] = useState<Tab>("compativeis");
  const [busy, setBusy] = useState<string | null>(null);
  const [negotiating, setNegotiating] = useState<QuoteRequestRow | null>(null);
  const [prop, setProp] = useState({ price: "", pickup: "", delivery: "", vehicle: "", notes: "", insurance: false, services: [] as string[] });
  // Contato do cliente LIBERADO (após pagar a comissão de abertura)
  const [contact, setContact] = useState<any | null>(null);

  const stats = data?.stats;
  const lists: Record<Tab, QuoteRequestRow[]> = {
    compativeis: data?.compatible ?? [],
    favoritas: data?.favorites ?? [],
    respondidas: (data?.answered ?? []).map((a) => a.request),
    descartadas: data?.dismissed ?? [],
  };
  const proposalByReq: Record<string, any> = {};
  (data?.answered ?? []).forEach((a) => { proposalByReq[a.request.id] = a.proposal; });

  const act = async (msg: string, key: string, fn: () => Promise<any>) => {
    setBusy(key);
    try { await fn(); toast.success(msg); await invalidate(); }
    catch (e: any) { toast.error(e.message || "Erro na operação."); }
    finally { setBusy(null); }
  };

  // ── ACEITAR SERVIÇO E ABRIR CONTATO ──────────────────────────────────────
  // Mostra a comissão (3% parametrizável) ANTES de confirmar; a cobrança na
  // carteira acontece SOMENTE aqui e libera os dados completos do cliente.
  const openContactFlow = async (r: QuoteRequestRow, price: number | null) => {
    const basePrice = price ?? r.suggested_price_brl ?? null;
    setBusy(`acc-${r.id}`);
    try {
      let msg = "Confirmar: Aceitar Serviço e Abrir Contato?";
      if (basePrice) {
        const prev = await freightQuoteActions.commissionPreview(basePrice, r.cargo_type);
        msg = prev.enabled && prev.commission_brl > 0
          ? `Aceitar Serviço e Abrir Contato por ${brlLabel(basePrice)}?\n\nComissão da plataforma: ${brlLabel(prev.commission_brl)} (${prev.percent}%), debitada da sua carteira somente agora.\nEm seguida você recebe nome, WhatsApp, telefone, endereço completo, fotos e observações do cliente.`
          : `Aceitar Serviço e Abrir Contato por ${brlLabel(basePrice)}? Os dados completos do cliente serão liberados em seguida.`;
      }
      if (!window.confirm(msg)) return;
      const res = await freightQuoteActions.acceptAndUnlock(r.id, price);
      toast.success(res.already_unlocked
        ? "Contato já estava liberado — nenhuma nova cobrança. 📞"
        : "Serviço aceito! Contato do cliente liberado. 🚚");
      setContact(res.contact);
      await invalidate();
    } catch (e: any) {
      toast.error(e.message || "Erro ao abrir contato.");
    } finally {
      setBusy(null);
    }
  };

  const viewContact = async (r: QuoteRequestRow, myPrice: number | null) => {
    try {
      const res = await freightQuoteActions.getUnlockedContact(r.id);
      setContact(res.contact);
    } catch {
      // Ainda não desbloqueado (ex.: cliente aceitou minha proposta) → fluxo de abertura
      await openContactFlow(r, myPrice);
    }
  };

  const submitProposal = async () => {
    if (!negotiating) return;
    const price = parseFloat(prop.price.replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) { toast.error("Informe o valor do frete."); return; }
    await act("Proposta enviada! O cliente será notificado. 💼", "proposal", () =>
      freightQuoteActions.submitProposal(negotiating.id, {
        price_brl: price, pickup_eta: prop.pickup, delivery_eta: prop.delivery,
        vehicle_type: prop.vehicle, notes: prop.notes, has_insurance: prop.insurance,
        services: prop.services,
      }));
    setNegotiating(null);
    setProp({ price: "", pickup: "", delivery: "", vehicle: "", notes: "", insurance: false, services: [] });
  };

  return (
    <div className="max-w-5xl mx-auto w-full space-y-5 pb-20">
      <div>
        <h1 className="text-2xl font-black text-white uppercase tracking-tight">🚚 Oportunidades</h1>
        <p className="text-xs font-bold text-[#A7B0BE]">
          Solicitações de transporte compatíveis com sua frota e rotas — distribuídas automaticamente pelo ORION.
          Visualizar é <span className="text-emerald-400">grátis</span>; a comissão da plataforma é cobrada
          apenas ao clicar em <span className="text-white">Aceitar Serviço e Abrir Contato</span>.
        </p>
      </div>

      {/* DASHBOARD DO FRETISTA */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatChip label="Veículos na frota" value={stats.vehicles} icon={Truck} />
          <StatChip label="Rotas cadastradas" value={stats.routes} icon={RouteIcon} />
          <StatChip label="Serviços aceitos" value={stats.accepted} icon={CheckCircle2} />
          <StatChip label="Concluídos" value={stats.concluded} icon={Package} />
          <StatChip label="Taxa de aceitação" value={stats.acceptRate === null ? "—" : `${stats.acceptRate}%`} icon={Gauge} />
          <StatChip label="Faturamento" value={brlLabel(stats.revenueBrl)} icon={Wallet} />
          <StatChip label="Comissão da plataforma" value={brlLabel(stats.commissionBrl)} icon={HandCoins} />
          <StatChip label="Propostas enviadas" value={stats.proposals} icon={Star} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {([
            ["compativeis", `Compatíveis (${lists.compativeis.length})`],
            ["favoritas", `Favoritas (${lists.favoritas.length})`],
            ["respondidas", `Respondidas (${lists.respondidas.length})`],
            ["descartadas", `Descartadas (${lists.descartadas.length})`],
          ] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={cn("px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all",
                tab === k ? "bg-[#FF6A00] border-[#FF6A00] text-white" : "bg-white/5 border-[#2A3038] text-[#A7B0BE] hover:text-white")}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Link to="/anunciante/fretes/frota" className="px-3.5 py-2 rounded-xl bg-white/5 border border-[#2A3038] text-[10px] font-black uppercase tracking-wider text-[#A7B0BE] hover:text-white">
            Minha Frota
          </Link>
          <Link to="/anunciante/fretes/rotas" className="px-3.5 py-2 rounded-xl bg-white/5 border border-[#2A3038] text-[10px] font-black uppercase tracking-wider text-[#A7B0BE] hover:text-white">
            Minhas Rotas
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-[#A7B0BE]">
          <Loader2 className="w-6 h-6 animate-spin" /> Carregando oportunidades…
        </div>
      ) : lists[tab].length === 0 ? (
        <div className="bg-white/5 border border-[#2A3038] rounded-3xl p-10 text-center space-y-2">
          <Truck className="w-12 h-12 text-[#2A3038] mx-auto" />
          <p className="text-sm font-black text-[#A7B0BE] uppercase">
            {tab === "compativeis" ? "Nenhuma oportunidade compatível no momento" : "Nada por aqui"}
          </p>
          {tab === "compativeis" && (data?.stats.vehicles === 0 && (data?.fleetVehicleTypes.length ?? 0) === 0) && (
            <p className="text-xs text-[#6b7581]">
              Cadastre sua <Link to="/anunciante/fretes/frota" className="text-[#FF6A00] underline">frota</Link> e suas{" "}
              <Link to="/anunciante/fretes/rotas" className="text-[#FF6A00] underline">rotas</Link> para começar a receber oportunidades do ORION.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {lists[tab].map((r) => {
            const myProp = proposalByReq[r.id];
            const st = REQUEST_STATUS[r.status] || REQUEST_STATUS.aguardando;
            return (
              <div key={r.id} className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-1 rounded-lg bg-[#FF6A00]/10 text-[#FF6A00] text-[10px] font-black uppercase">Nova oportunidade</span>
                    <span className="font-black text-zinc-900 text-sm truncate">{r.cargo_type || "Carga"}</span>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-black text-amber-600 uppercase">
                    <Clock className="w-3.5 h-3.5" /> {timeLeftLabel(r.expires_at)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-bold text-zinc-600">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-emerald-500" /> {r.origin_city || "—"}/{r.origin_state || ""}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-red-400" /> {r.dest_city || "—"}/{r.dest_state || ""}</span>
                  <span>⚖️ {r.weight_kg ? `${r.weight_kg} kg` : "peso n/i"}{r.volumes ? ` · ${r.volumes} vol.` : ""}</span>
                  <span>📅 {r.desired_date ? new Date(r.desired_date + "T12:00:00").toLocaleDateString("pt-BR") : "flexível"}{r.urgency === "alta" ? " · 🔥 urgente" : ""}</span>
                </div>

                {(r.suggested_price_brl || r.cargo_value_brl) && (
                  <p className="text-[11px] font-bold text-zinc-500">
                    {r.suggested_price_brl ? <>💰 Valor sugerido: <span className="text-emerald-600 font-black">{brlLabel(r.suggested_price_brl)}</span></> : null}
                    {r.cargo_value_brl ? <span className="ml-3">📦 Valor da carga: {brlLabel(r.cargo_value_brl)}</span> : null}
                  </p>
                )}
                {r.characteristics.length > 0 && (
                  <p className="text-[10px] font-bold text-zinc-400">Características: {r.characteristics.join(" · ")}</p>
                )}
                {r.notes && <p className="text-[11px] text-zinc-500 italic">"{r.notes}"</p>}
                {r.photos.length > 0 && (
                  <div className="flex gap-1.5">
                    {r.photos.slice(0, 5).map((u, i) => (
                      <img key={i} src={u} alt="" className="w-14 h-14 rounded-lg object-cover border border-zinc-200" />
                    ))}
                  </div>
                )}
                {/* Preview GRATUITO — dados sensíveis só após abrir o contato */}
                {tab !== "respondidas" && (
                  <p className="text-[10px] font-bold text-zinc-400">
                    🔒 Endereço completo, telefone{r.photos.length > 0 ? `, ${r.photos.length} foto(s)` : ""} e
                    contato do cliente são liberados ao Aceitar o Serviço — a comissão é cobrada somente nesse momento.
                  </p>
                )}
                {Array.isArray((r.orion_analysis as any)?.reasons) && (
                  <p className="text-[10px] text-violet-600 font-bold flex items-start gap-1">
                    <Sparkles className="w-3 h-3 mt-0.5 shrink-0" /> ORION: {r.allowed_vehicle_types.join(", ")}
                  </p>
                )}

                {tab === "respondidas" ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className={cn("px-2.5 py-1 rounded-full border text-[10px] font-black uppercase", st.className)}>{st.label}</span>
                    {myProp && (
                      <span className={cn("text-[11px] font-black",
                        myProp.status === "aceita" ? "text-emerald-600" : myProp.status === "recusada" ? "text-zinc-400" : "text-blue-600")}>
                        Sua proposta: {brlLabel(myProp.price_brl)} · {myProp.status === "aceita" ? "ACEITA ✅" : myProp.status === "recusada" ? "não selecionada" : "aguardando cliente"}
                      </span>
                    )}
                    {myProp?.status === "aceita" && (
                      <button
                        disabled={busy === `acc-${r.id}`}
                        onClick={() => viewContact(r, myProp.price_brl ?? null)}
                        className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600 disabled:opacity-60"
                      >
                        {busy === `acc-${r.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : "📞 Ver Contato do Cliente"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.suggested_price_brl ? (
                      <button
                        disabled={busy === `acc-${r.id}`}
                        onClick={() => openContactFlow(r, null)}
                        className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600 disabled:opacity-60"
                      >
                        {busy === `acc-${r.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : "✅ Aceitar Serviço e Abrir Contato"}
                      </button>
                    ) : null}
                    <button
                      onClick={() => { setNegotiating(r); setProp((p) => ({ ...p, price: String(r.suggested_price_brl || "") })); }}
                      className="px-4 py-2.5 rounded-xl bg-[#FF6A00] text-white text-[10px] font-black uppercase tracking-wider hover:bg-[#E65C00]"
                    >
                      <HandCoins className="w-3.5 h-3.5 inline -mt-0.5" /> {r.suggested_price_brl ? "Negociar valor" : "Enviar proposta"}
                    </button>
                    <button
                      disabled={busy === `fav-${r.id}`}
                      onClick={() => act(tab === "favoritas" ? "Removida das favoritas." : "Favoritada! 📌", `fav-${r.id}`, () =>
                        freightQuoteActions.react(r.id, tab === "favoritas" ? "limpar" : "favorita"))}
                      className="px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-[10px] font-black uppercase tracking-wider hover:border-amber-300 hover:text-amber-500"
                    >
                      📌 {tab === "favoritas" ? "Desfavoritar" : "Favoritar"}
                    </button>
                    {tab !== "descartadas" && (
                      <>
                        <button
                          disabled={busy === `ign-${r.id}`}
                          onClick={() => act("Oportunidade ignorada.", `ign-${r.id}`, () => freightQuoteActions.react(r.id, "ignorada"))}
                          className="px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-500 text-[10px] font-black uppercase tracking-wider hover:text-zinc-700"
                        >
                          <EyeOff className="w-3.5 h-3.5 inline -mt-0.5" /> Ignorar
                        </button>
                        <button
                          disabled={busy === `rec-${r.id}`}
                          onClick={() => act("Oportunidade recusada.", `rec-${r.id}`, () => freightQuoteActions.react(r.id, "recusada"))}
                          className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-[10px] font-black uppercase tracking-wider hover:bg-red-50"
                        >
                          <ThumbsDown className="w-3.5 h-3.5 inline -mt-0.5" /> Recusar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: enviar proposta / negociar valor */}
      {negotiating && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setNegotiating(null)} />
          <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider">💼 Enviar proposta</h3>
              <button onClick={() => setNegotiating(null)} className="p-1.5 rounded-lg hover:bg-zinc-100"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-[11px] font-bold text-zinc-500">
              {negotiating.cargo_type} · {negotiating.origin_city} → {negotiating.dest_city}
              {negotiating.suggested_price_brl ? ` · sugerido ${brlLabel(negotiating.suggested_price_brl)}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block col-span-2">
                <span className="block text-[11px] font-black text-zinc-600 uppercase tracking-wider mb-1">Valor do frete (R$) *</span>
                <input value={prop.price} onChange={(e) => setProp((p) => ({ ...p, price: e.target.value }))}
                  placeholder="450,00" className="w-full h-11 px-3 rounded-xl border border-zinc-200 text-sm font-black text-zinc-900 outline-none focus:border-[#FF6A00]/60" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-black text-zinc-600 uppercase tracking-wider mb-1">Prazo de coleta</span>
                <input value={prop.pickup} onChange={(e) => setProp((p) => ({ ...p, pickup: e.target.value }))}
                  placeholder="em 2 dias" className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-xs outline-none focus:border-[#FF6A00]/60" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-black text-zinc-600 uppercase tracking-wider mb-1">Prazo de entrega</span>
                <input value={prop.delivery} onChange={(e) => setProp((p) => ({ ...p, delivery: e.target.value }))}
                  placeholder="3 dias úteis" className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-xs outline-none focus:border-[#FF6A00]/60" />
              </label>
              <label className="block col-span-2">
                <span className="block text-[11px] font-black text-zinc-600 uppercase tracking-wider mb-1">Veículo que fará o frete</span>
                <input value={prop.vehicle} onChange={(e) => setProp((p) => ({ ...p, vehicle: e.target.value }))}
                  placeholder={negotiating.allowed_vehicle_types.join(" / ") || "Ex.: Caminhão 3/4 baú"}
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-xs outline-none focus:border-[#FF6A00]/60" />
              </label>
            </div>
            <div>
              <span className="block text-[11px] font-black text-zinc-600 uppercase tracking-wider mb-1.5">Serviços inclusos</span>
              <div className="flex flex-wrap gap-1.5">
                {PROPOSAL_SERVICES.map((s) => (
                  <button key={s} type="button"
                    onClick={() => setProp((p) => ({ ...p, services: p.services.includes(s) ? p.services.filter((x) => x !== s) : [...p.services, s] }))}
                    className={cn("px-2.5 py-1.5 rounded-lg border text-[10px] font-bold",
                      prop.services.includes(s) ? "border-[#FF6A00] bg-[#FF6A00]/5 text-[#FF6A00]" : "border-zinc-200 text-zinc-500")}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => setProp((p) => ({ ...p, insurance: !p.insurance }))}
              className="w-full flex items-center justify-between py-1">
              <span className="text-[11px] font-black text-zinc-600 uppercase tracking-wider">🛡️ Frete com seguro (opcional)</span>
              <span className={cn("w-10 h-6 rounded-full p-0.5 transition-colors", prop.insurance ? "bg-emerald-500" : "bg-zinc-200")}>
                <span className={cn("block w-5 h-5 rounded-full bg-white shadow transition-transform", prop.insurance && "translate-x-4")} />
              </span>
            </button>
            <textarea value={prop.notes} onChange={(e) => setProp((p) => ({ ...p, notes: e.target.value }))} rows={2}
              placeholder="Observações para o cliente…"
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-xs outline-none focus:border-[#FF6A00]/60 resize-y" />
            <button onClick={submitProposal} disabled={busy === "proposal"}
              className="w-full py-3.5 rounded-2xl bg-[#FF6A00] text-white text-xs font-black uppercase tracking-widest hover:bg-[#E65C00] disabled:opacity-60">
              {busy === "proposal" ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Enviar proposta ao cliente"}
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CONTATO DO CLIENTE LIBERADO (após comissão de abertura) */}
      {contact && (() => {
        const c = contact.client || {};
        const wa = String(c.whatsapp || "").replace(/\D/g, "");
        const tel = String(c.phone || "").replace(/\D/g, "");
        const mapsHref = (p: any) =>
          p?.lat && p?.lng
            ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p?.address, p?.city, p?.state].filter(Boolean).join(", "))}`;
        const AddressBlock = ({ label, place }: { label: string; place: any }) => (
          <div className="rounded-2xl border border-zinc-200 p-3 space-y-0.5">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">{label}</p>
            <p className="text-xs font-bold text-zinc-800">
              {[place?.address, place?.city && `${place.city}/${place?.state || ""}`, place?.cep && `CEP ${place.cep}`].filter(Boolean).join(" · ") || "—"}
            </p>
            <a href={mapsHref(place)} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-black text-[#FF6A00] uppercase tracking-wider hover:underline">
              <MapPin className="w-3 h-3" /> Ver no mapa
            </a>
          </div>
        );
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setContact(null)} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider">📞 Contato do Cliente Liberado</h3>
                <button onClick={() => setContact(null)} className="p-1.5 rounded-lg hover:bg-zinc-100"><X className="w-4 h-4" /></button>
              </div>

              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 space-y-1">
                <p className="text-sm font-black text-zinc-900">{c.name || "Cliente Viagg-TX8"}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {wa && (
                    <a href={`https://wa.me/${wa.startsWith("55") ? wa : `55${wa}`}`} target="_blank" rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600">
                      WhatsApp
                    </a>
                  )}
                  {tel && (
                    <a href={`tel:+55${tel}`}
                      className="px-4 py-2 rounded-xl border border-zinc-300 text-zinc-700 text-[10px] font-black uppercase tracking-wider hover:bg-zinc-50">
                      Ligar {c.phone}
                    </a>
                  )}
                  {!wa && !tel && (
                    <p className="text-[11px] text-zinc-500">Cliente sem telefone cadastrado — negocie pela plataforma.</p>
                  )}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2.5">
                <AddressBlock label="🟢 Origem (coleta)" place={contact.origin} />
                <AddressBlock label="🔴 Destino (entrega)" place={contact.dest} />
              </div>

              {(contact.desired_date || contact.desired_time) && (
                <p className="text-[11px] font-bold text-zinc-600">
                  📅 {contact.desired_date ? new Date(contact.desired_date + "T12:00:00").toLocaleDateString("pt-BR") : ""} {contact.desired_time || ""}
                </p>
              )}
              {contact.notes && (
                <p className="text-[11px] text-zinc-600 italic border-l-2 border-zinc-200 pl-3">"{contact.notes}"</p>
              )}
              {Array.isArray(contact.photos) && contact.photos.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {contact.photos.map((u: string, i: number) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                      <img src={u} alt="" className="w-16 h-16 rounded-lg object-cover border border-zinc-200" />
                    </a>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-zinc-400">
                A negociação e o pagamento do frete acontecem diretamente entre você e o cliente.
                A comissão da plataforma já foi cobrada — este contato fica liberado permanentemente em "Respondidas".
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
