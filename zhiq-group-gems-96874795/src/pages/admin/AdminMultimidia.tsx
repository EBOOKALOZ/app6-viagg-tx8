/**
 * /admin/multimidia — Centro Multimídia (ORION-MEDIA-01)
 *
 * Gerenciamento do catálogo de vídeo do Centro Multimídia (painel Áudio+Vídeo):
 * • Cadastro de TVs/WebTVs, canais, lives (kind tv|live) — TV Viagg incluída.
 * • Categorias, regiões, prioridade, destaque, AO VIVO, bloqueio/desbloqueio.
 * • Estatísticas reais via media_admin_stats() (SECURITY DEFINER, gated
 *   is_admin): espectadores, tempo médio, favoritos, compartilhamentos,
 *   acessos simultâneos (5 min) e origem do acesso. Lacunas declaradas.
 * • Rádios continuam em /admin/orion-audio (catálogo curado) — link no topo.
 * SEGURANÇA: URL só HTTPS + provedores permitidos (YouTube/Vimeo/Twitch/HLS/
 * vídeo direto). Validação espelha src/lib/multimedia/mediaCenter.ts.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  MonitorPlay, Loader2, Tv, Clapperboard, Users, Timer, Heart, Share2, Activity,
  Radio, Star, Ban, CheckCircle2, Trash2, Pencil, Plus, Search, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MediaChannel, MediaKind, MediaStatus, validateMediaUrl, detectProvider,
} from "@/lib/multimedia/mediaCenter";

const tb = () => (supabase.from("media_channels") as any);

interface StatsPayload {
  canais_total?: number; canais_ativos?: number; online_agora?: number;
  espectadores?: number; visualizacoes?: number; tempo_medio_seg?: number;
  favoritos?: number; compartilhamentos?: number;
  origens?: { origem: string; n: number }[];
  top_canais?: { id: string; name: string; kind: string; views: number; sessoes: number }[];
}

const EMPTY_FORM = {
  id: "", kind: "tv" as MediaKind, name: "", description: "", url: "",
  logo_url: "", cover_url: "", category: "", region: "",
  priority: 0, featured: false, is_official: false, is_live: false,
  status: "active" as MediaStatus,
};
type FormState = typeof EMPTY_FORM;

function StatCard({ icon: I, label, value, hint }: { icon: typeof Users; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
        <I className="h-3.5 w-3.5 text-emerald-600" /> {label}
      </p>
      <p className="mt-1 text-2xl font-black text-zinc-900">{value}</p>
      {hint && <p className="text-[10px] font-medium text-zinc-400">{hint}</p>}
    </div>
  );
}

export default function AdminMultimidia() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fKind, setFKind] = useState<"all" | MediaKind>("all");
  const [fStatus, setFStatus] = useState<"all" | MediaStatus>("all");
  const [q, setQ] = useState("");

  const stats = useQuery({
    queryKey: ["media-admin-stats"],
    queryFn: async (): Promise<StatsPayload> => {
      const { data, error } = await (supabase.rpc as any)("media_admin_stats", { p_days: 30 });
      if (error) throw new Error(error.message);
      return (data || {}) as StatsPayload;
    },
    refetchInterval: 60_000,
    retry: 1,
  });

  const channels = useQuery({
    queryKey: ["media-admin-channels"],
    queryFn: async (): Promise<MediaChannel[]> => {
      const { data, error } = await tb()
        .select("*")
        .order("kind").order("priority", { ascending: false }).order("name");
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? data : [];
    },
  });

  const migrationMissing = !!channels.error && /media_channels|schema cache|does not exist/i.test(channels.error.message);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (channels.data || []).filter(c =>
      (fKind === "all" || c.kind === fKind)
      && (fStatus === "all" || c.status === fStatus)
      && (!term || c.name.toLowerCase().includes(term)
        || (c.category || "").toLowerCase().includes(term)
        || (c.region || "").toLowerCase().includes(term)));
  }, [channels.data, fKind, fStatus, q]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["media-admin-channels"] }); qc.invalidateQueries({ queryKey: ["media-admin-stats"] }); };

  const edit = (c: MediaChannel) => {
    setForm({
      id: c.id, kind: c.kind, name: c.name, description: c.description || "",
      url: c.url || "", logo_url: c.logo_url || "", cover_url: c.cover_url || "",
      category: c.category || "", region: c.region || "",
      priority: c.priority || 0, featured: !!c.featured,
      is_official: !!c.is_official, is_live: !!c.is_live,
      status: (c.status || "inactive") as MediaStatus,
    });
    setShowForm(true); setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const name = form.name.trim();
    if (name.length < 2) { setMsg("Informe o nome do canal (mín. 2 caracteres)."); return; }
    if (form.url.trim()) {
      const val = validateMediaUrl(form.url.trim());
      if (!val.ok) { setMsg(`URL recusada: ${val.reason}.`); return; }
      if (!detectProvider(form.url.trim())) {
        setMsg("Fonte não autorizada. Permitido: YouTube, Vimeo, Twitch, HLS (.m3u8) ou vídeo direto (.mp4/.webm)."); return;
      }
    } else if (form.status === "active") {
      setMsg("Canal ativo precisa de uma URL de transmissão."); return;
    }
    setBusy(true);
    try {
      const row = {
        kind: form.kind, name, description: form.description.trim() || null,
        url: form.url.trim() || null,
        provider: form.url.trim() ? detectProvider(form.url.trim()) : null,
        logo_url: form.logo_url.trim() || null, cover_url: form.cover_url.trim() || null,
        category: form.category.trim() || null, region: form.region.trim() || null,
        priority: Number(form.priority) || 0, featured: form.featured,
        is_official: form.is_official, is_live: form.is_live, status: form.status,
      };
      const { error } = form.id
        ? await tb().update(row).eq("id", form.id)
        : await tb().insert(row);
      if (error) throw new Error(error.message);
      setMsg(form.id ? "✓ Canal atualizado." : "✓ Canal criado.");
      setForm(EMPTY_FORM); setShowForm(false); refresh();
    } catch (err) { setMsg("Erro: " + (err as Error).message); }
    finally { setBusy(false); }
  };

  const setStatus = async (c: MediaChannel, status: MediaStatus) => {
    const { error } = await tb().update({ status }).eq("id", c.id);
    if (error) setMsg("Erro: " + error.message); else refresh();
  };

  const del = async (c: MediaChannel) => {
    if (!window.confirm(`Excluir "${c.name}"? Remove o canal e suas estatísticas.`)) return;
    const { error } = await tb().delete().eq("id", c.id);
    if (error) setMsg("Erro: " + error.message); else refresh();
  };

  const s = stats.data || {};
  const tempo = Number(s.tempo_medio_seg || 0);
  const tempoFmt = tempo >= 60 ? `${Math.floor(tempo / 60)}min ${tempo % 60}s` : `${tempo}s`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#04140d] via-[#0a2f1e] to-[#04140d] p-6 text-white shadow-xl ring-1 ring-emerald-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <MonitorPlay className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">Centro Multimídia</h1>
              <p className="text-sm text-emerald-100/70">
                ORION-MEDIA-01 · TVs, canais e lives do painel Áudio+Vídeo · fontes só HTTPS de provedores autorizados · telemetria real (RLS admin)
              </p>
            </div>
            <a href="/admin/orion-audio"
              className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2.5 text-sm font-bold text-emerald-200 ring-1 ring-emerald-500/20 hover:bg-white/10">
              <Radio className="h-4 w-4" /> Rádios (Audio Center) <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* MIGRATION PENDENTE */}
        {migrationMissing && (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            ⚠️ Tabelas do Centro Multimídia ainda não existem no banco. Aplique a migration
            <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 text-[12px]">supabase/migrations/20260727020000_multimedia_center.sql</code>
            no SQL Editor do Supabase.
          </div>
        )}

        {/* ESTATÍSTICAS (30 dias) */}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={Activity} label="Online agora" value={stats.isError ? "—" : s.online_agora ?? 0} hint="sessões nos últimos 5 min" />
          <StatCard icon={Users} label="Espectadores" value={stats.isError ? "—" : s.espectadores ?? 0} hint={`${s.visualizacoes ?? 0} visualizações · 30 dias`} />
          <StatCard icon={Timer} label="Tempo médio" value={stats.isError ? "—" : tempoFmt} hint="por visualização" />
          <StatCard icon={Heart} label="Favoritos" value={stats.isError ? "—" : s.favoritos ?? 0} hint={`${s.compartilhamentos ?? 0} compartilhamentos`} />
        </div>
        {stats.isError && !migrationMissing && (
          <p className="mt-2 text-[11px] font-semibold text-amber-700">
            ⓘ Estatísticas indisponíveis: {(stats.error as Error).message} — lacuna declarada, nunca inventada.
          </p>
        )}

        {/* TOP CANAIS + ORIGENS */}
        {(s.top_canais?.length || 0) > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Top canais (30 dias)</p>
              {(s.top_canais || []).map(t => (
                <div key={t.id} className="mt-2 flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                    {t.kind === "live" ? <Clapperboard className="h-3.5 w-3.5 shrink-0 text-red-500" /> : <Tv className="h-3.5 w-3.5 shrink-0 text-sky-600" />}
                    <span className="truncate">{t.name}</span>
                  </span>
                  <span className="shrink-0 text-[12px] font-bold text-zinc-500">{t.views} views · {t.sessoes} sessões</span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Origem dos acessos</p>
              {(s.origens || []).map(o => (
                <div key={o.origem} className="mt-2 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-mono text-[12px] text-zinc-700">{o.origem || "—"}</span>
                  <span className="shrink-0 text-[12px] font-bold text-zinc-500">{o.n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AÇÕES + FILTROS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowForm(v => !v); setMsg(null); }}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Novo canal
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar canal…"
              className="w-48 rounded-xl border border-zinc-300 bg-white py-2 pl-8 pr-2 text-sm outline-none focus:border-emerald-500" />
          </div>
          {(["all", "tv", "live"] as const).map(k => (
            <button key={k} onClick={() => setFKind(k)}
              className={cn("rounded-full border px-3 py-1 text-[12px] font-bold",
                fKind === k ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 bg-white text-zinc-600")}>
              {k === "all" ? "Todos" : k === "tv" ? "TV" : "Lives"}
            </button>
          ))}
          {(["all", "active", "inactive", "blocked"] as const).map(st => (
            <button key={st} onClick={() => setFStatus(st)}
              className={cn("rounded-full border px-3 py-1 text-[12px] font-bold",
                fStatus === st ? "border-zinc-800 bg-zinc-800 text-white" : "border-zinc-300 bg-white text-zinc-600")}>
              {st === "all" ? "Qualquer status" : st === "active" ? "Ativos" : st === "inactive" ? "Inativos" : "Bloqueados"}
            </button>
          ))}
        </div>

        {msg && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{msg}</p>}

        {/* FORM */}
        {showForm && (
          <form onSubmit={save} className="mt-4 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-2">
            <label className="text-sm font-semibold">Tipo
              <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as MediaKind }))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                <option value="tv">📺 TV / WebTV / Canal</option>
                <option value="live">🔴 Live / Transmissão</option>
              </select>
            </label>
            <label className="text-sm font-semibold">Nome *
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={80}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" placeholder="Ex.: TV Viagg" />
            </label>
            <label className="text-sm font-semibold md:col-span-2">URL da transmissão (HTTPS — YouTube, Vimeo, Twitch, HLS .m3u8 ou vídeo direto)
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm font-mono" placeholder="https://www.youtube.com/watch?v=…" />
            </label>
            <label className="text-sm font-semibold md:col-span-2">Descrição
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-semibold">Logomarca (URL)
              <input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm font-mono" placeholder="https://…" />
            </label>
            <label className="text-sm font-semibold">Capa 16:9 (URL)
              <input value={form.cover_url} onChange={e => setForm(f => ({ ...f, cover_url: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm font-mono" placeholder="https://…" />
            </label>
            <label className="text-sm font-semibold">Categoria
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" placeholder="Institucional, Esportes, Leilão…" />
            </label>
            <label className="text-sm font-semibold">Região
              <input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" placeholder="Nacional, SC, Blumenau…" />
            </label>
            <label className="text-sm font-semibold">Prioridade (maior = primeiro)
              <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-semibold">Status
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as MediaStatus }))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                <option value="active">✅ Ativo (visível no painel)</option>
                <option value="inactive">⏸ Inativo (oculto)</option>
                <option value="blocked">🚫 Bloqueado</option>
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-4 md:col-span-2">
              {([["featured", "⭐ Destaque"], ["is_official", "🏛 Canal oficial (TV Viagg)"], ["is_live", "🔴 AO VIVO agora"]] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-sm font-semibold">
                  <input type="checkbox" checked={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex gap-2 md:col-span-2">
              <button type="submit" disabled={busy}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-black text-white shadow hover:bg-emerald-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {form.id ? "Salvar alterações" : "Criar canal"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-600">Cancelar</button>
            </div>
          </form>
        )}

        {/* LISTA */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {channels.isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-500" /></div>}
          {!channels.isLoading && list.length === 0 && (
            <p className="py-10 text-center text-sm font-semibold text-zinc-400">
              {migrationMissing ? "Aplique a migration para começar." : "Nenhum canal com esses filtros."}
            </p>
          )}
          {list.map(c => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-2.5 last:border-0">
              {c.kind === "live" ? <Clapperboard className="h-4 w-4 shrink-0 text-red-500" /> : <Tv className="h-4 w-4 shrink-0 text-sky-600" />}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                  <span className="truncate">{c.name}</span>
                  {c.is_official && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-amber-500" />}
                  {c.featured && <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-black text-amber-700">DESTAQUE</span>}
                  {c.is_live && <span className="shrink-0 rounded bg-red-100 px-1 text-[10px] font-black text-red-700">AO VIVO</span>}
                </p>
                <p className="truncate text-[11px] text-zinc-500">
                  {[c.category, c.region, c.provider || (c.url ? "auto" : "sem URL"), `prio ${c.priority ?? 0}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                c.status === "active" ? "bg-emerald-100 text-emerald-700"
                  : c.status === "blocked" ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-500")}>
                {c.status === "active" ? "Ativo" : c.status === "blocked" ? "Bloqueado" : "Inativo"}
              </span>
              <button onClick={() => edit(c)} title="Editar" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"><Pencil className="h-4 w-4" /></button>
              {c.status !== "blocked"
                ? <button onClick={() => setStatus(c, "blocked")} title="Bloquear" className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"><Ban className="h-4 w-4" /></button>
                : <button onClick={() => setStatus(c, "active")} title="Desbloquear e ativar" className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"><CheckCircle2 className="h-4 w-4" /></button>}
              {c.status === "inactive" && (
                <button onClick={() => setStatus(c, "active")} title="Ativar" className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"><CheckCircle2 className="h-4 w-4" /></button>
              )}
              <button onClick={() => del(c)} title="Excluir" className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[11px] font-semibold text-zinc-400">
          Preparado para: transmissões de leilões (source_type=auction), vídeos de produtos (source_type=product) e recomendações ORION AI (categoria/região/prioridade/destaque).
        </p>
      </div>
    </div>
  );
}
