/**
 * /admin/orion-package — ORION Package AI (ORION-AI-03)
 *
 * Pacotes de divulgação montados automaticamente a partir dos anúncios
 * aprovados pela RIDV: prévia multi-canal, recomendação comercial
 * explicável, envio ao Motor de Publicação (porta única), reprocessar/
 * cancelar, fila do motor e indicadores. A publicação é SEMPRE decisão
 * humana — a ORION monta e recomenda.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Package, Loader2, Send, RotateCcw, XCircle, Activity, BarChart3,
  Zap, ChevronDown, ChevronUp, Ban, RefreshCw,
} from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const STATUS_PAC: Record<string, { label: string; cls: string }> = {
  montando:      { label: "Montando",        cls: "bg-sky-100 text-sky-700" },
  montado:       { label: "Montado",         cls: "bg-emerald-100 text-emerald-700" },
  enviado_motor: { label: "No Motor",        cls: "bg-violet-100 text-violet-700" },
  publicado:     { label: "Publicado",       cls: "bg-teal-100 text-teal-700" },
  cancelado:     { label: "Cancelado",       cls: "bg-zinc-100 text-zinc-500" },
  expirado:      { label: "Expirado",        cls: "bg-zinc-100 text-zinc-400" },
  erro:          { label: "Erro (retry)",    cls: "bg-amber-100 text-amber-700" },
  dlq:           { label: "DLQ ⚠", cls: "bg-red-100 text-red-700" },
};

const MODULO_EMOJI: Record<string, string> = {
  service_listings: "🛠️", real_estate_listings: "🏠", vehicle_listings: "🚗",
  freight_listings: "🚚", travel_listings: "✈️", product_listings: "🛍️",
  advertiser_listings: "📦", auction_listings: "🔨",
};

type Aba = "pacotes" | "motor" | "indicadores";

export default function AdminOrionPackage() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("pacotes");
  const [aberto, setAberto] = useState<string>("");
  const [ocupado, setOcupado] = useState<string>("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-package-dash"], queryFn: () => rpc("orion_package_dashboard"), refetchInterval: 30000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["orion-package-dash"] });

  const acao = async (fn: () => Promise<any>, id: string) => {
    setOcupado(id);
    try { await fn(); refresh(); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const enviarMotor = (p: any) => acao(async () => {
    const canais = window.prompt("Canais (separados por vírgula): feed, whatsapp, marketplace, push", "feed,whatsapp");
    if (!canais) throw new Error("cancelado");
    const r = await rpc("orion_package_enviar_motor", {
      p_pacote: p.id, p_canais: canais.split(",").map((c) => c.trim()).filter(Boolean),
    });
    alert("Enviado ao Motor: " + JSON.stringify(r.requests));
  }, p.id);

  const [processando, setProcessando] = useState(false);
  const processar = async () => {
    setProcessando(true);
    try {
      const { data, error } = await supabase.functions.invoke("package-worker", { body: {} });
      if (error) throw new Error(error.message);
      refresh();
      alert(`Worker: ${data?.processados ?? 0} pacote(s) processado(s).`);
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setProcessando(false); }
  };

  const st = (dash?.por_status || {}) as Record<string, number>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#3a1f04] via-[#6b4212] to-[#3a1f04] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Package className="h-8 w-8 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Package AI</h1>
              <p className="text-sm text-amber-200/80">
                ORION-AI-03 · anúncio aprovado → pacote de divulgação pronto · publicação só pela porta única
                {dash?.atualizado_em ? ` · atualizado ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <button onClick={processar} disabled={processando}
              className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-[#3a1f04] hover:brightness-110 disabled:opacity-50">
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Processar fila agora
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Montados", st.montado], ["No Motor", st.enviado_motor], ["Publicados", st.publicado],
              ["Fila de eventos", dash?.fila_eventos], ["DLQ", st.dlq],
              ["Tempo médio", dash?.tempo_medio_ms ? `${dash.tempo_medio_ms}ms` : "—"],
            ].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70">{l}</p>
                <p className="text-xl font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["pacotes", Package, "Pacotes"], ["motor", Activity, "Motor de Publicação"], ["indicadores", BarChart3, "Indicadores"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#6b4212] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>}

        {/* PACOTES */}
        {aba === "pacotes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!((dash?.pacotes || []) as any[]).length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                Nenhum pacote ainda — eles nascem automaticamente quando a RIDV aprova um anúncio.
              </div>
            ) : ((dash?.pacotes || []) as any[]).map((p: any) => {
              const badge = STATUS_PAC[p.status] || { label: p.status, cls: "bg-zinc-100 text-zinc-500" };
              const exp = aberto === p.id;
              return (
                <div key={p.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg">{MODULO_EMOJI[p.tabela] || "📦"}</span>
                    <p className="min-w-0 flex-1 truncate font-bold">{p.conteudo?.titulo || p.titulo_original || "(montando…)"}</p>
                    <span className="text-[10px] text-zinc-400">v{p.versao}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${badge.cls}`}>{badge.label}</span>
                    {["montado", "erro", "enviado_motor"].includes(p.status) && (
                      <button onClick={() => enviarMotor(p)} disabled={ocupado === p.id}
                        className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                        <Send className="h-3.5 w-3.5" /> Enviar ao Motor
                      </button>
                    )}
                    {p.status !== "publicado" && (
                      <>
                        <button onClick={() => acao(() => rpc("orion_package_reprocessar", { p_pacote: p.id, p_motivo: "reprocesso manual" }), p.id)}
                          disabled={ocupado === p.id}
                          className="flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                          <RotateCcw className="h-3.5 w-3.5" /> Reprocessar
                        </button>
                        <button onClick={() => acao(() => rpc("orion_package_cancelar", { p_pacote: p.id, p_motivo: "cancelado pelo admin" }), p.id)}
                          disabled={ocupado === p.id}
                          className="flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                          <XCircle className="h-3.5 w-3.5" /> Cancelar
                        </button>
                      </>
                    )}
                    <button onClick={() => setAberto(exp ? "" : p.id)} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100">
                      {exp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {p.cidade && <>📍 {p.cidade} · </>}{new Date(p.criado_em).toLocaleString("pt-BR")}
                    {p.qualidade?.ia && <> · IA {p.qualidade.ia} ({p.qualidade.tempo_ms}ms)</>}
                    {p.erro && <span className="text-red-500"> · {String(p.erro).slice(0, 120)}</span>}
                  </p>

                  {exp && p.conteudo && (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {["whatsapp", "feed", "marketplace", "push"].map((c) => p.conteudo[c] && (
                        <div key={c} className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{c}</p>
                          <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-700">{p.conteudo[c]}</p>
                        </div>
                      ))}
                      <div className="rounded-2xl bg-slate-50 p-3 md:col-span-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Hashtags · Emojis · CTA · Link</p>
                        <p className="mt-1 text-xs text-zinc-700">
                          {(p.conteudo.hashtags || []).map((h: string) => `#${h.replace(/^#/, "")}`).join(" ")}
                          {" · "}{(p.conteudo.emojis || []).join(" ")}
                          {" · "}{p.conteudo.cta}
                        </p>
                        <a href={p.conteudo.link_oficial} target="_blank" rel="noreferrer"
                          className="mt-1 block truncate text-xs font-semibold text-sky-600">{p.conteudo.link_oficial}</a>
                      </div>
                      {p.recomendacao && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 md:col-span-2">
                          <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">
                            Recomendação comercial · confiança {Math.round(Number(p.recomendacao.confianca || 0) * 100)}%
                          </p>
                          <p className="mt-1 text-xs font-bold text-zinc-800">
                            {p.recomendacao.melhor?.pacote} — R$ {p.recomendacao.melhor?.preco_brl} ·
                            alcance ~{p.recomendacao.melhor?.alcance_estimado} · cliques ~{p.recomendacao.melhor?.cliques_estimados} ·
                            conversões ~{p.recomendacao.melhor?.conversoes_estimadas}
                          </p>
                          <p className="mt-1 text-xs text-zinc-600">{p.recomendacao.motivo}</p>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            ⏰ {p.recomendacao.horario_recomendado} · {p.recomendacao.gratuito}
                          </p>
                          <p className="mt-1 text-[10px] text-zinc-400">{p.recomendacao.decisao}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* MOTOR */}
        {aba === "motor" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-400">
              Porta única de publicação (motor_publish_request). Canais <b>feed/marketplace</b> publicam na própria
              plataforma (imediato); <b>whatsapp/push</b> aguardam o Dispatcher (M54) — nenhuma solicitação se perde.
            </p>
            {!((dash?.motor_recentes || []) as any[]).length ? (
              <div className="p-10 text-center text-zinc-400">Nenhuma solicitação ao motor ainda.</div>
            ) : ((dash?.motor_recentes || []) as any[]).map((r: any) => (
              <div key={r.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 p-3">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black text-zinc-500">{r.canal}</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                  r.status === "publicado" ? "bg-teal-100 text-teal-700"
                  : r.status === "aguardando_dispatcher" ? "bg-violet-100 text-violet-700"
                  : r.status === "cancelado" ? "bg-zinc-100 text-zinc-500"
                  : r.status === "retry" ? "bg-sky-100 text-sky-700"
                  : "bg-amber-100 text-amber-700"}`}>{r.status}</span>
                <span className="text-xs text-zinc-500">{r.origem}{r.cidade ? ` · 📍 ${r.cidade}` : ""}</span>
                <span className="ml-auto text-[11px] text-zinc-400">{new Date(r.criado_em).toLocaleString("pt-BR")}</span>
                {["fila", "aguardando_dispatcher", "erro", "retry"].includes(r.status) && (
                  <button onClick={() => acao(() => rpc("motor_publish_cancel", { p_request: r.id, p_motivo: "cancelado pelo admin" }), r.id)}
                    className="flex items-center gap-1 rounded-xl bg-red-600 px-2.5 py-1 text-[11px] font-black text-white">
                    <Ban className="h-3 w-3" /> Cancelar
                  </button>
                )}
                {["erro", "dlq", "cancelado"].includes(r.status) && (
                  <button onClick={() => acao(() => rpc("motor_publish_retry", { p_request: r.id }), r.id)}
                    className="flex items-center gap-1 rounded-xl bg-sky-600 px-2.5 py-1 text-[11px] font-black text-white">
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                )}
                {r.erro && <p className="w-full text-[11px] text-red-500">{String(r.erro).slice(0, 140)}</p>}
              </div>
            ))}
          </div>
        )}

        {/* INDICADORES */}
        {aba === "indicadores" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Pacotes montados por dia (14 dias)</h3>
              {!((dash?.serie_14d || []) as any[]).length ? (
                <p className="p-6 text-center text-sm text-zinc-400">Sem pacotes no período.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={(dash?.serie_14d || []).map((d: any) => ({
                      ...d, dia: new Date(d.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
                    }))}>
                      <XAxis dataKey="dia" fontSize={11} />
                      <YAxis allowDecimals={false} fontSize={11} />
                      <Tooltip />
                      <Bar dataKey="montados" name="Montados" fill="#d97706" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Por cidade", dash?.por_cidade, (x: any) => x.cidade, (x: any) => x.n],
                ["Por categoria", dash?.por_categoria, (x: any) => x.categoria, (x: any) => x.n],
              ].map(([titulo, lista, fL, fV]: any) => (
                <div key={titulo} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-sm font-black text-zinc-700">{titulo}</h3>
                  {!((lista || []) as any[]).length ? (
                    <p className="py-4 text-center text-sm text-zinc-400">Sem dados ainda.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {(lista as any[]).map((x, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate text-zinc-600">{fL(x)}</span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-700">{fV(x)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm text-xs text-zinc-500">
              Motor: {JSON.stringify(dash?.motor_por_status || {})} · Histórico publicados: {dash?.metricas?.publicados_hist ?? 0}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Package AI v2.0 · ORION-AI-03 · Publisher → RIDV → Package → Motor (porta única) → GLM ·
          conteúdo via ORION AI Gateway · catálogo oficial: divulgacao_packages · a compra é sempre decisão do usuário
        </p>
      </div>
    </div>
  );
}
