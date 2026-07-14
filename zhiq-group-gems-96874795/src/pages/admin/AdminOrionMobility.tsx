/**
 * /admin/orion-mobility — ORION MOBILITY 360° (Fase 1)
 *
 * Centro de inteligência dos profissionais (motoboy / moto-táxi / motorista):
 *  - Dashboard executivo em tempo real (totais, online, operação 30d)
 *  - ORION SCORE 0-1000 com níveis e breakdown explicável por profissional
 *  - Centro Antifraude v1 (duplicidades, CNH vencida, selfie pendente — CPF sempre mascarado)
 *  - Alertas de documentação e cobertura
 * Extensível: novas categorias profissionais plugam nos motores SQL sem tocar no núcleo.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Brain, Bike, Car, ShieldAlert, Trophy, AlertTriangle, Loader2, RefreshCw, Wifi, WifiOff,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const NIVEL_CLS: Record<string, string> = {
  Bronze:   "bg-amber-100 text-amber-800",
  Prata:    "bg-zinc-200 text-zinc-700",
  Ouro:     "bg-yellow-100 text-yellow-700",
  Diamante: "bg-cyan-100 text-cyan-700",
  Elite:    "bg-indigo-100 text-indigo-700",
  Black:    "bg-zinc-900 text-white",
  Titanium: "bg-slate-300 text-slate-800",
  Infinity: "bg-gradient-to-r from-purple-600 to-pink-500 text-white",
};

type Aba = "dashboard" | "score" | "antifraude" | "alertas";

export default function AdminOrionMobility() {
  const [aba, setAba] = useState<Aba>("dashboard");

  const { data: dash, refetch: refDash, isFetching } = useQuery({
    queryKey: ["orion-mob-dash"], queryFn: () => rpc("orion_mobility_dashboard"), refetchInterval: 30000,
  });
  const { data: scores, isLoading: scoresLoading } = useQuery({
    queryKey: ["orion-mob-scores"], queryFn: () => rpc("orion_score_profissionais"),
  });
  const { data: fraudes } = useQuery({
    queryKey: ["orion-mob-fraudes"], queryFn: () => rpc("orion_fraude_scan"),
  });
  const { data: alertas } = useQuery({
    queryKey: ["orion-mob-alertas"], queryFn: () => rpc("orion_mobility_alertas"), refetchInterval: 60000,
  });

  const mb = dash?.motoboys || {};
  const mt = dash?.motoristas_mototaxi || {};
  const op = dash?.operacao_30d || {};

  const abas: { id: Aba; label: string; icon: any; badge?: number }[] = [
    { id: "dashboard",  label: "Dashboard",        icon: Brain },
    { id: "score",      label: "ORION Score",      icon: Trophy },
    { id: "antifraude", label: "Antifraude",       icon: ShieldAlert, badge: ((fraudes || []) as any[]).length },
    { id: "alertas",    label: "Alertas",          icon: AlertTriangle, badge: ((alertas || []) as any[]).length },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-[#1a0b3a] via-[#2b1265] to-[#1a0b3a] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-3xl ring-1 ring-white/20">🧠</div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION MOBILITY 360°</h1>
              <p className="text-sm text-purple-200/80">Inteligência dos profissionais — motoboy, moto-táxi e motorista</p>
            </div>
            <button onClick={() => refDash()} className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold ring-1 ring-white/20 hover:bg-white/20">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Motoboys", mb.total, `${mb.online ?? 0} online`, Bike],
              ["Motorista/Moto-Táxi", mt.total, `${mt.online ?? 0} online`, Car],
              ["Pedidos 30d", op.pedidos, `${op.concluidos ?? 0} concluídos`, null],
              ["Cancelados 30d", op.cancelados, op.pedidos ? `${Math.round(100 * (op.cancelados || 0) / op.pedidos)}%` : "—", null],
              ["Selfies pendentes", mt.selfie_pendente, "verificação", null],
              ["CNH vencida", mt.cnh_vencida, `${mt.cnh_vence_30d ?? 0} vencem em 30d`, null],
            ].map(([label, valor, sub, Icon]: any) => (
              <div key={label} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-200/70">
                  {Icon && <Icon className="h-3 w-3" />} {label}
                </p>
                <p className="text-xl font-black">{Number(valor || 0).toLocaleString("pt-BR")}</p>
                <p className="text-[10px] text-purple-200/60">{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Abas */}
        <div className="mt-6 flex flex-wrap gap-2">
          {abas.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                aba === a.id ? "bg-[#2b1265] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <a.icon className="h-4 w-4" /> {a.label}
              {!!a.badge && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">{a.badge}</span>}
            </button>
          ))}
        </div>

        {/* DASHBOARD */}
        {aba === "dashboard" && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-black"><Bike className="h-5 w-5 text-orange-500" /> Motoboys</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-zinc-400">Total</p><p className="text-2xl font-black">{mb.total ?? 0}</p></div>
                <div className="rounded-2xl bg-emerald-50 p-3"><p className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600"><Wifi className="h-3 w-3" /> Online</p><p className="text-2xl font-black text-emerald-700">{mb.online ?? 0}</p></div>
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-black"><Car className="h-5 w-5 text-indigo-500" /> Motorista / Moto-Táxi</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-zinc-400">Total</p><p className="text-2xl font-black">{mt.total ?? 0}</p></div>
                <div className="rounded-2xl bg-emerald-50 p-3"><p className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600"><Wifi className="h-3 w-3" /> Online</p><p className="text-2xl font-black text-emerald-700">{mt.online ?? 0}</p></div>
                <div className="rounded-2xl bg-amber-50 p-3"><p className="text-[10px] font-black uppercase text-amber-600">Selfie pendente</p><p className="text-2xl font-black text-amber-700">{mt.selfie_pendente ?? 0}</p></div>
                <div className="rounded-2xl bg-red-50 p-3"><p className="text-[10px] font-black uppercase text-red-600">CNH vencida</p><p className="text-2xl font-black text-red-700">{mt.cnh_vencida ?? 0}</p></div>
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm lg:col-span-2">
              <h3 className="font-black">Operação — últimos 30 dias</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {[["Pedidos", op.pedidos], ["Concluídos", op.concluidos], ["Cancelados", op.cancelados], ["Corridas (motorista)", op.corridas_motorista]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase text-zinc-400">{l}</p>
                    <p className="text-2xl font-black text-[#2b1265]">{Number(v || 0).toLocaleString("pt-BR")}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ORION SCORE */}
        {aba === "score" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-400">OSCORE v1 (0–1000) — fórmula documentada e versionada em orion_indices. Clique em "breakdown" para ver a composição de cada pontuação.</p>
            {scoresLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-purple-500" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-left text-[11px] font-black uppercase tracking-wider text-zinc-400">
                      <th className="py-2 pr-2">#</th><th className="py-2 pr-2">Profissional</th>
                      <th className="py-2 pr-2">Categoria</th><th className="py-2 pr-2">Cidade</th>
                      <th className="py-2 pr-2">Status</th><th className="py-2 pr-2">Score</th><th className="py-2">Nível</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((scores || []) as any[]).map((s: any, i: number) => (
                      <tr key={`${s.user_id}-${s.categoria}`} className="border-b border-zinc-50 align-top hover:bg-slate-50/60">
                        <td className="py-2 pr-2 font-black text-zinc-300">{i + 1}</td>
                        <td className="py-2 pr-2">
                          <p className="font-bold">{s.nome}</p>
                          <details className="text-[11px] text-zinc-500">
                            <summary className="cursor-pointer select-none text-purple-600">breakdown</summary>
                            <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-[10px]">{JSON.stringify(s.breakdown, null, 1)}</pre>
                          </details>
                        </td>
                        <td className="py-2 pr-2 text-xs">{s.categoria}</td>
                        <td className="py-2 pr-2 text-xs text-zinc-500">{s.cidade || "—"}</td>
                        <td className="py-2 pr-2">
                          {s.is_online
                            ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><Wifi className="h-3.5 w-3.5" /> online</span>
                            : <span className="flex items-center gap-1 text-xs text-zinc-400"><WifiOff className="h-3.5 w-3.5" /> offline</span>}
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-black tabular-nums text-[#2b1265]">{s.score}</span>
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100">
                              <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${s.score / 10}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="py-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${NIVEL_CLS[s.nivel] || NIVEL_CLS.Bronze}`}>{s.nivel}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ANTIFRAUDE */}
        {aba === "antifraude" && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-zinc-400">Varredura v1: duplicidade de documentos, CNH vencida e verificação de identidade. CPF sempre mascarado (LGPD). Detecções de GPS falso/emulador/IP entram na Fase 2 com telemetria do app.</p>
            {!((fraudes || []) as any[]).length && (
              <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/50 p-10 text-center font-bold text-emerald-600">✅ Nenhuma suspeita encontrada na varredura atual.</div>
            )}
            {((fraudes || []) as any[]).map((f: any, i: number) => (
              <div key={i} className={`rounded-3xl border p-4 shadow-sm ${f.gravidade === "alta" ? "border-red-100 bg-red-50/60" : "border-amber-100 bg-amber-50/60"}`}>
                <div className="flex items-center gap-2">
                  <ShieldAlert className={`h-5 w-5 ${f.gravidade === "alta" ? "text-red-500" : "text-amber-500"}`} />
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${f.gravidade === "alta" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{f.gravidade} · {f.tipo}</span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-zinc-800">{f.descricao}</p>
                <p className="mt-1 text-xs text-zinc-500"><b>Ação sugerida:</b> {f.recomendacao}</p>
              </div>
            ))}
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && (
          <div className="mt-4 space-y-3">
            {!((alertas || []) as any[]).length && (
              <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/50 p-10 text-center font-bold text-emerald-600">✅ Nenhum alerta de documentação ou cobertura agora.</div>
            )}
            {((alertas || []) as any[]).map((a: any, i: number) => (
              <div key={i} className={`rounded-3xl border p-4 shadow-sm ${a.severidade === "alta" ? "border-red-100 bg-red-50/60" : "border-amber-100 bg-amber-50/60"}`}>
                <p className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                  <AlertTriangle className={`h-5 w-5 shrink-0 ${a.severidade === "alta" ? "text-red-500" : "text-amber-500"}`} />
                  {a.mensagem}
                </p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION MOBILITY 360° Fase 1 · score e antifraude sobre dados reais · novas categorias profissionais plugam nos motores sem alterar o núcleo
        </p>
      </div>
    </div>
  );
}
