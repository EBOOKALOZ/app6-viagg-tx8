/**
 * /admin/orion-creative-layout — ORION Creative Layout AI (ORION-AI-63)
 *
 * Designer inteligente de layouts (ORION Design Ecosystem). Transforma um TEMPLATE
 * (Smart Template AI-62) + IDENTIDADE (Brand Identity AI-61) + BRIEF em uma
 * COMPOSICAO POSICIONADA profissional: hierarquia, grid, terços, sem sobreposicao,
 * contraste WCAG, Layout Score e variantes responsivas. Nunca aleatorio.
 * Fonte unica: RPC clay_dashboard(); preview por clay_preview(id).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutTemplate, Loader2, Gauge, Image as ImageIcon, ShieldCheck,
  Layers, Boxes, BarChart3, Plug, Sparkles,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const scoreColor = (s: number) => s >= 85 ? "text-emerald-300" : s >= 70 ? "text-lime-300" : s >= 50 ? "text-amber-300" : "text-red-300";
const scoreText = (s: number) => s >= 85 ? "text-emerald-600" : s >= 70 ? "text-lime-600" : s >= 50 ? "text-amber-600" : "text-red-600";

type Aba = "preview" | "layouts" | "qualidade" | "blueprints" | "componentes" | "metricas" | "integracoes";

// ── Canvas: renderiza a composicao (elementos posicionados) em escala ──
function CanvasPreview({ spec, maxW = 340 }: { spec: any; maxW?: number }) {
  if (!spec?.canvas) return <div className="text-xs text-zinc-400">Sem preview.</div>;
  const cw = spec.canvas.w || 1080, ch = spec.canvas.h || 1080;
  const scale = maxW / cw;
  const els = (spec.elementos || []) as any[];
  return (
    <div className="relative overflow-hidden rounded-xl bg-white shadow ring-1 ring-zinc-300"
      style={{ width: cw * scale, height: ch * scale }}>
      {els.map((el, i) => {
        const t = el.tipografia || {};
        const isBg = t.background === true;
        const st: React.CSSProperties = {
          position: "absolute", left: el.x * scale, top: el.y * scale,
          width: el.w * scale, height: el.h * scale, overflow: "hidden",
        };
        const fs = Math.max(7, Math.round((t.size || 16) * scale));
        if (el.tipo === "media") {
          return (
            <div key={i} style={{ ...st, zIndex: el.z }}
              className={`flex items-center justify-center ${isBg ? "" : "rounded-md border border-dashed"}`}
              // eslint-disable-next-line
              >
              <div style={{ position: "absolute", inset: 0, background: isBg ? "linear-gradient(135deg,#e9d5ff,#fbcfe8)" : "#f1f5f9" }} />
              <span style={{ position: "relative", fontSize: Math.max(8, fs * 0.7) }} className="font-bold text-zinc-400">
                {el.componente === "logo" ? "LOGO" : el.componente === "qrcode" ? "QR" : "IMAGEM"}
              </span>
            </div>
          );
        }
        if (el.tipo === "cta" || el.tipo === "badge") {
          return (
            <div key={i} style={{ ...st, zIndex: el.z, background: t.bg || "#111827", color: t.fg || "#fff", fontSize: fs, borderRadius: el.tipo === "cta" ? 8 * scale + 3 : 999 }}
              className="flex items-center justify-center px-1 font-black leading-none text-center">
              <span className="truncate">{el.texto}</span>
            </div>
          );
        }
        // texto / preco / contato
        return (
          <div key={i} style={{ ...st, zIndex: el.z, color: el.cor || "#111827", fontSize: fs, textShadow: t.scrim ? "0 1px 4px rgba(0,0,0,.7)" : "none" }}
            className={`flex items-center ${el.tipo === "preco" ? "font-black" : "font-semibold"} leading-tight`}>
            <span className="line-clamp-2">{el.texto}</span>
          </div>
        );
      })}
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: any }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{ok ? "✓" : "✕"} {children}</span>;
}

export default function AdminOrionCreativeLayout() {
  const [aba, setAba] = useState<Aba>("preview");
  const [sel, setSel] = useState<any>(null);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-clay"], queryFn: () => rpc("clay_dashboard"), refetchInterval: 60000,
  });

  const kpi = dash?.kpis || {};
  const recentes = (dash?.recentes || []) as any[];
  const dist = dash?.distribuicao_score || {};
  const blueprints = (dash?.blueprints || []) as any[];
  const componentes = (dash?.componentes || []) as any[];
  const metricas = (dash?.metricas || []) as any[];
  const integ = dash?.integracoes || {};
  const preview = sel || dash?.ultimo_preview || {};
  const val = preview?.validacao?.checagens || {};
  const brk = preview?.score_breakdown?.sinais || {};

  const abrir = async (id: number) => {
    try { const p = await rpc("clay_preview", { p_layout: id }); setSel(p); setAba("preview"); } catch { /* noop */ }
  };

  const TABS: [Aba, any, string][] = [
    ["preview", ImageIcon, "Preview"], ["layouts", Layers, "Layouts"], ["qualidade", ShieldCheck, "Qualidade & Score"],
    ["blueprints", Boxes, "Blueprints"], ["componentes", LayoutTemplate, "Componentes"], ["metricas", BarChart3, "Métricas"],
    ["integracoes", Plug, "Integrações"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-fuchsia-50/40 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#2a0e2e] via-[#3d1440] to-[#2a0e2e] p-6 text-white shadow-xl ring-1 ring-fuchsia-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-500/10 ring-1 ring-fuchsia-500/30">
              <LayoutTemplate className="h-8 w-8 text-fuchsia-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">Creative Layout Center</h1>
              <p className="text-sm text-fuchsia-200/70">
                ORION-AI-63 · designer inteligente · template (AI-62) + identidade (AI-61) + brief → composição · nunca aleatório
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-fuchsia-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-200/70">Score médio</p>
              <p className={`text-4xl font-black ${scoreColor(Math.round(kpi.score_medio ?? 0))}`}>{kpi.score_medio ?? "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{kpi.aprovados_pct ?? "—"}% aprovados</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Layouts", kpi.layouts_total], ["Hoje", kpi.layouts_hoje], ["Exportados", kpi.exportados],
              ["Templates (62)", kpi.templates_ai62], ["Formatos (62)", kpi.formatos_ai62], ["Aprovados", (kpi.aprovados_pct ?? "—") + "%"]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-fuchsia-200/60">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold ${aba === k ? "bg-[#3d1440] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" /></div>}

        {/* PREVIEW */}
        {aba === "preview" && !isLoading && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <CanvasPreview spec={preview} />
              <p className="text-[11px] text-zinc-400">{preview?.canvas?.formato} · {preview?.canvas?.familia} · {preview?.canvas?.w}×{preview?.canvas?.h}</p>
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-zinc-700">Layout #{preview?.layout ?? "—"}</p>
                  <p className={`text-3xl font-black ${scoreText(preview?.score ?? 0)}`}>{preview?.score ?? "—"}<span className="text-sm text-zinc-400">/100</span></p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge ok={val.sem_sobreposicao}>sem sobreposição</Badge>
                  <Badge ok={val.contraste_wcag_ok}>contraste WCAG</Badge>
                  <Badge ok={val.fonte_minima_ok}>fonte mínima</Badge>
                  <Badge ok={val.area_toque_cta_ok}>área de toque CTA</Badge>
                </div>
              </div>
              <div className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50 p-4">
                <p className="text-sm font-black text-fuchsia-800">🎨 Composição determinística</p>
                <ul className="mt-1 space-y-0.5 text-xs text-fuchsia-900/80">
                  <li>• Nunca aleatório — segue hierarquia, grid, terços e safe areas.</li>
                  <li>• Componentes vêm do <b>template escolhido (Smart Template AI-62)</b>.</li>
                  <li>• Cores/contraste da <b>Brand Identity AI-61</b> (WCAG real).</li>
                  <li>• Render PNG/PDF final = Edge Function (declarado).</li>
                </ul>
              </div>
              {recentes.length > 0 && (
                <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
                  <p className="mb-1 text-xs font-bold text-zinc-500">Abrir outro layout:</p>
                  <div className="flex flex-wrap gap-1">
                    {recentes.slice(0, 8).map((r) => (
                      <button key={r.id} onClick={() => abrir(r.id)}
                        className="rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-600 hover:bg-fuchsia-100 hover:text-fuchsia-700">
                        #{r.id} · {r.formato} · {r.score}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* LAYOUTS */}
        {aba === "layouts" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-4">
              {[["Ótimo ≥85", dist.otimo, "text-emerald-600"], ["Bom ≥70", dist.bom, "text-lime-600"], ["Regular ≥50", dist.regular, "text-amber-600"], ["Baixo <50", dist.baixo, "text-red-600"]].map(([l, v, c]: any) => (
                <div key={l} className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{l}</p>
                  <p className={`text-2xl font-black ${c}`}>{v ?? 0}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-zinc-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-400">
                  <tr><th className="p-2">#</th><th className="p-2">Formato</th><th className="p-2">Família</th><th className="p-2">Objetivo</th><th className="p-2">Score</th><th className="p-2">Status</th><th className="p-2"></th></tr>
                </thead>
                <tbody>
                  {recentes.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100">
                      <td className="p-2 font-bold text-zinc-500">{r.id}</td>
                      <td className="p-2 text-zinc-700">{r.formato}</td>
                      <td className="p-2 text-zinc-500">{r.familia}</td>
                      <td className="p-2 text-zinc-500">{r.objetivo || "—"}</td>
                      <td className={`p-2 font-black ${scoreText(r.score)}`}>{r.score}</td>
                      <td className="p-2"><span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">{r.status}</span></td>
                      <td className="p-2"><button onClick={() => abrir(r.id)} className="rounded-lg bg-fuchsia-600 px-2 py-1 text-[10px] font-bold text-white">ver</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* QUALIDADE & SCORE */}
        {aba === "qualidade" && !isLoading && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="text-sm font-black text-zinc-700">Breakdown do Layout Score (layout #{preview?.layout})</p>
              <div className="mt-2 space-y-2">
                {[["Conversão", preview?.score_breakdown?.conversao, 0.30], ["Organização", preview?.score_breakdown?.organizacao, 0.20],
                  ["Legibilidade", preview?.score_breakdown?.legibilidade, 0.15], ["Hierarquia", preview?.score_breakdown?.hierarquia, 0.15],
                  ["Acessibilidade", preview?.score_breakdown?.acessibilidade, 0.12], ["Balanceamento", preview?.score_breakdown?.balanceamento, 0.08]].map(([l, v, w]: any) => (
                  <div key={l}>
                    <div className="flex justify-between text-[11px] text-zinc-500"><span>{l} <span className="text-zinc-300">·{Math.round(w * 100)}%</span></span><span className="font-bold">{v ?? "—"}</span></div>
                    <div className="h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-fuchsia-500" style={{ width: `${v ?? 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="text-sm font-black text-zinc-700">Sinais & Acessibilidade</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge ok={!!brk.titulo}>título</Badge><Badge ok={!!brk.preco}>preço</Badge>
                <Badge ok={!!brk.cta}>CTA</Badge><Badge ok={!!brk.imagem}>imagem</Badge><Badge ok={!!brk.badge}>selo</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-zinc-50 p-2"><p className="text-[10px] uppercase text-zinc-400">Sobreposição texto</p><p className="text-lg font-black text-zinc-700">{brk.sobreposicao_texto ?? "—"}</p></div>
                <div className="rounded-xl bg-zinc-50 p-2"><p className="text-[10px] uppercase text-zinc-400">Whitespace</p><p className="text-lg font-black text-zinc-700">{brk.whitespace ?? "—"}</p></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                <Badge ok={val.sem_sobreposicao}>sem sobreposição</Badge>
                <Badge ok={val.contraste_wcag_ok}>contraste WCAG</Badge>
                <Badge ok={val.fonte_minima_ok}>fonte mínima</Badge>
                <Badge ok={val.area_toque_cta_ok}>toque CTA</Badge>
              </div>
            </div>
          </div>
        )}

        {/* BLUEPRINTS */}
        {aba === "blueprints" && !isLoading && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {blueprints.map((b) => (
              <div key={b.template_key} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <p className="text-sm font-black text-zinc-800 capitalize">{b.familia}</p>
                <p className="text-[11px] text-zinc-400">{b.template_key}</p>
                <p className="mt-2 text-2xl font-black text-fuchsia-600">{b.slots}<span className="text-xs text-zinc-400"> slots</span></p>
              </div>
            ))}
          </div>
        )}

        {/* COMPONENTES */}
        {aba === "componentes" && !isLoading && (
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-zinc-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-400"><tr><th className="p-2">Componente</th><th className="p-2">Tipo</th><th className="p-2">Hierarquia</th><th className="p-2">Tam. rel.</th><th className="p-2">Descrição</th></tr></thead>
              <tbody>
                {componentes.map((c) => (
                  <tr key={c.componente} className="border-t border-zinc-100">
                    <td className="p-2 font-bold text-zinc-700">{c.componente}</td>
                    <td className="p-2"><span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700">{c.tipo}</span></td>
                    <td className="p-2 text-zinc-500">{c.hierarquia_peso}</td>
                    <td className="p-2 text-zinc-500">{c.tamanho_rel}</td>
                    <td className="p-2 text-zinc-500">{c.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* METRICAS */}
        {aba === "metricas" && !isLoading && (
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-zinc-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-400"><tr><th className="p-2">Dia</th><th className="p-2">Criados</th><th className="p-2">Usados</th><th className="p-2">Exportados</th><th className="p-2">Score médio</th><th className="p-2">Aprovados %</th></tr></thead>
              <tbody>
                {metricas.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-zinc-400">Sem métricas ainda.</td></tr>}
                {metricas.map((m) => (
                  <tr key={m.dia} className="border-t border-zinc-100">
                    <td className="p-2 font-bold text-zinc-600">{m.dia}</td>
                    <td className="p-2 text-zinc-500">{m.criados}</td>
                    <td className="p-2 text-zinc-500">{m.usados}</td>
                    <td className="p-2 text-zinc-500">{m.exportados}</td>
                    <td className="p-2 font-bold text-zinc-700">{m.score_medio ?? "—"}</td>
                    <td className="p-2 text-zinc-500">{m.aprovados_pct ?? "—"}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* INTEGRACOES */}
        {aba === "integracoes" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <p className="text-sm font-black text-zinc-700 flex items-center gap-2"><Sparkles className="h-4 w-4 text-fuchsia-500" /> Ecossistema de Design</p>
                <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                  <li className="flex items-center gap-2"><Badge ok={!!integ.smart_template_ai62}>Smart Template AI-62</Badge> templates + formatos</li>
                  <li className="flex items-center gap-2"><Badge ok={!!integ.brand_identity_ai61}>Brand Identity AI-61</Badge> paleta + contraste WCAG</li>
                  <li className="flex items-center gap-2"><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Edge</span> render PNG/PDF: {String(integ.render_png)}</li>
                </ul>
              </div>
              <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <p className="text-sm font-black text-zinc-700">Garantias</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge ok>nunca aleatório</Badge>
                  <Badge ok>WCAG validado</Badge>
                  <Badge ok>sem sobreposição de texto</Badge>
                </div>
                <p className="mt-2 text-[11px] text-zinc-400">Atualizado em {dash?.atualizado_em || "—"}</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
