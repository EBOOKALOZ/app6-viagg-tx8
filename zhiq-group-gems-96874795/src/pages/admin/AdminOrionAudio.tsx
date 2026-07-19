/**
 * /admin/orion-audio — ORION Audio Center (ORION-AUDIO-01)
 *
 * Estatísticas do Centro Inteligente de Áudio: preset mais usado, IA Sound
 * ligada/desligada, dispositivos, tempo de uso e guarda anti-distorção.
 * Fonte única: orion_audio_admin_stats() (SECURITY DEFINER, gated mp_is_admin).
 * Convenção ORION: dados reais com _auditoria; lacunas DECLARADAS, nunca inventadas.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AudioLines, Loader2, Sparkles, Timer, Headphones, ShieldAlert,
  Star, Users, FlaskConical, Activity, Radio, Trash2, Plus, Search, Power,
} from "lucide-react";
import { RADIO_CATEGORIES } from "@/lib/radioBrowser";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

/* ── Catálogo de Rádios Curado — admin adiciona/exclui emissoras que faltam ── */
interface CuratedRow {
  station_uuid: string; name: string; stream_url: string; city: string; state: string;
  category: string; frequency: string; tags: string; ativo: boolean; fonte: string;
}
function CuratedCatalogSection() {
  const empty = { name: "", stream_url: "", city: "", state: "", category: "", frequency: "", homepage: "" };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["orion-audio-curated"], queryFn: () => rpc("audio_radio_curated_admin_list", { p_limit: 500 }),
  });
  const list = (Array.isArray(data) ? data : []) as CuratedRow[];

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (!form.name.trim() || !/^https?:\/\/.+/i.test(form.stream_url.trim())) {
      setMsg("Informe o nome e um link de stream válido (http:// ou https://)."); return;
    }
    setBusy(true);
    try {
      await rpc("audio_radio_curated_upsert", { p: {
        name: form.name.trim(), stream_url: form.stream_url.trim(), city: form.city.trim(),
        state: form.state.trim(), category: form.category, frequency: form.frequency.trim(),
        homepage: form.homepage.trim(), tags: [form.category, "curada"].filter(Boolean).join(","),
      } });
      setForm(empty); setMsg("✓ Emissora salva no catálogo (todos os usuários já a encontram).");
      refetch();
    } catch (err) { setMsg("Erro: " + (err as Error).message); }
    finally { setBusy(false); }
  };
  const del = async (uuid: string, nome: string) => {
    if (!window.confirm(`Excluir "${nome}" do catálogo? Isso remove para todos os usuários.`)) return;
    try { await rpc("audio_radio_curated_delete", { p_station_uuid: uuid }); refetch(); }
    catch (err) { setMsg("Erro ao excluir: " + (err as Error).message); }
  };
  const toggle = async (uuid: string, ativo: boolean) => {
    try { await rpc("audio_radio_curated_set_active", { p_station_uuid: uuid, p_ativo: !ativo }); refetch(); }
    catch (err) { setMsg("Erro: " + (err as Error).message); }
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter((r) => `${r.name} ${r.city} ${r.state} ${r.tags} ${r.category}`.toLowerCase().includes(t));
  }, [list, q]);

  return (
    <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-zinc-700">
          <Radio className="h-4 w-4 text-emerald-600" /> Catálogo de rádios (curado)
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-700">{list.length}</span>
        </h2>
        <p className="text-[11px] font-semibold text-zinc-400">Emissoras que a plataforma tem — o usuário só busca e acha.</p>
      </div>

      {/* ADD */}
      <form onSubmit={save} className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-emerald-50/60 p-3 ring-1 ring-emerald-100 md:grid-cols-4">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome (ex.: Rádio Havaí)"
          className="col-span-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400" />
        <input value={form.stream_url} onChange={(e) => setForm({ ...form, stream_url: e.target.value })} placeholder="Link do stream (.mp3/.aac/…)"
          className="col-span-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400" />
        <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Cidade"
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400" />
        <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="UF"
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400" />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400">
          <option value="">Categoria…</option>
          {RADIO_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
        </select>
        <input value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder="Freq. (87.9 FM)"
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400" />
        <button type="submit" disabled={busy}
          className="col-span-2 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50 md:col-span-4">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar ao catálogo
        </button>
      </form>
      {msg && <p className="mb-3 rounded-lg bg-zinc-50 px-3 py-2 text-[12px] font-bold text-zinc-600 ring-1 ring-zinc-200">{msg}</p>}

      {/* SEARCH + LIST */}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar catálogo…"
          className="w-full rounded-lg border border-zinc-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-emerald-400" />
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-emerald-500" /></div>
      ) : (
        <div className="max-h-[420px] space-y-1 overflow-y-auto">
          {filtered.slice(0, 300).map((r) => (
            <div key={r.station_uuid} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ring-1 ${r.ativo ? "bg-white ring-zinc-100" : "bg-zinc-50 ring-zinc-200 opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-zinc-800">{r.name}</p>
                <p className="truncate text-[11px] text-zinc-400">
                  {[r.city, r.state].filter(Boolean).join(" · ")}{r.frequency ? ` · ${r.frequency}` : ""}{r.category ? ` · ${r.category}` : ""}
                  <span className="ml-1 text-zinc-300">({r.fonte})</span>
                </p>
              </div>
              <button onClick={() => toggle(r.station_uuid, r.ativo)} title={r.ativo ? "Desativar" : "Ativar"}
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${r.ativo ? "bg-emerald-100 text-emerald-600" : "bg-zinc-200 text-zinc-500"}`}>
                <Power className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => del(r.station_uuid, r.name)} title="Excluir"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {filtered.length === 0 && <p className="py-6 text-center text-sm font-semibold text-zinc-400">Nenhuma emissora no catálogo ainda.</p>}
          {filtered.length > 300 && <p className="py-2 text-center text-[11px] text-zinc-400">Mostrando 300 de {filtered.length} — use o filtro.</p>}
        </div>
      )}
    </div>
  );
}

const DEVICE_LABELS: Record<string, string> = {
  auto: "Auto", fone: "Fone", bluetooth: "Bluetooth", speaker: "Caixa de Som", carro: "Carro",
};

export default function AdminOrionAudio() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["orion-audio-admin"], queryFn: () => rpc("orion_audio_admin_stats"), refetchInterval: 60000,
  });

  const d = data || {};
  const dispositivos = (d.dispositivos || {}) as Record<string, number>;
  const topPresets = (d.top_presets || []) as { preset: string; aplicacoes: number }[];
  const lacunas = (d._auditoria?.lacunas_declaradas || []) as string[];
  const tempoMin = Number(d.tempo_uso_minutos || 0);
  const tempoFmt = tempoMin >= 60 ? `${Math.floor(tempoMin / 60)}h ${Math.round(tempoMin % 60)}min` : `${Math.round(tempoMin)}min`;
  const iaTotal = Number(d.ia_ligada || 0) + Number(d.ia_desligada || 0);
  const iaPct = iaTotal > 0 ? Math.round((Number(d.ia_ligada || 0) / iaTotal) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#04140d] via-[#0a2f1e] to-[#04140d] p-6 text-white shadow-xl ring-1 ring-emerald-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <AudioLines className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Audio Center</h1>
              <p className="text-sm text-emerald-100/70">
                ORION-AUDIO-01 · Centro Inteligente de Áudio · EQ 10 bandas + AI Sound (análise espectral, <span className="font-bold">sem LLM</span>) · dados por usuário (RLS)
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-emerald-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">AI Sound ligada</p>
              <p className={`text-4xl font-black ${iaPct >= 50 ? "text-emerald-300" : "text-amber-300"}`}>{iaTotal ? `${iaPct}%` : "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{d.usuarios_com_config ?? 0} usuários</p>
            </div>
          </div>
          {lacunas.length > 0 && (
            <div className="mt-4 rounded-2xl bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/20">
              ⓘ Lacunas declaradas (nunca inventadas): {lacunas.join(" · ")}
            </div>
          )}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}
        {error && (
          <div className="mt-6 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-600 ring-1 ring-red-200">
            {String((error as Error).message).includes("mp_is_admin") || String((error as Error).message).includes("admin")
              ? "Acesso negado: este painel exige admin."
              : `Erro: ${(error as Error).message} — a migration 20260719_orion_audio_center.sql foi aplicada?`}
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* KPIs */}
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { icon: Users, label: "Usuários com config", value: d.usuarios_com_config ?? 0, color: "text-emerald-600", bg: "bg-emerald-50" },
                { icon: Sparkles, label: "IA ligada / desligada", value: `${d.ia_ligada ?? 0} / ${d.ia_desligada ?? 0}`, color: "text-violet-600", bg: "bg-violet-50" },
                { icon: Timer, label: "Tempo de uso (telemetria)", value: tempoFmt, color: "text-sky-600", bg: "bg-sky-50" },
                { icon: Star, label: "Presets personalizados", value: d.presets_personalizados ?? 0, color: "text-amber-600", bg: "bg-amber-50" },
                { icon: FlaskConical, label: "Testes de som", value: d.testes_de_som ?? 0, color: "text-cyan-600", bg: "bg-cyan-50" },
                { icon: ShieldAlert, label: "Guarda anti-distorção", value: d.guarda_antidistorcao_acionada ?? 0, color: "text-red-500", bg: "bg-red-50" },
                { icon: Activity, label: "Eventos (30d)", value: d.eventos_30d ?? 0, color: "text-zinc-600", bg: "bg-zinc-100" },
                { icon: Headphones, label: "Perfis de dispositivo", value: Object.keys(dispositivos).length, color: "text-emerald-700", bg: "bg-emerald-50" },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
                  <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl ${bg}`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <p className={`text-2xl font-black ${color}`}>{String(value)}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {/* TOP PRESETS */}
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-zinc-700">
                  <Star className="h-4 w-4 text-amber-500" /> Presets mais usados
                </h2>
                {topPresets.length === 0 ? (
                  <p className="text-sm font-semibold text-zinc-400">Sem aplicações de preset registradas ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {topPresets.map((p, i) => {
                      const max = topPresets[0]?.aplicacoes || 1;
                      return (
                        <div key={p.preset} className="flex items-center gap-3">
                          <span className="w-5 text-right text-xs font-black text-zinc-400">{i + 1}º</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className="truncate text-zinc-800">{p.preset}</span>
                              <span className="text-zinc-500">{p.aplicacoes}×</span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-zinc-100">
                              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ width: `${(p.aplicacoes / max) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* DISPOSITIVOS */}
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-zinc-700">
                  <Headphones className="h-4 w-4 text-emerald-600" /> Perfis de dispositivo configurados
                </h2>
                {Object.keys(dispositivos).length === 0 ? (
                  <p className="text-sm font-semibold text-zinc-400">Nenhuma configuração sincronizada ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(dispositivos).sort((a, b) => b[1] - a[1]).map(([perfil, n]) => {
                      const total = Object.values(dispositivos).reduce((s, x) => s + x, 0) || 1;
                      return (
                        <div key={perfil} className="flex items-center gap-3">
                          <span className="w-24 truncate text-xs font-bold text-zinc-700">{DEVICE_LABELS[perfil] || perfil}</span>
                          <div className="h-1.5 flex-1 rounded-full bg-zinc-100">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${(n / total) * 100}%` }} />
                          </div>
                          <span className="w-8 text-right text-xs font-black text-zinc-500">{n}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-3 text-[10px] font-semibold text-zinc-400">
                  Detecção no navegador é melhor esforço (labels exigem permissão de mídia) — perfil manual sempre disponível.
                </p>
              </div>
            </div>

            {/* CATÁLOGO CURADO — adicionar/excluir emissoras (todos os usuários acham) */}
            <CuratedCatalogSection />

            {d._auditoria?.gerado_em && (
              <p className="mt-4 text-center text-[10px] font-bold text-zinc-400">
                Fonte: {d._auditoria.fonte} · gerado em {new Date(d._auditoria.gerado_em).toLocaleString("pt-BR")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
