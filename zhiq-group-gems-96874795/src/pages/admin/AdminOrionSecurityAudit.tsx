/**
 * /admin/orion-security-audit — ORION Security Audit AI (ORION-AI-44)
 *
 * 3a camada do ORION Security Ecosystem. Audita continuamente a postura de
 * seguranca REAL da plataforma (RLS, grants, funcoes, cron, identidade,
 * APIs, postura AI-40/41) contra baseline aprovada + requisitos de
 * compliance. NUNCA modifica o ambiente: observa, evidencia, recomenda.
 * Findings fecham SOZINHOS quando a evidencia some (FRR real). Scores
 * SAS/COS/CIS/ACS explicaveis; lacunas declaradas, nunca inventadas.
 *
 * Namespace proprio (orion_secaudit_*) — nao colide com AI-24/40/OCE.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  ClipboardCheck, Loader2, Sparkles, Database, Server, Clock3, Scale,
  ListChecks, Play, RotateCcw, CheckCircle2,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const CRIT: Record<string, string> = {
  critica: "bg-red-700 text-white", alta: "bg-red-600 text-white",
  media: "bg-amber-100 text-amber-700", baixa: "bg-sky-100 text-sky-700",
};
const STATUS_CAT: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-700", atencao: "bg-amber-100 text-amber-700", critico: "bg-red-100 text-red-700",
};
const COMPLIANCE: Record<string, string> = {
  conforme: "bg-emerald-100 text-emerald-700", nao_conforme: "bg-red-100 text-red-700", declarado: "bg-slate-100 text-slate-500",
};
const scoreCor = (s: number) => (s >= 80 ? "text-emerald-300" : s >= 60 ? "text-amber-300" : "text-red-300");

type Aba = "visao" | "banco" | "infra" | "cron" | "compliance" | "findings";

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>
    {children}
  </div>
);

const Mini = ({ l, v }: { l: string; v: any }) => (
  <div className="rounded-2xl bg-slate-50 p-2 text-center">
    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
    <p className="text-base font-black text-zinc-800">{String(v ?? 0)}</p>
  </div>
);

export default function AdminOrionSecurityAudit() {
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-security-audit"], queryFn: () => rpc("secaudit_dashboard"), refetchInterval: 60000,
  });

  const scores = dash?.scores || {};
  const kpis = dash?.kpis || {};
  const audits = (dash?.audits || []) as any[];
  const findings = (dash?.findings || []) as any[];
  const compliance = (dash?.compliance || []) as any[];
  const baseline = (dash?.baseline || []) as any[];
  const history = (dash?.history || []) as any[];
  const abertos = findings.filter((f) => !f.corrigido);
  const corrigidos = findings.filter((f) => f.corrigido);
  const audit = (cat: string) => audits.find((a) => a.categoria === cat)?.auditoria || {};

  const narrar = async (promptKey: string, rotulo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("secaudit_summary");
      const r = await orionAiText("security_audit", `Pedido: ${rotulo}\nAuditoria real: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponivel (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const rodarAgora = async () => {
    setOcupado(true); setMsg("");
    try {
      const r = await rpc("run_security_audit", { p_trace: `painel_${Date.now()}` });
      setMsg(`✓ Auditoria executada: SAS ${r.sas}, ${r.categorias} categorias, ${r.findings_ativos} findings ativos.`);
      refetch();
    } catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setOcupado(false); }
  };

  const resolver = async (id: number) => {
    setOcupado(true); setMsg("");
    try { await rpc("secaudit_resolve_finding", { p_finding_id: id, p_nota: "resolvido pelo painel" }); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setOcupado(false); }
  };

  const reabrir = async (id: number) => {
    setOcupado(true); setMsg("");
    try { await rpc("secaudit_reopen_finding", { p_finding_id: id }); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setOcupado(false); }
  };

  const TABS: [Aba, any, string][] = [
    ["visao", Sparkles, "Visao Geral"], ["banco", Database, "Banco"],
    ["infra", Server, "APIs & Edge"], ["cron", Clock3, "Cron"],
    ["compliance", Scale, "Compliance & Baseline"],
    ["findings", ListChecks, `Findings${abertos.length ? ` (${abertos.length})` : ""}`],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0c0a1f] via-[#312e81] to-[#0c0a1f] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <ClipboardCheck className="h-8 w-8 text-indigo-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">ORION Security Audit AI</h1>
                <span className="rounded-full bg-indigo-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-indigo-300/40">Audit</span>
              </div>
              <p className="text-sm text-indigo-200/80">
                ORION-AI-44 · auditoria continua de postura e conformidade · observa/evidencia/recomenda, NUNCA altera o ambiente
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/70">Audit Score</p>
              <p className={`text-3xl font-black ${scoreCor(Number(scores.sas ?? 0))}`}>{scores.sas ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Compliance (COS)", scores.cos], ["Integridade (CIS)", scores.cis], ["Confianca (ACS)", scores.acs],
              ["Resolucao (FRR)", `${kpis.frr ?? 0}%`], ["Cobertura (ACI)", `${kpis.aci ?? 0}%`],
              ["Criticas abertas", kpis.abertos?.critica]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-indigo-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS + acao */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#312e81] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button onClick={rodarAgora} disabled={ocupado}
            className="ml-auto flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-black text-white shadow hover:bg-indigo-700 disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Auditar agora
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] font-bold text-zinc-600">{msg}</p>}

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>}

        {/* VISAO GERAL */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["secaudit.explain_audit", "Explicar auditoria"], ["secaudit.explain_failures", "Explicar falhas"],
                  ["secaudit.prioritize_fixes", "Priorizar correcoes"], ["secaudit.explain_risk", "Explicar risco"],
                  ["secaudit.executive_report", "Relatorio executivo"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l)} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-indigo-200 hover:bg-indigo-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-indigo-100">{narrativa}</p>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Categorias auditadas (hoje)">
                {audits.map((a: any) => (
                  <div key={a.categoria} className="mb-1.5 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_CAT[a.status] || ""}`}>{a.status}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-700">{a.categoria}</span>
                    <span className="text-sm font-black text-zinc-800">{a.score}</span>
                  </div>
                ))}
                <p className="mt-2 text-[10px] text-zinc-400">{scores.formula}</p>
              </Card>
              <Card title="Identidade & postura">
                <div className="grid grid-cols-2 gap-2">
                  <Mini l="Admins" v={audit("identidade").admins} />
                  <Mini l="MFA verificados" v={audit("identidade").mfa_fatores_verificados} />
                  <Mini l="Sessoes 30d+" v={audit("identidade").sessoes_mais_30d} />
                  <Mini l="Eventos criticos abertos" v={audit("postura").eventos_criticos_abertos} />
                  <Mini l="Politicas frouxas (AI-40)" v={audit("postura").politicas_criticas_frouxas} />
                  <Mini l="Bloqueios ativos" v={audit("postura").bloqueios_ativos} />
                </div>
              </Card>
            </div>

            <Card title="Evolucao do Audit Score">
              {!history.length ? <p className="text-xs text-zinc-400">Sem historico.</p> : (
                <div className="space-y-1">
                  {history.slice(0, 10).map((h: any) => (
                    <div key={h.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">{h.auditoria}</span>
                      <span className="text-zinc-500">{String(h.created_at).slice(0, 16).replace("T", " ")}</span>
                      <span className="ml-auto font-black text-zinc-700">{h.score_anterior ?? "—"} → {h.score_atual}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* BANCO */}
        {aba === "banco" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card title="RLS & Policies">
              <div className="grid grid-cols-2 gap-2">
                <Mini l="Tabelas" v={audit("banco_rls").tabelas_total} />
                <Mini l="Sem RLS" v={audit("banco_rls").sem_rls} />
                <Mini l="Sensiveis sem RLS" v={audit("banco_rls").sensiveis_sem_rls} />
                <Mini l="RLS sem policy" v={audit("banco_rls").rls_sem_policy} />
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">Cobertura RLS: {audit("banco_rls").cobertura_rls_pct}%</p>
            </Card>
            <Card title="Funcoes & Roles">
              <div className="grid grid-cols-2 gap-2">
                <Mini l="DEFINER total" v={audit("banco_funcoes").definer_total} />
                <Mini l="Sem search_path" v={audit("banco_funcoes").definer_sem_search_path} />
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">SECURITY DEFINER sem search_path fixo = risco de hijack de schema.</p>
            </Card>
            <Card title="Grants (privilegios excessivos)">
              <div className="grid grid-cols-2 gap-2">
                <Mini l="Escrita p/ anon" v={audit("banco_grants").anon_grants_escrita} />
                <Mini l="TRUNCATE p/ authenticated" v={audit("banco_grants").authenticated_truncate} />
              </div>
              <p className="mt-2 text-[10px] text-amber-600">{audit("banco_grants").nota}</p>
            </Card>
            <Card title="Objetos & Indices">
              <div className="grid grid-cols-2 gap-2">
                <Mini l="Objetos tmp/debug" v={(audit("banco_objetos").tabelas_tmp_debug ?? 0) + (audit("banco_objetos").views_tmp_debug ?? 0)} />
                <Mini l="Grandes c/ seq scan" v={audit("banco_objetos").tabelas_grandes_seq_scan} />
              </div>
            </Card>
          </div>
        )}

        {/* APIS & EDGE */}
        {aba === "infra" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card title="APIs (PostgREST / Gateway)">
              <div className="grid grid-cols-2 gap-2">
                <Mini l="Funcoes expostas a anon" v={audit("apis").funcoes_expostas_anon} />
                <Mini l="Client errors 24h" v={audit("apis").client_errors_24h} />
                <Mini l="Gateway erros 24h" v={audit("apis").gateway_erros_24h} />
                <Mini l="Rate limit IA" v={audit("apis").rate_limit_ia_configurado ? "sim" : "nao"} />
              </div>
              <p className="mt-2 text-[10px] text-amber-600">{audit("apis").nota_declarada}</p>
            </Card>
            <Card title="Edge Functions (visibilidade via banco)">
              <div className="grid grid-cols-2 gap-2">
                <Mini l="Gateway chamadas 24h" v={audit("edge").gateway_chamadas_24h} />
                <Mini l="Latencia media (ms)" v={audit("edge").gateway_latencia_media_ms} />
                <Mini l="Gateway vivo" v={audit("edge").gateway_vivo ? "sim" : "nao"} />
              </div>
              <p className="mt-2 text-[10px] text-amber-600">{audit("edge").nota_declarada}</p>
            </Card>
          </div>
        )}

        {/* CRON */}
        {aba === "cron" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title="Cron Jobs (pg_cron)">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Mini l="Total" v={audit("cron").jobs_total} />
                <Mini l="Inativos" v={audit("cron").jobs_inativos} />
                <Mini l="Falhas 24h" v={audit("cron").falhas_24h_jobs_ativos} />
                <Mini l="Falhas orfas" v={audit("cron").falhas_24h_orfas} />
                <Mini l="Parados 2h+" v={audit("cron").jobs_sem_execucao_2h} />
              </div>
              {audit("cron").falhas_por_job && Object.keys(audit("cron").falhas_por_job).length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-[11px] font-bold text-zinc-500">Falhas por job (24h):</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(audit("cron").falhas_por_job as Record<string, any>).map(([k, v]) => (
                      <span key={k} className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 ring-1 ring-red-100">{k}: {String(v)}</span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* COMPLIANCE & BASELINE */}
        {aba === "compliance" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card title="Requisitos de conformidade">
              {compliance.map((c: any) => (
                <div key={c.requisito} className="mb-2 rounded-2xl bg-slate-50 p-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${COMPLIANCE[c.status] || ""}`}>{c.status}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">{c.requisito}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-400">verificado {String(c.ultima_verificacao).slice(0, 16).replace("T", " ")}</p>
                </div>
              ))}
            </Card>
            <Card title="Baseline aprovada vs encontrada">
              {baseline.map((b: any) => (
                <div key={b.configuracao} className="mb-2 rounded-2xl bg-slate-50 p-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${b.divergente ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {b.divergente ? "divergente" : "ok"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">{b.configuracao}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500">esperado <b>{b.valor_esperado}</b> · encontrado <b>{b.valor_encontrado ?? "—"}</b></p>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* FINDINGS */}
        {aba === "findings" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title={`Abertos (${abertos.length})`}>
              {!abertos.length ? <p className="py-6 text-center text-sm text-zinc-400">🛡️ Nenhum finding aberto.</p> : abertos.map((f: any) => (
                <div key={f.finding_id} className="mb-2 rounded-2xl border border-zinc-100 bg-slate-50/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${CRIT[f.criticidade] || ""}`}>{f.criticidade}</span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{f.categoria}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{f.componente}</span>
                    <button onClick={() => resolver(f.finding_id)} disabled={ocupado}
                      className="ml-auto flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                      <CheckCircle2 className="h-3 w-3" /> Resolver
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-zinc-700">{f.descricao}</p>
                  <p className="mt-0.5 text-[11px] text-emerald-700">➜ {f.recomendacao}</p>
                </div>
              ))}
            </Card>
            <Card title={`Corrigidos (${corrigidos.length})`}>
              {!corrigidos.length ? <p className="text-xs text-zinc-400">Nenhum ainda.</p> : corrigidos.map((f: any) => (
                <div key={f.finding_id} className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">corrigido</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-600">{f.descricao}</span>
                  <span className="text-[10px] text-zinc-400">{f.resolvido_por === "auditoria" ? "auto (evidencia sumiu)" : "manual"}</span>
                  <button onClick={() => reabrir(f.finding_id)} disabled={ocupado}
                    className="flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-600 hover:bg-zinc-300 disabled:opacity-50">
                    <RotateCcw className="h-3 w-3" /> Reabrir
                  </button>
                </div>
              ))}
            </Card>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Security Audit AI v1.0 · ORION-AI-44 · audita, NUNCA altera · SAS/COS/CIS/ACS + FRR/ACI · baseline + compliance ·
          findings com evidencia e auto-close · tick 15 min + edge security-audit-engine · lacunas declaradas · IA so via Gateway
        </p>
      </div>
    </div>
  );
}
