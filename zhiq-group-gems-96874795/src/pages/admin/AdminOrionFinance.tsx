/**
 * /admin/orion-finance — ORION Finance AI (ORION-AI-04)
 *
 * Cérebro financeiro CONSULTIVO: dashboard executivo (receita 3 fontes,
 * carteiras, previsões, insights, custos de IA), conciliação contínua
 * com divergências acionáveis, antifraude com score e evidências, e
 * alertas por severidade. NUNCA movimenta dinheiro — analisa e recomenda;
 * toda ação financeira segue os fluxos homologados do motor pay.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiSummary } from "@/lib/ai/orionAiGateway";
import {
  Landmark, Loader2, Activity, ShieldAlert, Bell, RefreshCw,
  CheckCircle2, TrendingUp, Wallet, Bot, Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
} from "recharts";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const SEV: Record<string, string> = {
  informativo: "bg-sky-100 text-sky-700",
  atencao: "bg-amber-100 text-amber-700",
  critico: "bg-red-100 text-red-700",
};

const OWNER_LABEL: Record<string, string> = {
  platform: "Plataforma", merchant_store: "Lojistas", motoboy_profile: "Motoboys",
  mototaxi_profile: "Moto-táxis", driver_profile: "Motoristas", customer: "Clientes",
};

type Aba = "executivo" | "conciliacao" | "fraude" | "alertas";

export default function AdminOrionFinance() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("executivo");
  const [ocupado, setOcupado] = useState("");
  const [fraude, setFraude] = useState<any[] | null>(null);
  const [analise, setAnalise] = useState<string>("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-finance-dash"], queryFn: () => rpc("orion_finance_dashboard"), refetchInterval: 60000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["orion-finance-dash"] });

  const conciliar = async () => {
    setOcupado("conciliar");
    try { const r = await rpc("orion_finance_conciliar"); refresh();
      alert(`Conciliação: ${r.novas_divergencias} nova(s) divergência(s); ${r.abertas_total} aberta(s).`);
    } catch (e: any) { alert("Erro: " + e.message); } finally { setOcupado(""); }
  };
  const rodarFraude = async () => {
    setOcupado("fraude");
    try { const r = await rpc("orion_finance_fraude"); setFraude(r.suspeitos || []); }
    catch (e: any) { alert("Erro: " + e.message); } finally { setOcupado(""); }
  };
  const resolver = async (tipo: "divergencia" | "alerta", id: string) => {
    const nota = tipo === "divergencia" ? window.prompt("Nota de resolução (auditada):") : null;
    if (tipo === "divergencia" && !nota) return;
    setOcupado(id);
    try { await rpc("orion_finance_resolver", { p_tipo: tipo, p_id: id, p_nota: nota }); refresh(); }
    catch (e: any) { alert("Erro: " + e.message); } finally { setOcupado(""); }
  };
  const analisarComOrion = async () => {
    setOcupado("orion");
    try {
      const r = await orionAiSummary("finance",
        `Analise os indicadores financeiros da plataforma VIAGG-TX8 e escreva um parecer executivo curto (5-8 frases, pt-BR), apontando saúde, riscos e prioridades. Dados: ${JSON.stringify({ receita: dash?.receita, carteiras: dash?.carteiras, previsao: dash?.previsao, divergencias: dash?.divergencias?.abertas, custos_ia: dash?.custos_ia?.total_usd })}`,
        { maxTokens: 500 });
      setAnalise(r.ok ? String(r.texto) : `IA indisponível (${r.error}) — indicadores continuam disponíveis abaixo.`);
    } finally { setOcupado(""); }
  };

  const rec = dash?.receita || {};
  const prev = dash?.previsao || {};
  const fmt = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#06281c] via-[#0c5236] to-[#06281c] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Landmark className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Finance AI</h1>
              <p className="text-sm text-emerald-200/80">
                ORION-AI-04 · consultivo: monitora, concilia, pontua e recomenda — nunca movimenta dinheiro
                {dash?.atualizado_em ? ` · atualizado ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <button onClick={conciliar} disabled={!!ocupado}
              className="flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-black text-[#06281c] hover:brightness-110 disabled:opacity-50">
              {ocupado === "conciliar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Conciliar agora
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Receita total (ordens)", fmt(rec.ordens_pagas_total)],
              ["Receita mês", fmt(rec.ordens_pagas_mes)],
              ["Comissões plataforma", fmt(rec.comissoes_plataforma)],
              ["Divergências abertas", dash?.divergencias?.abertas ?? 0],
              ["Críticas", dash?.divergencias?.criticas ?? 0],
              ["Custo IA total", `US$ ${Number(dash?.custos_ia?.total_usd || 0).toFixed(4)}`],
            ].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">{l}</p>
                <p className="text-lg font-black">{String(v)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["executivo", TrendingUp, "Executivo"], ["conciliacao", Activity, `Conciliação${dash?.divergencias?.abertas ? ` (${dash.divergencias.abertas})` : ""}`], ["fraude", ShieldAlert, "Antifraude"], ["alertas", Bell, `Alertas${(dash?.alertas || []).length ? ` (${dash.alertas.length})` : ""}`]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#0c5236] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}

        {/* EXECUTIVO */}
        {aba === "executivo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-zinc-700">Parecer da ORION</h3>
                <button onClick={analisarComOrion} disabled={!!ocupado}
                  className="flex items-center gap-1 rounded-xl bg-[#0c5236] px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                  {ocupado === "orion" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Gerar análise
                </button>
              </div>
              {analise && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{analise}</p>}
            </div>

            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Receita 30 dias (ordens pagas)</h3>
              {!((dash?.serie_30d || []) as any[]).length ? (
                <p className="p-6 text-center text-sm text-zinc-400">Sem receita no período.</p>
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={(dash?.serie_30d || []).map((d: any) => ({
                      ...d, dia: new Date(d.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
                    }))}>
                      <XAxis dataKey="dia" fontSize={10} />
                      <YAxis yAxisId="r" fontSize={10} />
                      <YAxis yAxisId="n" orientation="right" allowDecimals={false} fontSize={10} />
                      <Tooltip /><Legend />
                      <Bar yAxisId="r" dataKey="receita" name="Receita R$" fill="#059669" />
                      <Line yAxisId="n" dataKey="ordens" name="Ordens" stroke="#0284c7" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700"><Wallet className="h-4 w-4" /> Carteiras (motor pay)</h3>
                <ul className="space-y-1.5">
                  {((dash?.carteiras || []) as any[]).map((w: any) => (
                    <li key={w.tipo} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 font-semibold text-zinc-600">{OWNER_LABEL[w.tipo] || w.tipo} ({w.contas})</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-black text-emerald-700">{fmt(w.saldo)}</span>
                      {Number(w.reservado) > 0 && <span className="text-[10px] text-zinc-400">res. {fmt(w.reservado)}</span>}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-zinc-400">
                  Receita de divulgação ({fmt(rec.promocao_total)}) é fora do ledger (promotion_purchases) — sempre somada à parte.
                </p>
              </div>

              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Previsão ({prev.base})</h3>
                <ul className="space-y-1.5 text-xs">
                  {[["Diária", prev.diaria], ["Semanal", prev.semanal], ["Mensal", prev.mensal], ["Anual", prev.anual], ["Ticket médio 30d", prev.ticket_medio_30d]].map(([l, v]: any) => (
                    <li key={l} className="flex items-center gap-2">
                      <span className="flex-1 text-zinc-600">{l}</span>
                      <span className="font-black text-zinc-800">{fmt(v)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-zinc-400">{prev.nota}</p>
              </div>

              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Receita por produto</h3>
                <ul className="space-y-1.5 text-xs">
                  {((rec.por_produto || []) as any[]).map((p: any) => (
                    <li key={p.produto} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-zinc-600">{p.produto} ({p.n})</span>
                      <span className="font-black text-zinc-800">{fmt(p.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700"><Bot className="h-4 w-4" /> Custos de IA (Gateway)</h3>
                <ul className="space-y-1.5 text-xs">
                  {((dash?.custos_ia?.por_modulo || []) as any[]).map((c: any) => (
                    <li key={c.modulo} className="flex items-center gap-2">
                      <span className="flex-1 text-zinc-600">{c.modulo} ({c.chamadas})</span>
                      <span className="font-black text-zinc-800">US$ {Number(c.usd).toFixed(5)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-zinc-400">
                  Hoje: US$ {Number(dash?.custos_ia?.hoje_usd || 0).toFixed(5)} · por modelo: {((dash?.custos_ia?.por_modelo || []) as any[]).map((m: any) => `${m.modelo}: US$ ${Number(m.usd).toFixed(5)}`).join(" · ")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CONCILIAÇÃO */}
        {aba === "conciliacao" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-400">
              Divergências detectadas automaticamente (conciliação a cada hora). Resolver aqui apenas marca o caso
              como tratado com nota auditada — <b>nenhuma correção financeira é automática</b>.
            </p>
            {!((dash?.divergencias?.lista || []) as any[]).length ? (
              <div className="p-10 text-center text-zinc-400">✅ Nenhuma divergência aberta.</div>
            ) : ((dash?.divergencias?.lista || []) as any[]).map((d: any) => (
              <div key={d.id} className="mb-2 rounded-2xl border border-zinc-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${SEV[d.gravidade] || SEV.informativo}`}>{d.gravidade}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{d.tipo}</span>
                  <p className="min-w-0 flex-1 text-sm font-semibold text-zinc-700">{d.descricao}</p>
                  <button onClick={() => resolver("divergencia", d.id)} disabled={ocupado === d.id}
                    className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Marcar resolvida
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  detectada {new Date(d.detectada_em).toLocaleString("pt-BR")} · evidências: {JSON.stringify(d.evidencias).slice(0, 180)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ANTIFRAUDE */}
        {aba === "fraude" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <button onClick={rodarFraude} disabled={!!ocupado}
              className="flex items-center gap-2 rounded-xl bg-[#0c5236] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
              {ocupado === "fraude" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
              Executar varredura antifraude
            </button>
            {fraude !== null && (
              !fraude.length ? (
                <div className="p-8 text-center text-zinc-400">✅ Nenhum padrão suspeito nos últimos 30 dias.</div>
              ) : fraude.map((s: any, i: number) => (
                <div key={i} className="mt-3 rounded-2xl border border-zinc-100 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${Number(s.score) >= 70 ? "bg-red-100 text-red-700" : Number(s.score) >= 40 ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
                      score {s.score}/100
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">confiança {s.confianca}</span>
                    <span className="text-xs text-zinc-500">pagador {String(s.payer_owner_id).slice(0, 8)}…</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-zinc-700">{s.motivo}</p>
                  <p className="mt-1 text-xs text-zinc-500">{s.recomendacao}</p>
                  <div className="mt-1.5 space-y-0.5">
                    {((s.evidencias || []) as any[]).slice(0, 5).map((e: any, j: number) => (
                      <p key={j} className="text-[11px] text-zinc-400">
                        • {fmt(e.amount)} · {e.status} · {new Date(e.quando).toLocaleString("pt-BR")}
                      </p>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            {!((dash?.alertas || []) as any[]).length ? (
              <div className="p-10 text-center text-zinc-400">✅ Nenhum alerta aberto.</div>
            ) : ((dash?.alertas || []) as any[]).map((a: any) => (
              <div key={a.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 p-3">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${SEV[a.severidade] || SEV.informativo}`}>{a.severidade}</span>
                <p className="min-w-0 flex-1 text-sm font-semibold text-zinc-700">{a.titulo}</p>
                <span className="text-[11px] text-zinc-400">{new Date(a.criado_em).toLocaleString("pt-BR")}</span>
                <button onClick={() => resolver("alerta", a.id)} disabled={ocupado === a.id}
                  className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                  Resolver
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Finance AI v1.0 · ORION-AI-04 · read-only sobre o motor pay (provado) · conciliação horária (cron) ·
          receita = ordens pagas + promoção + comissões · a IA recomenda, o humano decide
        </p>
      </div>
    </div>
  );
}
