/**
 * /admin/orion-audio — ORION Audio Center (ORION-AUDIO-01)
 *
 * Estatísticas do Centro Inteligente de Áudio: preset mais usado, IA Sound
 * ligada/desligada, dispositivos, tempo de uso e guarda anti-distorção.
 * Fonte única: orion_audio_admin_stats() (SECURITY DEFINER, gated mp_is_admin).
 * Convenção ORION: dados reais com _auditoria; lacunas DECLARADAS, nunca inventadas.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AudioLines, Loader2, Sparkles, Timer, Headphones, ShieldAlert,
  Star, Users, FlaskConical, Activity,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

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
