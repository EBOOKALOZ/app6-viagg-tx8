/**
 * /admin/orion-fraud — ORION Fraud Detection AI (ORION-AI-41)
 *
 * Fraud Intelligence Engine oficial: 17 detectores com EVIDÊNCIA real em 6
 * categorias (conta, marketplace, delivery, financeiro, usuário, IA). Recomenda,
 * NUNCA bloqueia sozinho — ações de alto impacto exigem aprovação humana.
 * 2º módulo do Security Ecosystem (complementa AI-24; AI-40 declarado pendente).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, Gauge, Users, Store, Bike, Wallet, Map, Trophy } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const brl = (v: any) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fsColor = (s: number) => s >= 80 ? "text-red-300" : s >= 60 ? "text-amber-300" : s >= 40 ? "text-yellow-300" : "text-emerald-300";
const SEV: Record<string, string> = { critica: "bg-red-100 text-red-700", alta: "bg-amber-100 text-amber-700", media: "bg-yellow-100 text-yellow-700", baixa: "bg-slate-100 text-slate-600" };
const ST: Record<string, string> = { detectada: "bg-slate-100 text-slate-600", em_analise: "bg-sky-100 text-sky-700", confirmada: "bg-red-100 text-red-700", falso_positivo: "bg-emerald-100 text-emerald-700", resolvida: "bg-zinc-100 text-zinc-500" };

type Aba = "resumo" | "conta" | "marketplace" | "delivery" | "financeiro" | "heatmap" | "ranking";

function Painel({ titulo, painel, extra, onMark, busyId }: { titulo: string; painel: any; extra?: string; onMark: (id: number, st: string) => void; busyId: number | null }) {
  const eventos = (painel?.eventos || []) as any[];
  const porTipo = painel?.por_tipo || {};
  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Casos", painel?.total ?? 0], ["Abertos", painel?.abertas ?? 0], ["Valor envolvido", brl(painel?.valor_envolvido)]].map(([l, v]: any) => (
          <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
            <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
            <p className="text-xl font-black text-zinc-800">{String(v)}</p>
          </div>
        ))}
      </div>
      {Object.keys(porTipo).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(porTipo).map(([t, n]: any) => (
            <span key={t} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{t}: {n}</span>
          ))}
        </div>
      )}
      <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-black text-zinc-700">{titulo}</h3>
        {!eventos.length ? <p className="text-xs text-zinc-400">Nenhum caso nesta categoria. 🎉</p> : eventos.map((e: any) => (
          <details key={e.fraud_id} className="mb-2 rounded-2xl bg-slate-50 p-3">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[e.severity] || ""}`}>{e.severity}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">#{e.fraud_id} · {e.tipo} · {e.entidade}</span>
              <span className="text-[11px] font-black text-zinc-600">FS {e.fs}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[e.status] || ""}`}>{e.status}</span>
            </summary>
            <div className="mt-2 space-y-1 text-[11px] text-zinc-600">
              <p><b>Evidências:</b></p>
              <pre className="overflow-auto rounded-xl bg-white p-2 text-[10px] text-zinc-500">{JSON.stringify(e.evidencias, null, 2)}</pre>
              <p>Confiança {e.fc} · {brl(e.valor)} · {String(e.em).slice(0, 19).replace("T", " ")}</p>
              {(e.status === "detectada" || e.status === "em_analise") && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => onMark(e.fraud_id, "confirmada")} disabled={busyId === e.fraud_id}
                    className="rounded-xl bg-red-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Confirmar fraude</button>
                  <button onClick={() => onMark(e.fraud_id, "falso_positivo")} disabled={busyId === e.fraud_id}
                    className="rounded-xl bg-emerald-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Falso positivo</button>
                </div>
              )}
            </div>
          </details>
        ))}
        {extra && <p className="mt-2 text-[10px] text-zinc-400">{extra}</p>}
      </div>
    </div>
  );
}

function Barras({ titulo, dados }: { titulo: string; dados: Record<string, number> }) {
  const entries = Object.entries(dados || {}).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const max = Math.max(1, ...entries.map(([, v]) => Number(v)));
  return (
    <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-black text-zinc-700">{titulo}</h3>
      {!entries.length ? <p className="text-xs text-zinc-400">Sem dados.</p> : entries.map(([k, v]) => (
        <div key={k} className="mb-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="min-w-0 flex-1 truncate font-bold text-zinc-600">{k}</span>
            <span className="font-black text-zinc-700">{v}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-red-400" style={{ width: `${(Number(v) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminOrionFraud() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-fraud"], queryFn: () => rpc("fraud_dashboard"), refetchInterval: 60000,
  });

  const ov = dash?.overview || {};
  const heat = dash?.heatmap || {};
  const rank = dash?.ranking || {};
  const met = dash?.metrics || {};
  const lacunas = (dash?.lacunas || []) as string[];
  const acoes = (met?.acoes_recentes || []) as any[];
  const stats7 = (met?.estatisticas_7d || []) as any[];
  const tendencia = (ov.tendencia_7d ?? 0) - (ov.tendencia_7d_anterior ?? 0);

  const mark = async (id: number, st: string) => {
    setBusyId(id); setMsg("");
    try { await rpc("fraud_mark", { p_fraud_id: id, p_status: st, p_motivo: "revisão via painel FRAUD" }); setMsg(`✓ Caso #${id} marcado como ${st}.`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setBusyId(null); }
  };

  const desfazer = async (actionId: number) => {
    setBusyId(actionId); setMsg("");
    try { const r = await rpc("fraud_action_rollback", { p_action_id: actionId, p_motivo: "rollback via painel FRAUD" }); setMsg(r.ok ? `✓ Ação #${actionId} revertida (linha compensatória).` : `Recusado: ${r.motivo}`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setBusyId(null); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#1a0b0b] via-[#2b1e1e] to-[#1a0b0b] p-6 text-white shadow-xl ring-1 ring-red-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/30">
              <ShieldAlert className="h-8 w-8 text-red-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Fraud Detection</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-41 · Security Ecosystem · 17 detectores com evidência · recomenda, nunca bloqueia sozinho
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-red-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-200/70">Fraud Score médio</p>
              <p className={`text-4xl font-black ${fsColor(ov.fs_medio ?? 0)}`}>{ov.fs_medio ?? "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{ov.criticas_abertas ?? 0} crítica(s) aberta(s)</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Fraudes hoje", ov.fraudes_hoje], ["Em análise", ov.em_analise], ["Confirmadas", ov.confirmadas],
              ["Perdas evitadas 30d", brl(ov.perdas_evitadas_30d)], ["FPR", `${((ov.fpr ?? 0) * 100).toFixed(1)}%`],
              ["Tendência 7d", `${tendencia >= 0 ? "+" : ""}${tendencia}`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Visão Geral"], ["conta", Users, "Contas & Usuários"], ["marketplace", Store, "Marketplace"],
             ["delivery", Bike, "Delivery & Corridas"], ["financeiro", Wallet, "Financeiro"],
             ["heatmap", Map, "Heatmap"], ["ranking", Trophy, "Ranking"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#2b1e1e] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {msg && <p className="mt-3 rounded-2xl bg-slate-100 px-4 py-2 text-xs font-bold text-zinc-700">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-red-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Fraud Score (FS)", ov.fs_medio, "intensidade média dos casos ativos"],
                ["Financial Risk (FR)", ov.fr_medio, "risco financeiro médio"],
                ["Trust Score (FT)", ov.ft_medio, "confiança restante nas entidades"],
                ["Fraud Confidence (FC)", ov.fc_medio, "confiança média das detecções"]].map(([l, v, d]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-2xl font-black text-red-700">{v ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">{d}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">📊 Estatísticas (7 dias)</h3>
              {!stats7.length ? <p className="text-xs text-zinc-400">Sem estatísticas ainda.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead><tr className="text-zinc-400">
                      <th className="pb-1 pr-3">Dia</th><th className="pr-3">Detectadas</th><th className="pr-3">Confirmadas</th>
                      <th className="pr-3">Falsos +</th><th className="pr-3">Perdas evitadas</th><th>Resposta média</th>
                    </tr></thead>
                    <tbody>{stats7.map((s: any) => (
                      <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                        <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.detectadas}</td><td className="pr-3">{s.confirmadas}</td>
                        <td className="pr-3">{s.fp}</td><td className="pr-3">{brl(s.elp)}</td><td>{s.resposta_s}s</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-[10px] text-zinc-400">Perdas evitadas (ELP) = estimativa DECLARADA: valor envolvido em casos alta/crítica tratados — não é perda contábil.</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🧾 Ações da política (trilha imutável · rollback = linha compensatória)</h3>
              {!acoes.length ? <p className="text-xs text-zinc-400">Nenhuma ação registrada.</p> : acoes.map((a: any) => (
                <div key={a.action_id} className="mb-1 flex flex-wrap items-center gap-2 border-b border-zinc-50 pb-1 text-[11px]">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-black text-slate-600">#{a.action_id}</span>
                  <span className="font-bold text-zinc-700">{a.acao}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-500">{a.motivo}</span>
                  {a.rollback_de && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">↺ reverte #{a.rollback_de}</span>}
                  <span className="text-zinc-400">{a.operador}</span>
                  {a.acao !== "rollback" && a.acao !== "marcacao_status" && (
                    <button onClick={() => desfazer(a.action_id)} disabled={busyId === a.action_id}
                      className="rounded-lg bg-zinc-800 px-2 py-0.5 text-[10px] font-black text-white disabled:opacity-40">rollback</button>
                  )}
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-1 text-sm font-black text-amber-800">Lacunas declaradas (nunca inventamos detecção)</h3>
              {lacunas.map((l, i) => <p key={i} className="text-[11px] font-semibold text-amber-700">· {l}</p>)}
            </div>
          </div>
        )}

        {/* CATEGORIAS */}
        {aba === "conta" && !isLoading && (
          <>
            <Painel titulo="👤 Casos de conta (documentos, telefones, e-mails, dispositivos)" painel={dash?.conta} onMark={mark} busyId={busyId} />
            <Painel titulo="🤖 Comportamento de usuários (automação, mudança brusca)" painel={dash?.usuario} onMark={mark} busyId={busyId} />
          </>
        )}
        {aba === "marketplace" && !isLoading && (
          <>
            <Painel titulo="🏪 Casos de marketplace (auto-clique, auto-interesse, spam)" painel={dash?.marketplace} onMark={mark} busyId={busyId} />
            <Painel titulo="🧠 Exploração de IA/algoritmos (ranking, recomendações)" painel={dash?.ia} onMark={mark} busyId={busyId} />
          </>
        )}
        {aba === "delivery" && !isLoading && (
          <Painel titulo="🏍 Delivery & corridas (velocidade impossível, corrida instantânea, cancelamento em massa, conluio)"
            painel={dash?.delivery} onMark={mark} busyId={busyId}
            extra="Tabelas de corridas/entregas hoje sem volume — detectores prontos e armados; GPS fino exige telemetria do app (DECLARADO)." />
        )}
        {aba === "financeiro" && !isLoading && (
          <Painel titulo="💰 Casos financeiros (pagamentos idênticos, estornos, créditos)"
            painel={dash?.financeiro} onMark={mark} busyId={busyId}
            extra="Cupons/cashback não existem no banco (DECLARADO). Carteira: esquema aguardando validação (DECLARADO)." />
        )}

        {/* HEATMAP */}
        {aba === "heatmap" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Barras titulo="🗺 Fraudes por cidade" dados={heat.por_cidade} />
            <Barras titulo="🗺 Fraudes por estado" dados={heat.por_estado} />
            <Barras titulo="📂 Fraudes por categoria" dados={heat.por_categoria} />
            <Barras titulo="🕐 Fraudes por hora do dia" dados={heat.por_hora} />
            <p className="text-[10px] text-zinc-400 md:col-span-2">{heat.nota}</p>
          </div>
        )}

        {/* RANKING */}
        {aba === "ranking" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🏆 Padrões mais frequentes</h3>
              {!(rank.padroes || []).length ? <p className="text-xs text-zinc-400">Sem padrões.</p> : rank.padroes.map((p: any) => (
                <div key={p.padrao} className="mb-2 rounded-2xl bg-slate-50 p-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-black text-zinc-700">{p.padrao}</span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">risco {p.risco}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{p.frequencia}×</span>
                  </div>
                  <p className="text-[10px] text-zinc-500">{p.descricao}</p>
                </div>
              ))}
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">🔁 Usuários reincidentes</h3>
                {!(rank.reincidentes || []).length ? <p className="text-xs text-zinc-400">Nenhum reincidente.</p> : rank.reincidentes.map((u: any) => (
                  <p key={u.user_id} className="mb-1 truncate text-[11px] font-semibold text-zinc-600">{u.user_id} · {u.eventos} evento(s) · FS máx {u.fs_max}</p>
                ))}
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">🏬 Lojas em análise</h3>
                {!(rank.lojas_em_analise || []).length ? <p className="text-xs text-zinc-400">Nenhuma loja em análise.</p> : rank.lojas_em_analise.map((l: any) => (
                  <p key={l.merchant_id} className="mb-1 truncate text-[11px] font-semibold text-zinc-600">{l.merchant_id} · {l.eventos} evento(s)</p>
                ))}
              </div>
              <Barras titulo="📌 Tipos de fraude" dados={rank.tipos} />
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Fraud Detection v1.0 · ORION-AI-41 · FS/FR/FT/FC + FPR/FDR/ELP · 17 detectores com evidência ·
          política fraud_politica_v1 (recomenda, nunca bloqueia) · trilha imutável + rollback compensatório · tick */2
        </p>
      </div>
    </div>
  );
}
