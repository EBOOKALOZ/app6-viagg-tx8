import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type Infra = {
  cripto_repouso_disco?: { status?: string; fonte?: string };
  cripto_transito_tls?: { status?: string; ssl_param?: string };
  backup_gerenciado?: { status?: string; pitr?: string };
  pgcrypto_disponivel?: boolean;
  vault_disponivel?: boolean;
  nota?: string;
};
type Dashboard = {
  colunas_protegidas?: number;
  por_classe?: Record<string, number>;
  chave_ativa?: { chave?: string; versao?: number; no_vault?: boolean };
  acessos_ultimos_7d?: number;
  reveals_ultimos_7d?: number;
  dlp_findings_abertos?: number;
  dlp_por_severidade?: Record<string, number>;
  infra?: Infra;
};

const Stat = ({ label, value, tone = "zinc" }: { label: string; value: React.ReactNode; tone?: string }) => (
  <div className={`rounded-xl border border-${tone}-200 bg-${tone}-50 p-4`}>
    <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
    <div className="mt-1 text-2xl font-semibold text-zinc-800">{value}</div>
  </div>
);

const Badge = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
    {children}
  </span>
);

export default function AdminOrionDataShield() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [selftest, setSelftest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, st] = await Promise.all([
      supabase.rpc("ds_dashboard"),
      supabase.rpc("orion_ds_selftest"),
    ]);
    if (!d.error) setDash(d.data as Dashboard);
    if (!st.error) setSelftest(st.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rotate = async () => {
    setBusy("rotate"); setMsg(null);
    const { data, error } = await supabase.rpc("ds_rotate_key", { p_chave_logica: "ds_master" });
    setBusy(null);
    setMsg(error ? `Erro: ${error.message}` : `Chave rotacionada → v${(data as any)?.nova_versao}`);
    load();
  };

  const infra = dash?.infra;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-800">🛡️ Data Shield</h1>
          <p className="text-sm text-zinc-500">Proteção de dados — mascaramento, chaves (vault), auditoria de acesso e DLP.</p>
        </div>
        <div className="flex items-center gap-2">
          {selftest && <Badge ok={selftest.status === "PASS"}>selftest {selftest.status}</Badge>}
          <button onClick={load} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">Atualizar</button>
        </div>
      </div>

      {loading && <div className="text-sm text-zinc-500">Carregando…</div>}

      {!loading && dash && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Colunas protegidas" value={dash.colunas_protegidas ?? 0} />
            <Stat label="Acessos (7d)" value={dash.acessos_ultimos_7d ?? 0} />
            <Stat label="Reveals auditados (7d)" value={dash.reveals_ultimos_7d ?? 0} />
            <Stat label="DLP em aberto" value={dash.dlp_findings_abertos ?? 0} tone={(dash.dlp_findings_abertos ?? 0) > 0 ? "amber" : "zinc"} />
          </div>

          {/* Chave / rotação */}
          <div className="mt-6 rounded-xl border border-zinc-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-700">Gestão de chaves (supabase_vault)</h2>
              <button onClick={rotate} disabled={busy === "rotate"} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-50">
                {busy === "rotate" ? "Rotacionando…" : "Rotacionar chave"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
              <span>Chave: <code className="rounded bg-zinc-100 px-1">{dash.chave_ativa?.chave ?? "—"}</code></span>
              <span>Versão: <b>v{dash.chave_ativa?.versao ?? "—"}</b></span>
              <Badge ok={!!dash.chave_ativa?.no_vault}>{dash.chave_ativa?.no_vault ? "no cofre (vault)" : "fora do cofre"}</Badge>
            </div>
            {msg && <p className="mt-2 text-[12px] text-zinc-500">{msg}</p>}
          </div>

          {/* Atestação de infra */}
          <div className="mt-6 rounded-xl border border-zinc-200 p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700">Criptografia (infra Supabase — atestada)</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-[11px] text-zinc-500">Em repouso (disco)</div>
                <Badge ok={infra?.cripto_repouso_disco?.status === "ATIVO"}>{infra?.cripto_repouso_disco?.status ?? "—"}</Badge>
                <div className="mt-1 text-[11px] text-zinc-400">AES-256 no storage gerenciado</div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-[11px] text-zinc-500">Em trânsito (TLS)</div>
                <Badge ok={infra?.cripto_transito_tls?.status === "ATIVO"}>{infra?.cripto_transito_tls?.status ?? "—"}</Badge>
                <div className="mt-1 text-[11px] text-zinc-400">ssl={infra?.cripto_transito_tls?.ssl_param}</div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-[11px] text-zinc-500">Backup gerenciado</div>
                <Badge ok={infra?.backup_gerenciado?.status === "ATIVO"}>{infra?.backup_gerenciado?.status ?? "—"}</Badge>
                <div className="mt-1 text-[11px] text-zinc-400">PITR: {infra?.backup_gerenciado?.pitr}</div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-zinc-400">{infra?.nota}</p>
          </div>

          {/* DLP por severidade */}
          {dash.dlp_por_severidade && Object.keys(dash.dlp_por_severidade).length > 0 && (
            <div className="mt-6 rounded-xl border border-zinc-200 p-4">
              <h2 className="mb-3 text-sm font-semibold text-zinc-700">DLP — vazamentos por severidade</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(dash.dlp_por_severidade).map(([sev, n]) => (
                  <span key={sev} className="rounded-lg border border-zinc-200 px-3 py-1 text-sm">
                    {sev}: <b>{n}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Selftest checks */}
          {selftest?.checks && (
            <div className="mt-6 rounded-xl border border-zinc-200 p-4">
              <h2 className="mb-3 text-sm font-semibold text-zinc-700">Selftest ({selftest.resumo?.pass}/{(selftest.checks || []).length})</h2>
              <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                {(selftest.checks as any[]).map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px]">
                    <Badge ok={c.resultado === "PASS"}>{c.resultado}</Badge>
                    <span className="text-zinc-600">{c.nome}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
