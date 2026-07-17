/**
 * /admin/orion-cyber-defense — ORION Cyber Defense AI (ORION-AI-40)
 *
 * Primeira camada do ORION Security Ecosystem. Monitora a infra, detecta
 * comportamento malicioso (web/auth/API/IA/bots/DDoS/fraude), correlaciona
 * eventos e RECOMENDA resposta proporcional — sempre com EVIDENCIA e sob
 * POLITICA. Nunca bloqueia sozinho: acoes criticas exigem aprovacao e sao
 * reversiveis (rollback). Read-only no painel; IA via Gateway + Prompt Registry.
 *
 * Namespace proprio (orion_cyber_*) — nao colide com o AI-24 Security AI.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  ShieldBan, Loader2, Sparkles, Activity, Globe, Network, Users, Server, Bot,
  Gauge, ListChecks,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const SEV: Record<string, string> = {
  critica: "bg-red-700 text-white", alta: "bg-red-600 text-white",
  media: "bg-amber-100 text-amber-700", baixa: "bg-sky-100 text-sky-700",
};
const PRI = SEV;

type Aba = "visao" | "ataques" | "tempo_real" | "mapa" | "ip" | "usuarios" | "apis" | "ia";

const Stat = ({ l, v }: { l: string; v: any }) => (
  <div className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
    <p className="truncate text-[10px] font-bold uppercase tracking-wider text-red-200/70">{l}</p>
    <p className="text-lg font-black">{String(v ?? 0)}</p>
  </div>
);

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>
    {children}
  </div>
);

const Chips = ({ obj }: { obj: Record<string, any> }) => (
  <div className="flex flex-wrap gap-1">
    {Object.entries(obj || {}).map(([k, v]) => (
      <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k}: {String(v)}</span>
    ))}
    {!Object.keys(obj || {}).length && <span className="text-[11px] text-zinc-400">Sem registros.</span>}
  </div>
);

export default function AdminOrionCyberDefense() {
  const [aba, setAba] = useState<Aba>("visao");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-cyber-defense"], queryFn: () => rpc("cyber_dashboard"), refetchInterval: 45000,
  });

  const ov = dash?.overview || {};
  const scores = ov?.scores || {};
  const attacks = dash?.attacks || {};
  const realtime = dash?.realtime || {};
  const mapa = dash?.map || {};
  const ip = dash?.ip || {};
  const users = dash?.users || {};
  const apis = dash?.apis || {};
  const aiThreats = dash?.ai_threats || {};
  const kpis = dash?.kpis || {};
  const alerts = (dash?.alerts || []) as any[];

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("cyber_summary");
      const r = await orionAiText("cyber_defense", `Tipo: ${tipo}\nSinais reais de seguranca: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 600 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponivel (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const scoreCards: [string, any][] = [
    ["Threat Score", scores.ts], ["Risk Score", scores.rs],
    ["Security Health", scores.sh], ["Attack Confidence", scores.ac],
    ["Ataques hoje", ov.ataques_hoje], ["Disponibilidade", `${scores.disponibilidade ?? 100}%`],
  ];

  const TABS: [Aba, any, string][] = [
    ["visao", Sparkles, "Visao Geral"], ["ataques", ShieldBan, "Ataques"],
    ["tempo_real", Activity, `Tempo Real${(realtime.ultimos || []).length ? ` (${(realtime.ultimos || []).length})` : ""}`],
    ["mapa", Globe, "Mapa"], ["ip", Network, "IP Intelligence"],
    ["usuarios", Users, "Usuarios"], ["apis", Server, "APIs"], ["ia", Bot, "IA"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#1a0505] via-[#7f1d1d] to-[#1a0505] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <ShieldBan className="h-8 w-8 text-red-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">ORION Cyber Defense AI</h1>
                <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-red-300/40">Security</span>
              </div>
              <p className="text-sm text-red-200/80">
                ORION-AI-40 · deteccao e resposta inicial · base do Security Ecosystem · detecta/correlaciona/recomenda, nunca bloqueia sozinho
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-200/70">Threat Score</p>
              <p className="text-3xl font-black">{scores.ts ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {scoreCards.map(([l, v]) => <Stat key={l} l={l} v={v} />)}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#7f1d1d] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-red-500" /></div>}

        {/* VISAO GERAL */}
        {aba === "visao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-red-200 bg-red-50/40 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["cyber.explain_attack", "Ataques"], ["cyber.explain_risk", "Risco"],
                  ["cyber.suggest_mitigation", "Mitigacao"], ["cyber.executive_report", "Relatorio executivo"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-red-200 hover:bg-red-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-red-100">{narrativa}</p>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Scores de seguranca (janela 24h)">
                <div className="grid grid-cols-2 gap-2">
                  {[["Threat (TS)", scores.ts], ["Risk (RS)", scores.rs], ["Health (SH)", scores.sh], ["Confidence (AC)", scores.ac]].map(([l, v]: any) => (
                    <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                      <p className="text-xl font-black text-zinc-800">{String(v ?? 0)}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-zinc-400">{scores.formula}</p>
              </Card>
              <Card title="Situacao atual">
                <div className="grid grid-cols-2 gap-2">
                  {[["Ataques hoje", ov.ataques_hoje], ["Ataques 24h", ov.ataques_24h], ["Criticos abertos", ov.criticos],
                    ["Alertas abertos", ov.alertas_abertos], ["Bloqueios ativos", ov.bloqueios_ativos], ["Disponibilidade", `${scores.disponibilidade ?? 100}%`]].map(([l, v]: any) => (
                    <div key={l} className="rounded-2xl bg-slate-50 p-2 text-center">
                      <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                      <p className="text-base font-black text-zinc-800">{String(v ?? 0)}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* KPIs */}
            <Card title="KPIs de seguranca">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[["FPR", `${kpis.fpr ?? 0}%`], ["MTTR (min)", kpis.mttr_min], ["Alertas 30d", kpis.alertas_total_30d], ["Resolvidos 30d", kpis.alertas_resolvidos_30d]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-lg font-black text-zinc-800">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">MTTD: {kpis.mttd?.nota}</p>
            </Card>

            {/* ALERTAS */}
            <Card title={`Alertas priorizados${alerts.length ? ` (${alerts.length})` : ""}`}>
              {!alerts.length ? (
                <p className="py-6 text-center text-sm text-zinc-400">🛡️ Nenhum alerta nos ultimos 14 dias. Motor roda a cada 1 min (tick).</p>
              ) : alerts.map((a: any) => (
                <div key={a.id} className="mb-2 rounded-2xl border border-zinc-100 bg-slate-50/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${PRI[a.prioridade] || ""}`}>{a.prioridade}</span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{a.categoria}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{a.entidade}</span>
                    <span className="ml-auto rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black text-white">risco {a.score}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-700">{a.alerta}</p>
                  <p className="mt-0.5 text-[11px] text-emerald-700">➜ {a.recomendacao}</p>
                  <p className="mt-0.5 text-[10px] text-zinc-400">confianca {a.confianca}%{a.resolvido ? " · resolvido" : ""}</p>
                </div>
              ))}
              <p className="mt-1 text-center text-[11px] text-zinc-400">
                O Cyber Defense <b>recomenda</b> — acoes criticas exigem <b>aprovacao</b> e sao <b>reversiveis</b>.
              </p>
            </Card>
          </div>
        )}

        {/* ATAQUES */}
        {aba === "ataques" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Card title="Por tipo (7d)"><Chips obj={attacks.por_tipo} /></Card>
            <Card title="Por severidade (7d)"><Chips obj={attacks.por_severidade} /></Card>
            <Card title="Por modulo (7d)"><Chips obj={attacks.por_modulo} /></Card>
          </div>
        )}

        {/* TEMPO REAL */}
        {aba === "tempo_real" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!(realtime.ultimos || []).length ? (
              <Card title="Linha do tempo"><p className="py-6 text-center text-sm text-zinc-400">Sem eventos recentes.</p></Card>
            ) : (realtime.ultimos as any[]).map((e: any) => (
              <div key={e.event_id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${SEV[e.severidade] || ""}`}>{e.severidade}</span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{e.tipo}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">{e.descricao}</span>
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">{e.score}</span>
                <span className="text-[10px] text-zinc-400">{String(e.timestamp).replace("T", " ").slice(0, 16)}</span>
              </div>
            ))}
          </div>
        )}

        {/* MAPA */}
        {aba === "mapa" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title="Origem por cidade (30d)"><Chips obj={mapa.por_cidade} /></Card>
            <p className="text-[11px] text-amber-600">{mapa.nota_declarada}</p>
          </div>
        )}

        {/* IP INTELLIGENCE */}
        {aba === "ip" && !isLoading && (
          <div className="mt-4 space-y-2">
            <Card title="IPs bloqueados">
              {!(ip.ips_bloqueados || []).length ? (
                <p className="py-4 text-center text-sm text-zinc-400">Nenhum IP bloqueado.</p>
              ) : (ip.ips_bloqueados as any[]).map((b: any, i: number) => (
                <div key={i} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 py-2 text-sm">
                  <span className="font-mono font-bold text-zinc-800">{b.ip}</span>
                  <span className="text-zinc-500">{b.motivo}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${b.ativo ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-400"}`}>{b.ativo ? "ativo" : "revogado"}</span>
                </div>
              ))}
            </Card>
            <p className="text-[11px] text-amber-600">{ip.nota_declarada}</p>
          </div>
        )}

        {/* USUARIOS */}
        {aba === "usuarios" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card title="Autenticacao suspeita">
              <div className="grid grid-cols-3 gap-2">
                {[["Login falhas 24h", users.login_falhas_24h], ["Signups rep. 7d", users.signups_repetidos_7d], ["Recovery 7d", users.recovery_7d]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-base font-black text-zinc-800">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-amber-600">{users.nota_declarada}</p>
            </Card>
            <Card title="Visitantes suspeitos (bot/scraping)">
              {!(users.visitantes_suspeitos || []).length ? (
                <p className="py-4 text-center text-sm text-zinc-400">Nenhum.</p>
              ) : (users.visitantes_suspeitos as any[]).map((v: any, i: number) => (
                <div key={i} className="flex items-center gap-2 border-b border-zinc-50 py-2 text-sm">
                  <span className="font-mono text-xs text-zinc-500">{v.visitor}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-700">{v.desc}</span>
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">{v.score}</span>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* APIs */}
        {aba === "apis" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title="Gateway por modulo (24h)">
              <div className="flex flex-wrap gap-1">
                {Object.entries((apis.gateway_por_modulo || {}) as Record<string, any>).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    {k}: {v.chamadas} ch · {v.erros} err · {v.retries} retry
                  </span>
                ))}
                {!Object.keys(apis.gateway_por_modulo || {}).length && <span className="text-[11px] text-zinc-400">Sem chamadas.</span>}
              </div>
              <p className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500"><Gauge className="h-3.5 w-3.5" /> Latencia media: {apis.latencia_media_ms ?? 0} ms</p>
            </Card>
            <Card title="Endpoints web suspeitos">
              {!(apis.endpoints_web_suspeitos || []).length ? (
                <p className="py-4 text-center text-sm text-zinc-400">Nenhum endpoint suspeito.</p>
              ) : (apis.endpoints_web_suspeitos as any[]).map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-2 border-b border-zinc-50 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700">{e.endpoint}</span>
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">{e.score}</span>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* IA */}
        {aba === "ia" && !isLoading && (
          <div className="mt-4 space-y-4">
            <Card title="Ameacas contra a IA (prompt injection / jailbreak / flood)">
              <p className="mb-2 flex items-center gap-1 text-[11px] text-zinc-500"><ListChecks className="h-3.5 w-3.5" /> Flood de tokens 24h: {aiThreats.tokens_flood_24h ?? 0}</p>
              {!(aiThreats.eventos_ia || []).length ? (
                <p className="py-4 text-center text-sm text-zinc-400">Nenhum evento de IA suspeito.</p>
              ) : (aiThreats.eventos_ia as any[]).map((e: any) => (
                <div key={e.event_id} className="mb-2 rounded-2xl border border-zinc-100 bg-slate-50/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[e.severidade] || ""}`}>{e.severidade}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">{e.descricao}</span>
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">{e.score}</span>
                  </div>
                </div>
              ))}
              <p className="mt-1 text-[11px] text-amber-600">{aiThreats.nota_declarada}</p>
            </Card>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Cyber Defense AI v1.0 · ORION-AI-40 · abre o Security Ecosystem · namespace orion_cyber_* (nao colide com AI-24) ·
          deteccao incremental (tick 1/min + edge cyber-defense-engine) · evidencia obrigatoria · auditoria imutavel · IA so via Gateway
        </p>
      </div>
    </div>
  );
}
