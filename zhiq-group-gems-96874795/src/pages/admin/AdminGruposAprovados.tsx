/**
 * Grupos Aprovados pelo RADAR IA — página exclusiva do Painel Admin.
 *
 * FONTE ÚNICA: a mesma RPC do RADAR IA (radar_list_groups), cujo
 * status_aprovacao é derivado NO SERVIDOR com a régua oficial do motor
 * (91+ membros garantidos pelo trigger, sem duplicado, sem veto da IA,
 * ativo e localizado). Esta tela apenas FILTRA status = 'aprovado' —
 * nenhuma regra de negócio duplicada. Realtime: aprovou/reprovou em
 * qualquer lugar, a lista reage sozinha.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BadgeCheck, Users, Star, MapPin, Loader2, ExternalLink,
} from "lucide-react";

type GroupRow = {
  id: string; group_name: string; group_link: string; city_name: string;
  state_code: string; neighborhood: string; members_count: number;
  owner_name: string | null; score: number; classification: string;
  commercial_potential: number; analyzed_at: string | null;
  created_at: string; status_aprovacao: string;
};

const CLASS_STYLE: Record<string, string> = {
  "Excelente":       "bg-emerald-600 text-white",
  "Muito Bom":       "bg-emerald-500/20 text-emerald-600 border border-emerald-500/40",
  "Bom":             "bg-blue-500/15 text-blue-600 border border-blue-500/30",
  "Regular":         "bg-amber-500/15 text-amber-600 border border-amber-500/30",
};

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

export default function AdminGruposAprovados() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [cidade, setCidade] = useState("todas");
  const [categoria, setCategoria] = useState("todas");
  const [scoreMin, setScoreMin] = useState("0");
  const [membrosMin, setMembrosMin] = useState("0");
  const [periodo, setPeriodo] = useState("todos");

  const groupsQ = useQuery({
    queryKey: ["radar-groups-aprovados"],
    queryFn: async (): Promise<GroupRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("radar_list_groups", { p_limit: 1000 });
      if (error) throw new Error(error.message);
      // Único filtro desta tela: status oficial 'aprovado' vindo do servidor
      return ((data ?? []) as GroupRow[]).filter((g) => g.status_aprovacao === "aprovado");
    },
    refetchInterval: 30_000,
  });

  // Realtime: qualquer aprovação/reprovação reflete aqui sem recarregar
  useEffect(() => {
    const ch = supabase
      .channel("grupos-aprovados-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_groups" },
        () => qc.invalidateQueries({ queryKey: ["radar-groups-aprovados"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "radar_group_scores" },
        () => qc.invalidateQueries({ queryKey: ["radar-groups-aprovados"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const rows = groupsQ.data ?? [];

  const cidades = useMemo(
    () => Array.from(new Set(rows.map((g) => g.city_name).filter(Boolean))).sort(),
    [rows],
  );
  const categorias = useMemo(
    () => Array.from(new Set(rows.map((g) => g.neighborhood || "Geral"))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = periodo === "7d" ? Date.now() - 7 * 864e5
      : periodo === "30d" ? Date.now() - 30 * 864e5 : 0;
    return rows.filter((g) => {
      if (cidade !== "todas" && g.city_name !== cidade) return false;
      if (categoria !== "todas" && (g.neighborhood || "Geral") !== categoria) return false;
      if ((g.score ?? 0) < Number(scoreMin)) return false;
      if ((g.members_count ?? 0) < Number(membrosMin)) return false;
      if (cutoff && new Date(g.analyzed_at ?? g.created_at).getTime() < cutoff) return false;
      if (!q) return true;
      return [g.group_name, g.group_link].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [rows, search, cidade, categoria, scoreMin, membrosMin, periodo]);

  const totalMembros = filtered.reduce((a, g) => a + (g.members_count ?? 0), 0);
  const scoreMedio = filtered.length
    ? Math.round(filtered.reduce((a, g) => a + (g.score ?? 0), 0) / filtered.length)
    : 0;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 shadow-lg">
          <BadgeCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black leading-tight">Grupos Aprovados pelo RADAR IA</h1>
          <p className="text-xs text-muted-foreground">
            Somente grupos que passaram por TODAS as regras (91+ membros, sem duplicidade, sem veto da IA)
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><BadgeCheck className="h-3.5 w-3.5 text-emerald-500" /> Aprovados</p>
          <p className="mt-0.5 text-lg font-black">{groupsQ.isLoading ? "…" : filtered.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Users className="h-3.5 w-3.5 text-primary" /> Membros (alcance)</p>
          <p className="mt-0.5 text-lg font-black">{totalMembros.toLocaleString("pt-BR")}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Star className="h-3.5 w-3.5 text-amber-500" /> Score médio</p>
          <p className="mt-0.5 text-lg font-black">{scoreMedio}</p>
        </CardContent></Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar por nome ou link…" value={search}
          onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={cidade} onValueChange={setCidade}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as cidades</SelectItem>
            {cidades.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={scoreMin} onValueChange={setScoreMin}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Qualquer score</SelectItem>
            <SelectItem value="60">Score 60+</SelectItem>
            <SelectItem value="75">Score 75+</SelectItem>
            <SelectItem value="90">Score 90+</SelectItem>
          </SelectContent>
        </Select>
        <Select value={membrosMin} onValueChange={setMembrosMin}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Qualquer nº de membros</SelectItem>
            <SelectItem value="91">91+</SelectItem>
            <SelectItem value="200">200+</SelectItem>
            <SelectItem value="500">500+</SelectItem>
          </SelectContent>
        </Select>
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Qualquer data</SelectItem>
            <SelectItem value="7d">Aprovados nos últimos 7 dias</SelectItem>
            <SelectItem value="30d">Aprovados nos últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead className="text-center">Membros</TableHead>
                  <TableHead className="text-center">Score IA</TableHead>
                  <TableHead>Classificação</TableHead>
                  <TableHead>Data da aprovação</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupsQ.isLoading && (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell></TableRow>
                )}
                {!groupsQ.isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                    <MapPin className="mx-auto mb-2 h-6 w-6 opacity-40" />
                    Nenhum grupo aprovado neste filtro. Assim que o RADAR IA aprovar um grupo
                    (91+ membros e demais critérios), ele aparece aqui automaticamente.
                  </TableCell></TableRow>
                )}
                {filtered.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="max-w-44 truncate text-xs font-bold">{g.group_name || "—"}</TableCell>
                    <TableCell className="text-xs">{g.city_name || "—"}{g.state_code ? `/${g.state_code}` : ""}</TableCell>
                    <TableCell className="text-xs">{g.neighborhood || "Geral"}</TableCell>
                    <TableCell>
                      {g.group_link ? (
                        <a href={g.group_link} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          abrir <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-center text-xs font-bold">{g.members_count ?? 0}</TableCell>
                    <TableCell className="text-center">
                      <p className="text-sm font-black">{g.score}</p>
                      <p className="text-[10px] text-amber-500">{"★".repeat(Math.max(1, Math.round((g.score ?? 0) / 20)))}</p>
                    </TableCell>
                    <TableCell>
                      <Badge className={CLASS_STYLE[g.classification] ?? ""}>{g.classification}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(g.analyzed_at ?? g.created_at)}</TableCell>
                    <TableCell className="max-w-32 truncate text-xs">{g.owner_name || "—"}</TableCell>
                    <TableCell><Badge className="bg-emerald-600 text-white">🟢 Aprovado</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
