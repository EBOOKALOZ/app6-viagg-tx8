/**
 * Painel Admin — Comissão Inteligente
 *
 * Auditoria em tempo real da comissão por grupos:
 *  · grupos VÁLIDOS reais (whatsapp_groups.valid_for_commission)
 *  · valores persistidos em profiles (usados na COBRANÇA do despacho)
 *  · % esperado pela escada oficial (25/20/16/12/9/6)
 *  · overrides do admin
 *  · status de sincronização e inconsistências
 *  · histórico de alterações (commission_rate_history)
 *
 * Fonte de dados: RPCs admin_commission_overview / admin_commission_history
 * (migration 20260705_comissao_inteligente_sync.sql).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Target, Users, AlertTriangle, CheckCircle2, History, Info, Percent,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CommissionFinancePanel } from "@/components/admin/CommissionFinancePanel";

const OFFICIAL_TIERS = [
  { pct: 25, groupsMin: 0, name: "Inicial" },
  { pct: 20, groupsMin: 1, name: "Bronze" },
  { pct: 16, groupsMin: 2, name: "Prata" },
  { pct: 12, groupsMin: 3, name: "Ouro" },
  { pct: 9, groupsMin: 4, name: "Elite" },
  { pct: 6, groupsMin: 5, name: "VIP" },
] as const;

interface OverviewRow {
  user_id: string;
  name: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  valid_groups: number;
  total_groups: number;
  persisted_groups: number | null;
  persisted_percent: number | string | null;
  expected_percent: number;
  override_rate: number | string | null;
  is_consistent: boolean;
  last_change_at: string | null;
}

interface HistoryRow {
  id: string;
  user_id: string;
  name: string | null;
  old_groups: number | null;
  new_groups: number;
  old_percent: number | string | null;
  new_percent: number | string;
  reason: string;
  created_at: string;
}

/* Estrito: SÓ função inexistente (PGRST202). Erros de RUNTIME da RPC
   (ex.: coluna inexistente, 42703) devem aparecer na faixa vermelha,
   nunca cair silenciosamente no modo leitura direta. */
const isMissingRpc = (err: any) =>
  !!err && /could not find the function|PGRST202/i.test(err.message || String(err));

const ladderRate = (n: number) =>
  n >= 5 ? 6 : n === 4 ? 9 : n === 3 ? 12 : n === 2 ? 16 : n === 1 ? 20 : 25;

/** Fallback pré-migration: monta a visão geral lendo as tabelas diretamente
 *  (sem histórico e sem sincronização automática — só leitura/auditoria). */
async function fetchOverviewFallback(): Promise<OverviewRow[]> {
  const [{ data: profiles }, { data: groups }, { data: overrides }] = await Promise.all([
    (supabase.from("profiles") as any)
      .select("id, name, email, cidade, estado, quantidade_grupos_ativos, percentual_comissao_atual, available_profiles"),
    (supabase.from("whatsapp_groups") as any)
      .select("owner_user_id, valid_for_commission"),
    (supabase.from("commission_overrides") as any)
      .select("user_id, custom_rate"),
  ]);

  const agg = new Map<string, { valid: number; total: number }>();
  (groups || []).forEach((g: any) => {
    if (!g.owner_user_id) return;
    const a = agg.get(g.owner_user_id) || { valid: 0, total: 0 };
    a.total++;
    if (g.valid_for_commission) a.valid++;
    agg.set(g.owner_user_id, a);
  });

  const ovr = new Map<string, number>((overrides || []).map((o: any) => [o.user_id, Number(o.custom_rate)]));

  return (profiles || [])
    .filter((p: any) => {
      const prof = String(p.available_profiles ?? "").toLowerCase();
      return agg.has(p.id) || (p.quantidade_grupos_ativos ?? 0) > 0
        || prof.includes("motoboy") || prof.includes("mototaxi");
    })
    .map((p: any): OverviewRow => {
      const g = agg.get(p.id) || { valid: 0, total: 0 };
      const expected = ladderRate(g.valid);
      const override = ovr.has(p.id) ? ovr.get(p.id)! : null;
      const persistedPct = p.percentual_comissao_atual != null ? Number(p.percentual_comissao_atual) : null;
      return {
        user_id: p.id,
        name: p.name,
        email: p.email,
        cidade: p.cidade,
        estado: p.estado,
        valid_groups: g.valid,
        total_groups: g.total,
        persisted_groups: p.quantidade_grupos_ativos ?? 0,
        persisted_percent: persistedPct,
        expected_percent: expected,
        override_rate: override,
        is_consistent:
          (p.quantidade_grupos_ativos ?? 0) === g.valid
          && persistedPct === (override ?? expected),
        last_change_at: null,
      };
    })
    .sort((a: OverviewRow, b: OverviewRow) => b.valid_groups - a.valid_groups);
}

