/**
 * /admin/orion-brand — ORION Brand Identity AI (ORION-AI-61)
 *
 * Inteligência de identidade visual. Motor de cor REAL (teoria das cores HSL +
 * contraste WCAG em SQL), tipografia por segmento, consistência por regra, brand
 * book. Análise de imagem (logo/extração de pixel/PDF) = Edge DECLARADO. Abre o
 * ORION Design Ecosystem.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Palette, Loader2, Gauge, Store, Droplet, ShieldCheck, Lightbulb, Settings } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const scoreCol = (s: number) => s >= 75 ? "text-emerald-600" : s >= 50 ? "text-amber-600" : "text-red-600";
const scoreColD = (s: number) => s >= 75 ? "text-emerald-300" : s >= 50 ? "text-amber-300" : "text-red-300";

type Aba = "dashboard" | "marcas" | "paleta" | "consistencia" | "recomendacoes" | "config";

export default function AdminOrionBrand() {
  const [aba, setAba] = useState<Aba>("dashboard");
  const [hex, setHex] = useState("#2563EB");
  const [pal, setPal] = useState<any>(null);
  const [artBrand, setArtBrand] = useState<number | null>(null);
  const [artCores, setArtCores] = useState("#123456");
  const [cons, setCons] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-brand"], queryFn: () => rpc("brand_dashboard"), refetchInterval: 60000,
  });

  const ov = dash?.overview || {};
  const marcas = (dash?.marcas || []) as any[];
  const recs = (dash?.recomendacoes || []) as any[];
  const config = dash?.config || {};
  const stats = (dash?.estatisticas_7d || []) as any[];

  const genPalette = async () => {
    setBusy(true);
    try { setPal(await rpc("generate_palette", { p_hex: hex })); } catch { setPal(null); } finally { setBusy(false); }
  };
  const checkArt = async () => {
    if (!artBrand) return; setBusy(true);
    try {
      const cores = artCores.split(",").map((c) => c.trim()).filter(Boolean);
      setCons(await rpc("brand_consistency", { p_brand: artBrand, p_arte: { cores } }));
    } catch (e: any) { setCons({ erro: e.message }); } finally { setBusy(false); }
  };

  const swatch = (h: string, lbl?: string) => (
    <div className="flex flex-col items-center gap-1">
      <div className="h-12 w-12 rounded-xl ring-1 ring-black/10" style={{ background: h }} />
      <span className="text-[9px] font-mono text-zinc-500">{h}</span>
      {lbl && <span className="text-[9px] font-bold text-zinc-400">{lbl}</span>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#1a1030] via-[#2a1a44] to-[#1a1030] p-6 text-white shadow-xl ring-1 ring-pink-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-500/10 ring-1 ring-pink-500/30">
              <Palette className="h-8 w-8 text-pink-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Brand Identity</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-61 · Design Ecosystem · motor de cor real (HSL + WCAG) · consistência visual · nada inventado
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[["Brand", ov.brand_score_medio], ["Identity", ov.identity_medio], ["Consist.", ov.consistency_media]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl bg-white/5 px-4 py-2 text-center ring-1 ring-pink-500/20">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-pink-200/70">{l}</p>
                  <p className={`text-2xl font-black ${scoreColD(v ?? 0)}`}>{v ?? "—"}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Marcas", ov.marcas], ["Com logo", ov.com_logo], ["Com paleta", ov.com_paleta],
              ["Com fontes", ov.com_fontes], ["Com manual", ov.com_manual], ["Recomendações", ov.recomendacoes]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["dashboard", Gauge, "Dashboard"], ["marcas", Store, `Marcas${marcas.length ? ` (${marcas.length})` : ""}`],
             ["paleta", Droplet, "Gerador de Paleta"], ["consistencia", ShieldCheck, "Consistência"],
             ["recomendacoes", Lightbulb, `Recomendações${recs.length ? ` (${recs.length})` : ""}`], ["config", Settings, "Config"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#2a1a44] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-pink-500" /></div>}

        {/* DASHBOARD */}
        {aba === "dashboard" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Brand Score médio", ov.brand_score_medio, "completude da identidade"],
                ["Identity Score médio", ov.identity_medio, "identidade + consistência + estilo"],
                ["Visual Consistency", ov.consistency_media, "% de cores com contraste WCAG AA"]].map(([l, v, d]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className={`text-3xl font-black ${scoreCol(v ?? 0)}`}>{v ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">{d}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Marcas por estilo visual</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ov.por_estilo || {}).map(([e, n]: any) => (
                  <span key={e} className="rounded-full bg-pink-100 px-3 py-1 text-[11px] font-bold text-pink-700 capitalize">{e}: {n}</span>
                ))}
              </div>
            </div>
            {stats.length > 0 && (
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Evolução (7 dias)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead><tr className="text-zinc-400"><th className="pb-1 pr-3">Dia</th><th className="pr-3">Marcas</th><th className="pr-3">Brand</th><th className="pr-3">Identity</th><th>Consistency</th></tr></thead>
                    <tbody>{stats.map((s: any) => (
                      <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                        <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.marcas}</td><td className="pr-3">{s.brand_score}</td><td className="pr-3">{s.identity}</td><td>{s.consistency}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MARCAS */}
        {aba === "marcas" && !isLoading && (
          <div className="mt-4 space-y-3">
            {marcas.map((m: any) => (
              <div key={m.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  {m.logo ? <img src={m.logo} alt="" className="h-9 w-9 rounded-lg object-cover ring-1 ring-zinc-200" /> : <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400"><Store className="h-4 w-4" /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black text-zinc-800">{m.nome}</p>
                    <p className="text-[10px] text-zinc-400">{m.estilo}{m.cidade ? ` · ${m.cidade}` : ""}{m.categoria ? ` · ${m.categoria}` : ""}</p>
                  </div>
                  <div className="flex gap-2">
                    {(m.paleta || []).map((c: any, i: number) => (
                      <div key={i} className="h-7 w-7 rounded-md ring-1 ring-black/10" title={`${c.papel} ${c.hex}${c.wcag_aa ? " · AA" : ""}`} style={{ background: c.hex }} />
                    ))}
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-black ${scoreCol(m.brand_score)}`}>{m.brand_score}</p>
                    <p className="text-[9px] text-zinc-400">brand score</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(m.fontes || {}).map(([p, f]: any) => (
                    <span key={p} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{p}: {f}</span>
                  ))}
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">consistency {m.consistency}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* GERADOR DE PALETA (motor de cor real) */}
        {aba === "paleta" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <input type="color" value={hex} onChange={(e) => setHex(e.target.value.toUpperCase())} className="h-10 w-14 cursor-pointer rounded-lg" />
                <input value={hex} onChange={(e) => setHex(e.target.value)} className="w-32 rounded-2xl border border-zinc-200 px-3 py-2 font-mono text-sm" />
                <button onClick={genPalette} disabled={busy} className="rounded-2xl bg-pink-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Gerar paleta</button>
                <span className="text-[11px] text-zinc-400">motor real: rotação HSL + contraste WCAG (não é aproximação)</span>
              </div>
              {pal && (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-4">
                    {swatch(pal.primaria?.hex, "primária")}
                    {swatch(pal.secundaria?.hex, "secundária")}
                    {swatch(pal.terciaria?.hex, "terciária")}
                    {swatch(pal.complementar?.hex, "complementar")}
                    {(pal.triade || []).map((t: string, i: number) => swatch(t, `tríade ${i + 1}`))}
                  </div>
                  <div className="h-8 w-full rounded-xl ring-1 ring-black/10" style={{ background: pal.gradiente }} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-3 text-[11px]">
                      <p className="font-black text-zinc-700">Contraste WCAG (primária)</p>
                      <p className="text-zinc-600">vs branco: <b>{pal.primaria?.contraste_branco}:1</b> {pal.acessibilidade?.primaria_texto_branco_AA ? "✅ AA" : "⚠ < 4.5"}</p>
                      <p className="text-zinc-600">vs preto: <b>{pal.primaria?.contraste_preto}:1</b> {pal.acessibilidade?.primaria_texto_preto_AA ? "✅ AA" : "⚠ < 4.5"}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 text-[11px]">
                      <p className="font-black text-zinc-700">Neutras</p>
                      <div className="mt-1 flex gap-1.5">{(pal.neutra || []).map((n: string, i: number) => <div key={i} className="h-6 w-6 rounded ring-1 ring-black/10" style={{ background: n }} />)}</div>
                      <p className="mt-1 text-[10px] text-zinc-400">{pal.primaria?.hsl}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400">{pal.nota}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONSISTÊNCIA */}
        {aba === "consistencia" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Validar arte contra a identidade</h3>
              <div className="flex flex-wrap items-center gap-2">
                <select value={artBrand ?? ""} onChange={(e) => setArtBrand(Number(e.target.value) || null)} className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm">
                  <option value="">Escolha a marca…</option>
                  {marcas.map((m: any) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
                <input value={artCores} onChange={(e) => setArtCores(e.target.value)} placeholder="cores da arte (hex, vírgula)" className="min-w-0 flex-1 rounded-2xl border border-zinc-200 px-3 py-2 font-mono text-sm" />
                <button onClick={checkArt} disabled={busy || !artBrand} className="rounded-2xl bg-pink-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Validar</button>
              </div>
              {cons && (
                <div className={`mt-3 rounded-2xl p-3 text-[12px] font-bold ${cons.aprovado ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                  {cons.erro ? cons.erro : (<>
                    {cons.aprovado ? "✅ Arte aprovada — respeita a identidade visual." : "⛔ Arte reprovada — não pode ser publicada."}
                    {(cons.violacoes || []).length > 0 && (
                      <ul className="mt-1 list-disc pl-5 font-normal">
                        {cons.violacoes.map((v: any, i: number) => <li key={i}>{v.tipo}: <span className="font-mono">{v.valor}</span></li>)}
                      </ul>
                    )}
                    <p className="mt-1 text-[10px] font-normal opacity-70">{cons.nota}</p>
                  </>)}
                </div>
              )}
            </div>
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-[11px] text-zinc-500">Regra da spec: <b>nenhuma arte pode ser aprovada se violar a identidade visual</b>. A validação por metadados (cores/fontes declaradas) roda aqui; a validação por pixel (analisar a imagem final) é Edge Function — DECLARADO.</p>
          </div>
        )}

        {/* RECOMENDAÇÕES */}
        {aba === "recomendacoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!recs.length ? <p className="text-xs text-zinc-400">Nenhuma recomendação aberta. 🎉</p> : recs.map((r: any, k: number) => (
              <div key={k} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-black text-pink-700">P{r.prioridade}</span>
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{r.titulo}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{r.categoria}</span>
                  <span className="text-[11px] text-zinc-500">{r.marca}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-600">{r.descricao}</p>
              </div>
            ))}
          </div>
        )}

        {/* CONFIG */}
        {aba === "config" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                {[["Cron", config.cron], ["Modelo IA", config.modelo_ia], ["Motor de cor", config.motor_cor]].map(([l, v]: any) => (
                  <div key={l}><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-sm font-black text-zinc-700">{String(v ?? "—")}</p></div>
                ))}
              </div>
              <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800">🔒 Funções de dados bloqueadas p/ anon; motor de cor (matemática pura) é utilitário público.</p>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-1 text-sm font-black text-amber-800">Declarado (Edge / futuro — nada inventado)</h3>
              {(config.declarado || []).map((l: string, i: number) => <p key={i} className="text-[11px] font-semibold text-amber-700">· {l}</p>)}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Brand Identity v1.0 · ORION-AI-61 · motor de cor real (HSL + WCAG) · tipografia por segmento · consistência ·
          brand book · abre o Design Ecosystem · análise de imagem/PDF = Edge (declarado) · tick */15
        </p>
      </div>
    </div>
  );
}
