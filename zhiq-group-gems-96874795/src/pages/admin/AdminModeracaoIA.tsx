/**
 * Moderação IA de Imagens — Painel Administrativo do Marketplace.
 *
 * Consome as RPCs imgmod_overview/imgmod_list (admin-gated) e a edge
 * moderate-image (ações manual_decision/preview). Nenhuma imagem em
 * quarentena é pública: o preview usa URL assinada de 10 minutos
 * gerada pela edge com service role. (A página AdminImageModeration
 * antiga segue existindo para a fila manual legada de imóveis.)
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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
  ShieldCheck, ShieldAlert, ShieldX, Eye, CheckCircle2, XCircle,
  Loader2, Images, Gauge, CalendarDays, Bot,
} from "lucide-react";

type Overview = {
  total: number; aprovadas: number; bloqueadas: number; pendentes: number;
  hoje: number; mes: number; confianca_media: number;
  motivos: { motivo: string; total: number }[];
};
type Rec = {
  id: string; user_id: string; user_name: string | null;
  listing_id: string | null; listing_title: string | null;
  file_name: string; storage_bucket: string | null; storage_path: string | null;
  status: string; confidence: number; category: string; reason: string;
  provider: string; reviewed_by: string | null; reviewed_at: string | null;
  created_at: string;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  approved:        { label: "🟢 Aprovada (IA)",    cls: "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30" },
  manual_approved: { label: "🟢 Aprovada (admin)", cls: "bg-emerald-600 text-white" },
  manual_review:   { label: "🟡 Revisão manual",   cls: "bg-amber-500/20 text-amber-600 border border-amber-500/40" },
  blocked:         { label: "🔴 Bloqueada (IA)",   cls: "bg-red-500/15 text-red-600 border border-red-500/30" },
  manual_rejected: { label: "🔴 Rejeitada (admin)", cls: "bg-red-600 text-white" },
};
const CATEGORIA: Record<string, string> = {
  ok: "OK", conteudo_adulto: "Conteúdo adulto", violencia: "Violência",
  drogas: "Drogas", armas: "Armas", odio_extremismo: "Ódio/extremismo",
  fraude_golpe: "Fraude/golpe", documento_suspeito: "Documento suspeito",
  produto_proibido: "Produto proibido", spam_visual: "Spam visual",
  qualidade_baixa: "Qualidade baixa", outro: "Outro",
};
const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function AdminModeracaoIA() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = (name: string, args?: object) => (supabase.rpc as any)(name, args);

  const overviewQ = useQuery({
    queryKey: ["imgmod-overview"],
    queryFn: async (): Promise<Overview | null> => {
      const { data, error } = await rpc("imgmod_overview");
      if (error) throw new Error(error.message);
      return data as Overview | null;
    },
    refetchInterval: 30_000,
  });

  const listQ = useQuery({
    queryKey: ["imgmod-list"],
    queryFn: async (): Promise<Rec[]> => {
      const { data, error } = await rpc("imgmod_list", { p_status: null, p_limit: 300 });
      if (error) throw new Error(error.message);
      return (data ?? []) as Rec[];
    },
    refetchInterval: 30_000,
  });

  const ov = overviewQ.data;
  const rows = listQ.data ?? [];
  const fila = rows.filter((r) => r.status === "manual_review");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "todos" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.file_name, r.user_name, r.listing_title, r.reason, r.category]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [rows, statusFilter, search]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["imgmod-overview"] });
    qc.invalidateQueries({ queryKey: ["imgmod-list"] });
  };

  const loadPreview = async (recordId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("moderate-image", {
        body: { action: "preview", record_id: recordId },
      });
      if (error) throw new Error(error.message);
      if (!data?.url) throw new Error(data?.error || "Sem preview");
      setPreviews((p) => ({ ...p, [recordId]: data.url }));
    } catch (e: any) {
      toast.error("Falha ao carregar preview", { description: e.message });
    }
  };

  const decide = async (recordId: string, approve: boolean) => {
    setBusyId(recordId);
    try {
      const { data, error } = await supabase.functions.invoke("moderate-image", {
        body: { action: "manual_decision", record_id: recordId, decision: approve ? "approve" : "reject" },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Falha na decisão");
      toast.success(approve ? "Imagem aprovada e publicada" : "Imagem rejeitada e descartada");
      refresh();
    } catch (e: any) {
      toast.error("Falha na decisão", { description: e.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-orange-500 shadow-lg">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black leading-tight">Moderação IA de Imagens</h1>
          <p className="text-xs text-muted-foreground">
            100% das imagens do Marketplace passam pela IA antes de existir em público
          </p>
        </div>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Card><CardContent className="p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Images className="h-3.5 w-3.5 text-primary" /> Analisadas</p>
          <p className="mt-0.5 text-lg font-black">{ov?.total ?? "…"}</p>
          <p className="text-[10px] text-muted-foreground">{ov?.hoje ?? 0} hoje · {ov?.mes ?? 0} no mês</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Aprovadas</p>
          <p className="mt-0.5 text-lg font-black text-emerald-600">{ov?.aprovadas ?? "…"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><ShieldX className="h-3.5 w-3.5 text-red-500" /> Bloqueadas</p>
          <p className="mt-0.5 text-lg font-black text-red-600">{ov?.bloqueadas ?? "…"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><ShieldAlert className="h-3.5 w-3.5 text-amber-500" /> Pendentes</p>
          <p className="mt-0.5 text-lg font-black text-amber-600">{ov?.pendentes ?? "…"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Gauge className="h-3.5 w-3.5 text-primary" /> Confiança média</p>
          <p className="mt-0.5 text-lg font-black">{ov?.confianca_media ?? "…"}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Bot className="h-3.5 w-3.5 text-violet-500" /> Motivo nº 1</p>
          <p className="mt-0.5 truncate text-sm font-black">
            {ov?.motivos?.[0] ? `${CATEGORIA[ov.motivos[0].motivo] ?? ov.motivos[0].motivo} (${ov.motivos[0].total})` : "—"}
          </p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="fila">
        <TabsList>
          <TabsTrigger value="fila">
            Fila de Revisão {fila.length > 0 && <Badge className="ml-1.5 bg-amber-500 text-black">{fila.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="historico">Histórico completo</TabsTrigger>
        </TabsList>

        {/* ── FILA DE REVISÃO ── */}
        <TabsContent value="fila" className="space-y-3">
          {fila.length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              Fila limpa — nenhuma imagem aguardando revisão. ✓
            </CardContent></Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fila.map((r) => (
              <Card key={r.id} className="overflow-hidden">
                <div className="flex h-44 items-center justify-center bg-muted/50">
                  {previews[r.id] ? (
                    <img src={previews[r.id]} alt={r.file_name} className="h-full w-full object-contain" />
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => loadPreview(r.id)}>
                      <Eye className="mr-1.5 h-4 w-4" /> Ver imagem (URL assinada)
                    </Button>
                  )}
                </div>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold">{r.file_name}</p>
                    <Badge variant="outline">{r.confidence}%</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {CATEGORIA[r.category] ?? r.category} — {r.reason}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.user_name || r.user_id.slice(0, 8)} · {r.listing_title || "sem anúncio"} · {fmtDT(r.created_at)}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={busyId === r.id} onClick={() => decide(r.id, true)}>
                      {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                      Aprovar
                    </Button>
                    <Button size="sm" variant="destructive" className="flex-1"
                      disabled={busyId === r.id} onClick={() => decide(r.id, false)}>
                      <XCircle className="mr-1 h-4 w-4" /> Rejeitar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── HISTÓRICO ── */}
        <TabsContent value="historico" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Buscar por arquivo, usuário, anúncio ou motivo…"
              value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {Object.entries(STATUS_BADGE).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><CalendarDays className="h-3.5 w-3.5" /></TableHead>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Anúncio</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Confiança</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listQ.isLoading && (
                      <TableRow><TableCell colSpan={8} className="py-8 text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                      </TableCell></TableRow>
                    )}
                    {!listQ.isLoading && filtered.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        Nenhuma análise registrada ainda.
                      </TableCell></TableRow>
                    )}
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-[11px]">{fmtDT(r.created_at)}</TableCell>
                        <TableCell className="max-w-36 truncate text-xs font-bold">{r.file_name}</TableCell>
                        <TableCell className="max-w-28 truncate text-xs">{r.user_name || "—"}</TableCell>
                        <TableCell className="max-w-32 truncate text-xs">{r.listing_title || "—"}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_BADGE[r.status]?.cls ?? ""}>{STATUS_BADGE[r.status]?.label ?? r.status}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs font-bold">{r.confidence}%</TableCell>
                        <TableCell className="text-xs">{CATEGORIA[r.category] ?? r.category}</TableCell>
                        <TableCell className="max-w-52 truncate text-[11px]" title={r.reason}>{r.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