export default function AdminCommissionIntelligence() {
  const [search, setSearch] = useState("");
  const [onlyInconsistent, setOnlyInconsistent] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ["admin-commission-overview"],
    queryFn: async (): Promise<{ rows: OverviewRow[]; fallback: boolean }> => {
      const { data, error } = await (supabase.rpc as any)("admin_commission_overview");
      if (!error) return { rows: (data || []) as OverviewRow[], fallback: false };
      if (isMissingRpc(error)) {
        // Migration ainda não aplicada → modo leitura direta das tabelas
        return { rows: await fetchOverviewFallback(), fallback: true };
      }
      throw error;
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  });

  const historyQuery = useQuery({
    queryKey: ["admin-commission-history"],
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await (supabase.rpc as any)("admin_commission_history", { p_limit: 100 });
      if (error) {
        if (isMissingRpc(error)) return []; // sem histórico até a migration rodar
        throw error;
      }
      return (data || []) as HistoryRow[];
    },
    refetchInterval: 30_000,
    retry: 1,
  });

  const rows = overviewQuery.data?.rows || [];
  const fallbackMode = overviewQuery.data?.fallback ?? false;

  const stats = useMemo(() => {
    const total = rows.length;
    const inconsistent = rows.filter((r) => !r.is_consistent).length;
    const withOverride = rows.filter((r) => r.override_rate != null).length;
    const avgPct = total > 0
      ? rows.reduce((s, r) => s + Number(r.persisted_percent ?? r.expected_percent), 0) / total
      : 0;
    const tierCounts = OFFICIAL_TIERS.map((t) => ({
      ...t,
      count: rows.filter((r) => r.expected_percent === t.pct).length,
    }));
    const lastChange = rows.reduce<string | null>((acc, r) => {
      if (!r.last_change_at) return acc;
      return !acc || r.last_change_at > acc ? r.last_change_at : acc;
    }, null);
    return { total, inconsistent, withOverride, avgPct, tierCounts, lastChange };
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (onlyInconsistent) list = list.filter((r) => !r.is_consistent);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.cidade || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, search, onlyInconsistent]);

  const fmtDate = (iso: string | null) =>
    iso ? format(new Date(iso), "dd/MM/yy 'às' HH:mm", { locale: ptBR }) : "—";

  const fmtPct = (v: number | string | null | undefined) =>
    v == null ? "—" : `${Number(v)}%`;

  return (
    <div className="w-full px-4 md:px-6 py-4 space-y-4">
      <PageHeader />

      {/* ── Aviso: rodando em modo leitura direta (migration pendente) ── */}
      {fallbackMode && (
        <Alert className="bg-amber-50 border-amber-300">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm text-black">
            <strong>Modo leitura direta.</strong> Os dados abaixo são calculados em
            tempo real a partir das tabelas, mas a <strong>sincronização automática da
            cobrança</strong> e o <strong>histórico de alterações</strong> só ativam após rodar a migration{" "}
            <code className="bg-amber-100 px-1 rounded">
              supabase/migrations/20260705_comissao_inteligente_sync.sql
            </code>{" "}
            no SQL Editor do projeto Supabase (broifhfqmnzqoongtokm).
          </AlertDescription>
        </Alert>
      )}

      {overviewQuery.isError && (
        <Alert className="bg-destructive/10 border-destructive/30">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-sm text-black">
            Erro ao carregar os dados: {String((overviewQuery.error as any)?.message || overviewQuery.error)}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Cards resumo ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Users className="h-4 w-4 text-blue-500" />}
          label="Profissionais monitorados"
          value={overviewQuery.isLoading ? null : String(stats.total)}
        />
        <SummaryCard
          icon={<Percent className="h-4 w-4 text-motoboy" />}
          label="Comissão média aplicada"
          value={overviewQuery.isLoading ? null : `${stats.avgPct.toFixed(1)}%`}
        />
        <SummaryCard
          icon={stats.inconsistent > 0
            ? <AlertTriangle className="h-4 w-4 text-destructive" />
            : <CheckCircle2 className="h-4 w-4 text-success" />}
          label="Inconsistências"
          value={overviewQuery.isLoading ? null : String(stats.inconsistent)}
          valueClassName={stats.inconsistent > 0 ? "text-destructive" : "text-success"}
        />
        <SummaryCard
          icon={<History className="h-4 w-4 text-muted-foreground" />}
          label="Última alteração"
          value={overviewQuery.isLoading ? null : fmtDate(stats.lastChange)}
          small
        />
      </div>

      {/* ── Distribuição por faixa ── */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Distribuição por faixa (escada oficial)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {stats.tierCounts.map((t) => (
              <div key={t.pct} className="text-center rounded-lg border border-muted bg-muted/30 p-2">
                <p className="text-lg font-black tabular-nums text-motoboy">{t.pct}%</p>
                <p className="text-[10px] text-muted-foreground">
                  {t.groupsMin === 0 ? "0 grupos" : `${t.groupsMin}+ grupos`} · {t.name}
                </p>
                <p className="text-sm font-bold mt-1">
                  {overviewQuery.isLoading ? "…" : t.count}
                </p>
                <p className="text-[9px] text-muted-foreground">usuários</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Resumo Financeiro da Plataforma ── */}
      <CommissionFinancePanel />

      {/* ── Tabela por usuário ── */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Comissão por profissional (tempo real — atualiza a cada 15s)
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyInconsistent((v) => !v)}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors",
                  onlyInconsistent
                    ? "bg-destructive text-white border-destructive"
                    : "bg-muted/40 text-muted-foreground border-muted hover:bg-muted"
                )}
              >
                Só inconsistentes
              </button>
              <Input
                placeholder="Buscar nome, e-mail ou cidade…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-56 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {overviewQuery.isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "Nenhum profissional com grupos encontrado." : "Nenhum resultado para o filtro."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left font-medium px-3 py-2">Profissional</th>
                    <th className="text-left font-medium px-3 py-2">Cidade</th>
                    <th className="text-center font-medium px-3 py-2">Grupos válidos</th>
                    <th className="text-center font-medium px-3 py-2">% aplicado</th>
                    <th className="text-center font-medium px-3 py-2">% esperado</th>
                    <th className="text-center font-medium px-3 py-2">Override</th>
                    <th className="text-center font-medium px-3 py-2">Sincronização</th>
                    <th className="text-right font-medium px-3 py-2">Última alteração</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((r) => (
                    <tr key={r.user_id} className={cn(!r.is_consistent && "bg-destructive/5")}>
                      <td className="px-3 py-2">
                        <p className="font-semibold">{r.name || "Sem nome"}</p>
                        <p className="text-[10px] text-muted-foreground">{r.email || "—"}</p>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.cidade ? `${r.cidade}${r.estado ? `/${r.estado}` : ""}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        <span className="font-bold">{r.valid_groups}</span>
                        <span className="text-muted-foreground"> / {r.total_groups}</span>
                      </td>
                      <td className="px-3 py-2 text-center font-bold text-motoboy tabular-nums">
                        {fmtPct(r.persisted_percent)}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{fmtPct(r.expected_percent)}</td>
                      <td className="px-3 py-2 text-center">
                        {r.override_rate != null ? (
                          <Badge variant="outline" className="text-[10px] border-violet-400 text-violet-600">
                            {fmtPct(r.override_rate)} manual
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.is_consistent ? (
                          <Badge className="bg-success/15 text-success border-0 text-[10px]">OK</Badge>
                        ) : (
                          <Badge className="bg-destructive/15 text-destructive border-0 text-[10px]">
                            Inconsistente
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{fmtDate(r.last_change_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Histórico de alterações ── */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico de alterações de comissão (últimas 100)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {historyQuery.isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !historyQuery.data || historyQuery.data.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma alteração registrada ainda. As mudanças passam a ser gravadas
              automaticamente a partir da ativação da sincronização.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left font-medium px-3 py-2">Quando</th>
                    <th className="text-left font-medium px-3 py-2">Profissional</th>
                    <th className="text-center font-medium px-3 py-2">Grupos</th>
                    <th className="text-center font-medium px-3 py-2">Comissão</th>
                    <th className="text-left font-medium px-3 py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historyQuery.data.map((h) => (
                    <tr key={h.id}>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(h.created_at)}</td>
                      <td className="px-3 py-2 font-semibold">{h.name || h.user_id.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {h.old_groups ?? "—"} → <strong>{h.new_groups}</strong>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {fmtPct(h.old_percent)} → <strong className="text-motoboy">{fmtPct(h.new_percent)}</strong>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px]">
                          {h.reason === "override" ? "Override admin" : "Mudança de grupos"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RulesCard />
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-motoboy/10 flex items-center justify-center">
        <Target className="h-5 w-5 text-motoboy" />
      </div>
      <div>
        <h1 className="text-xl font-black tracking-tight">Comissão Inteligente</h1>
        <p className="text-xs text-muted-foreground">
          Auditoria em tempo real · grupos válidos × comissão cobrada × escada oficial
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, valueClassName, small }: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  valueClassName?: string;
  small?: boolean;
}) {
  return (
    <Card className="bg-white">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">{icon}
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
        {value === null ? (
          <Skeleton className="h-6 w-20" />
        ) : (
          <p className={cn("font-black tabular-nums", small ? "text-sm" : "text-2xl", valueClassName)}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function RulesCard() {
  return (
    <Alert className="bg-motoboy/5 border-motoboy/20">
      <Info className="h-4 w-4 text-motoboy" />
      <AlertDescription className="text-xs space-y-1">
        <p><strong>Regras oficiais:</strong> escada 25% (0 grupos) → 20% (1) → 16% (2) → 12% (3) → 9% (4) → 6% (5+).</p>
        <p>
          <strong>Grupo válido para comissão:</strong> aprovado + ativo + ≥ 90 membros + postagem nos últimos 30 dias
          (mantido automaticamente pelo banco).
        </p>
        <p>
          <strong>Override do admin</strong> (definido em Usuários → detalhe) tem precedência sobre a escada e fica
          marcado nesta tela. A comissão cobrada no despacho é sempre o "% aplicado" persistido no perfil.
        </p>
      </AlertDescription>
    </Alert>
  );
}
