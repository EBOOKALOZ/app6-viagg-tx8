/**
 * RADAR IA — centro de inteligência de grupos (Painel Administrativo).
 *
 * Arquitetura: o MOTOR de score roda no banco (radar_score_groups —
 * set-based, escala a milhões de grupos; trigger repontua a cada
 * cadastro/edição). A camada de IA (edge radar-ia, Anthropic) explica o
 * score e refina recomendações usando as decisões manuais do admin como
 * aprendizado. Este painel só CONSOME RPCs admin-gated (mp_is_admin).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Radar, Users, MapPin, Star, TrendingUp, Sparkles, ShieldAlert,
  RefreshCw, CheckCircle2, XCircle, Archive, Loader2, Trophy, Globe2,
} from "lucide-react";

// ── Tipos das RPCs ────────────────────────────────────────────────────────────
type Overview = {
  total: number; ativos: number; inativos: number; aprovados: number;
  pendentes: number; rejeitados: number; membros: number;
  novos_dia: number; novos_semana: number; novos_mes: number;
  cidades: number; score_medio: number;
};
type GroupRow = {
  id: string; group_name: string; group_link: string; city_name: string;
  state_code: string; neighborhood: string; members_count: number;
  is_active: boolean; validation_status: string; invalid_reason: string | null;
  created_at: string; last_posted_at: string | null;
  owner_user_id: string; owner_name: string | null; profile_kind: string;
  score: number; classification: string; commercial_potential: number;
  recommendation: string; ai_explanation: string | null; factors: any;
};
type TerritoryRow = {
  city_name: string; state_code: string; grupos: number; membros: number;
  score_medio: number; potencial_medio: number; situacao: string;
};
type RankingRow = {
  owner_user_id: string; owner_name: string | null; profile_kind: string;
  grupos: number; aprovados: number; rejeitados: number; score_medio: number;
  membros: number; desde: string; confiabilidade: number; nivel: string;
};

// ── Estilos por classificação/recomendação ───────────────────────────────────
const CLASS_STYLE: Record<string, string> = {
  "Excelente":       "bg-emerald-600 text-white",
  "Muito Bom":       "bg-emerald-500/20 text-emerald-600 border border-emerald-500/40",
  "Bom":             "bg-blue-500/15 text-blue-600 border border-blue-500/30",
  "Regular":         "bg-amber-500/15 text-amber-600 border border-amber-500/30",
  "Baixo Potencial": "bg-orange-500/15 text-orange-600 border border-orange-500/30",
  "Suspeito":        "bg-red-600 text-white",
};
const RECO_LABEL: Record<string, string> = {
  aprovar_automatico: "✅ Aprovar automaticamente",
  enviar_revisao:     "👀 Enviar para revisão",
  grupo_duplicado:    "♊ Grupo duplicado",
  link_invalido:      "🔗 Link inválido",
  grupo_suspeito:     "🚩 Grupo suspeito",
  grupo_abandonado:   "🌵 Grupo abandonado",
  baixa_qualidade:    "📉 Baixa qualidade",
  alto_potencial:     "🚀 Alto potencial",
  sem_analise:        "— sem análise",
};
const SITUACAO_STYLE: Record<string, string> = {
  descoberta:     "bg-purple-500/15 text-purple-600 border border-purple-500/30",
  em_crescimento: "bg-blue-500/15 text-blue-600 border border-blue-500/30",
  consolidada:    "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30",
  saturada:       "bg-red-500/15 text-red-600 border border-red-500/30",
};
const NIVEL_EMOJI: Record<string, string> = { Ouro: "🥇", Prata: "🥈", Bronze: "🥉" };

const stars = (score: number) => "★".repeat(Math.max(1, Math.round(score / 20)));
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

function StatCard({ icon: Icon, label, value, hint }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5 text-primary" /> {label}
        </p>
        <p className="mt-0.5 text-lg font-black">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminRadarIA() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("todas");
  const [recoFilter, setRecoFilter] = useState("todas");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const rpc = (name: string, args?: object) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)(name, args);

  const overviewQ = useQuery({
    queryKey: ["radar-overview"],
    queryFn: async (): Promise<Overview | null> => {
      const { data, error } = await rpc("radar_overview");
      if (error) throw new Error(error.message);
      return data as Overview | null;
    },
    refetchInterval: 30_000,
  });

  const groupsQ = useQuery({
    queryKey: ["radar-groups"],
    queryFn: async (): Promise<GroupRow[]> => {
      const { data, error } = await rpc("radar_list_groups", { p_limit: 500 });
      if (error) throw new Error(error.message);
      return (data ?? []) as GroupRow[];
    },
    refetchInterval: 30_000,
  });

  const territoryQ = useQuery({
    queryKey: ["radar-territory"],
    queryFn: async (): Promise<TerritoryRow[]> => {
      const { data, error } = await rpc("radar_territory");
      if (error) throw new Error(error.message);
      return (data ?? []) as TerritoryRow[];
    },
    refetchInterval: 60_000,
  });

  const rankingQ = useQuery({
    queryKey: ["radar-ranking"],
    queryFn: async (): Promise<RankingRow[]> => {
      const { data, error } = await rpc("radar_ranking");
      if (error) throw new Error(error.message);
      return (data ?? []) as RankingRow[];
    },
    refetchInterval: 60_000,
  });

  const ov = overviewQ.data;
  const groups = groupsQ.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (classFilter !== "todas" && g.classification !== classFilter) return false;
      if (recoFilter !== "todas" && g.recommendation !== recoFilter) return false;
      if (!q) return true;
      return [g.group_name, g.city_name, g.owner_name, g.group_link]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [groups, search, classFilter, recoFilter]);

  // Auditoria automática: buckets de problemas
  const audit = useMemo(() => ({
    duplicados:  groups.filter((g) => g.recommendation === "grupo_duplicado"),
    linkQuebrado: groups.filter((g) => g.recommendation === "link_invalido"),
    suspeitos:   groups.filter((g) => g.classification === "Suspeito"),
    abandonados: groups.filter((g) => g.recommendation === "grupo_abandonado"),
    inativos:    groups.filter((g) => !g.is_active),
    semLocal:    groups.filter((g) => g.factors && g.factors.localizacao === 0),
  }), [groups]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["radar-overview"] });
    qc.invalidateQueries({ queryKey: ["radar-groups"] });
    qc.invalidateQueries({ queryKey: ["radar-territory"] });
    qc.invalidateQueries({ queryKey: ["radar-ranking"] });
  };

  const decide = async (groupId: string, decision: string) => {
    setBusyId(groupId);
    try {
      const { error } = await rpc("radar_admin_decide", {
        p_group_id: groupId, p_decision: decision, p_notes: null,
      });
      if (error) throw new Error(error.message);
      toast.success(`Decisão registrada: ${decision} (a IA aprende com ela)`);
      refreshAll();
    } catch (e: any) {
      toast.error("Falha na decisão", { description: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const reprocessAll = async () => {
    try {
      const { data, error } = await rpc("radar_reprocess_all");
      if (error) throw new Error(error.message);
      toast.success(`Motor reprocessou ${data} grupos`);
      refreshAll();
    } catch (e: any) {
      toast.error("Falha no reprocesso", { description: e.message });
    }
  };

  const runAi = async (groupId?: string) => {
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("radar-ia", {
        body: groupId ? { group_id: groupId } : { batch: 10 },
      });
      if (error) throw new Error(error.message);
      toast.success(`IA analisou ${data?.analyzed ?? 0} grupo(s)`);
      refreshAll();
    } catch (e: any) {
      toast.error("Falha na análise de IA", { description: e.message });
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* ── Cabeçalho ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg">
            <Radar className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black leading-tight">RADAR IA</h1>
            <p className="text-xs text-muted-foreground">
              Centro de inteligência dos grupos — auditoria, score e território
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={reprocessAll}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reprocessar motor
          </Button>
          <Button size="sm" onClick={() => runAi()} disabled={aiBusy}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700">
            {aiBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            Analisar com IA
          </Button>
        </div>
      </div>

      {/* ── Dashboard executivo ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={Users} label="Grupos" value={ov?.total ?? "…"}
          hint={`${ov?.ativos ?? 0} ativos · ${ov?.inativos ?? 0} inativos`} />
        <StatCard icon={CheckCircle2} label="Aprovados" value={ov?.aprovados ?? "…"}
          hint={`${ov?.pendentes ?? 0} pendentes · ${ov?.rejeitados ?? 0} rejeitados`} />
        <StatCard icon={TrendingUp} label="Membros (est.)" value={(ov?.membros ?? 0).toLocaleString("pt-BR")} />
        <StatCard icon={Sparkles} label="Crescimento" value={`+${ov?.novos_dia ?? 0} hoje`}
          hint={`+${ov?.novos_semana ?? 0} semana · +${ov?.novos_mes ?? 0} mês`} />
        <StatCard icon={Globe2} label="Cobertura" value={`${ov?.cidades ?? 0} cidades`} />
        <StatCard icon={Star} label="Score médio" value={ov?.score_medio ?? "…"} hint="0 a 100" />
      </div>

      <Tabs defaultValue="grupos">
        <TabsList className="flex-wrap">
          <TabsTrigger value="grupos">Gestão de Grupos</TabsTrigger>
          <TabsTrigger value="auditoria">
            Auditoria {audit.suspeitos.length + audit.duplicados.length + audit.linkQuebrado.length > 0 && (
              <Badge className="ml-1.5 bg-red-600 text-white">{audit.suspeitos.length + audit.duplicados.length + audit.linkQuebrado.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="territorio">Radar Territorial</TabsTrigger>
        </TabsList>

        {/* ── GESTÃO DE GRUPOS ── */}
        <TabsContent value="grupos" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Buscar por nome, cidade, profissional ou link…"
              value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as classes</SelectItem>
                {Object.keys(CLASS_STYLE).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={recoFilter} onValueChange={setRecoFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as recomendações</SelectItem>
                {Object.entries(RECO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[560px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Grupo</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead className="text-center">Membros</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                      <TableHead>Classificação</TableHead>
                      <TableHead className="text-center">Potencial</TableHead>
                      <TableHead>Recomendação IA</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupsQ.isLoading && (
                      <TableRow><TableCell colSpan={9} className="py-8 text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                      </TableCell></TableRow>
                    )}
                    {!groupsQ.isLoading && filtered.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                        Nenhum grupo neste filtro.
                      </TableCell></TableRow>
                    )}
                    {filtered.map((g) => (
                      <TableRow key={g.id} className={!g.is_active ? "opacity-55" : ""}>
                        <TableCell>
                          <p className="max-w-40 truncate text-xs font-bold">{g.group_name || "—"}</p>
                          <p className="text-[10px] text-muted-foreground">{fmtDate(g.created_at)}{!g.is_active && " · inativo"}</p>
                        </TableCell>
                        <TableCell className="text-xs">{g.city_name || "—"}{g.state_code ? `/${g.state_code}` : ""}</TableCell>
                        <TableCell>
                          <p className="max-w-28 truncate text-xs">{g.owner_name || "—"}</p>
                          <p className="text-[10px] text-muted-foreground">{g.profile_kind}</p>
                        </TableCell>
                        <TableCell className="text-center text-xs font-bold">{g.members_count ?? 0}</TableCell>
                        <TableCell className="text-center">
                          <p className="text-sm font-black">{g.score}</p>
                          <p className="text-[10px] text-amber-500">{stars(g.score)}</p>
                        </TableCell>
                        <TableCell>
                          <Badge className={CLASS_STYLE[g.classification] ?? ""}>{g.classification}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs font-bold">{g.commercial_potential}%</TableCell>
                        <TableCell>
                          <p className="text-xs">{RECO_LABEL[g.recommendation] ?? g.recommendation}</p>
                          {g.ai_explanation && (
                            <p className="mt-0.5 max-w-52 text-[10px] leading-snug text-muted-foreground" title={g.ai_explanation}>
                              🤖 {g.ai_explanation.slice(0, 90)}{g.ai_explanation.length > 90 ? "…" : ""}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600"
                              title="Aprovar" disabled={busyId === g.id}
                              onClick={() => decide(g.id, "aprovar")}>
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600"
                              title="Rejeitar" disabled={busyId === g.id}
                              onClick={() => decide(g.id, "rejeitar")}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                              title="Arquivar" disabled={busyId === g.id}
                              onClick={() => decide(g.id, "arquivar")}>
                              <Archive className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-violet-600"
                              title="Reprocessar com IA" disabled={aiBusy}
                              onClick={() => runAi(g.id)}>
                              <Sparkles className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AUDITORIA AUTOMÁTICA ── */}
        <TabsContent value="auditoria" className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard icon={ShieldAlert} label="Suspeitos" value={audit.suspeitos.length} />
            <StatCard icon={ShieldAlert} label="Duplicados" value={audit.duplicados.length} />
            <StatCard icon={ShieldAlert} label="Links quebrados" value={audit.linkQuebrado.length} />
            <StatCard icon={ShieldAlert} label="Abandonados" value={audit.abandonados.length} />
            <StatCard icon={ShieldAlert} label="Sem localização" value={audit.semLocal.length} />
            <StatCard icon={ShieldAlert} label="Inativos" value={audit.inativos.length} />
          </div>
          {[
            { titulo: "🚩 Suspeitos — intervenção sugerida", lista: audit.suspeitos },
            { titulo: "♊ Duplicados", lista: audit.duplicados },
            { titulo: "🔗 Links quebrados/inválidos", lista: audit.linkQuebrado },
            { titulo: "🌵 Abandonados (60+ dias sem postagem)", lista: audit.abandonados },
          ].map(({ titulo, lista }) => (
            <Card key={titulo}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{titulo} ({lista.length})</CardTitle></CardHeader>
              <CardContent>
                {lista.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nada encontrado — tudo limpo. ✓</p>
                ) : (
                  <div className="space-y-1.5">
                    {lista.slice(0, 10).map((g) => (
                      <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold">{g.group_name || g.group_link}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {g.city_name || "sem cidade"} · {g.owner_name || "—"} · score {g.score}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-600"
                          onClick={() => decide(g.id, "rejeitar")}>Rejeitar</Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── RANKING ── */}
        <TabsContent value="ranking" className="space-y-3">
          {["motoboy", "motorista", "outro"].map((kind) => {
            const rows = (rankingQ.data ?? []).filter((r) => r.profile_kind === kind);
            if (rows.length === 0) return null;
            const titulo = kind === "motoboy" ? "🏍️ Motoboys / Moto-Táxis"
              : kind === "motorista" ? "🚗 Motoristas" : "Outros perfis";
            return (
              <Card key={kind}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-amber-500" /> {titulo}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Profissional</TableHead>
                        <TableHead className="text-center">Grupos</TableHead>
                        <TableHead className="text-center">Aprovação</TableHead>
                        <TableHead className="text-center">Score médio</TableHead>
                        <TableHead className="text-center">Membros</TableHead>
                        <TableHead>Colabora desde</TableHead>
                        <TableHead>Nível</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, i) => (
                        <TableRow key={r.owner_user_id}>
                          <TableCell className="text-xs font-black">{i + 1}º</TableCell>
                          <TableCell className="text-xs font-bold">{r.owner_name || r.owner_user_id.slice(0, 8)}</TableCell>
                          <TableCell className="text-center text-xs">{r.grupos}</TableCell>
                          <TableCell className="text-center text-xs">{r.confiabilidade ?? 0}%</TableCell>
                          <TableCell className="text-center text-xs font-bold">{r.score_medio ?? "—"}</TableCell>
                          <TableCell className="text-center text-xs">{Number(r.membros).toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-xs">{fmtDate(r.desde)}</TableCell>
                          <TableCell className="text-xs">{NIVEL_EMOJI[r.nivel] ?? ""} {r.nivel}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ── RADAR TERRITORIAL ── */}
        <TabsContent value="territorio" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-primary" /> Cobertura por cidade
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cidade</TableHead>
                    <TableHead className="text-center">Grupos</TableHead>
                    <TableHead className="text-center">Membros (est.)</TableHead>
                    <TableHead className="text-center">Score médio</TableHead>
                    <TableHead className="text-center">Potencial</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(territoryQ.data ?? []).map((t) => (
                    <TableRow key={t.city_name}>
                      <TableCell className="text-xs font-bold">{t.city_name}{t.state_code ? `/${t.state_code}` : ""}</TableCell>
                      <TableCell className="text-center text-xs">{t.grupos}</TableCell>
                      <TableCell className="text-center text-xs">{Number(t.membros).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-center text-xs font-bold">{t.score_medio ?? "—"}</TableCell>
                      <TableCell className="text-center text-xs">{t.potencial_medio ?? "—"}%</TableCell>
                      <TableCell><Badge className={SITUACAO_STYLE[t.situacao] ?? ""}>{t.situacao.replace("_", " ")}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">💡 Inteligência territorial — onde agir</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              {(territoryQ.data ?? []).filter((t) => t.situacao === "descoberta").length > 0 && (
                <p>🎯 <strong>Regiões descobertas</strong> (0-1 grupo — vale buscar parceiros):{" "}
                  {(territoryQ.data ?? []).filter((t) => t.situacao === "descoberta").map((t) => t.city_name).join(", ")}
                </p>
              )}
              {(territoryQ.data ?? []).filter((t) => t.situacao === "saturada").length > 0 && (
                <p>⚠️ <strong>Regiões saturadas</strong> (20+ grupos — priorizar qualidade):{" "}
                  {(territoryQ.data ?? []).filter((t) => t.situacao === "saturada").map((t) => t.city_name).join(", ")}
                </p>
              )}
              {(territoryQ.data ?? []).filter((t) => Number(t.potencial_medio) >= 70).length > 0 && (
                <p>🚀 <strong>Alto potencial comercial</strong> (campanhas valem aqui):{" "}
                  {(territoryQ.data ?? []).filter((t) => Number(t.potencial_medio) >= 70).map((t) => t.city_name).join(", ")}
                </p>
              )}
              {(territoryQ.data ?? []).length === 0 && (
                <p className="text-muted-foreground">Sem dados territoriais ainda — cadastre grupos com cidade.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
