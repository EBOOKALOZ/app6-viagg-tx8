import { Wallet, Info, ArrowDownCircle, ArrowUpCircle, Activity, Filter } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminFinancialStats } from "@/components/admin/financial/AdminFinancialStats";
import { AdminFinancialCharts } from "@/components/admin/financial/AdminFinancialCharts";

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const OWNER_LABEL: Record<string, { label: string; cls: string }> = {
  merchant_store: { label: "Lojista", cls: "bg-emerald-100 text-emerald-700" },
  motoboy_profile: { label: "Motoboy", cls: "bg-orange-100 text-orange-700" },
  advertiser_account: { label: "Anunciante", cls: "bg-violet-100 text-violet-700" },
  platform: { label: "Plataforma", cls: "bg-blue-100 text-blue-700" },
};

function useGlobalFinances() {
  return useQuery({
    queryKey: ["admin-global-finances"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_get_global_finances");
      if (error) {
        console.warn("[admin_get_global_finances]", error);
        return null;
      }
      return data;
    },
    staleTime: 30_000,
  });
}

function CategoryStrip() {
  const { data } = useGlobalFinances();
  const motoboyCommissions = data?.motoboy_commissions;
  const engagement = data?.engagement;
  const packagePurchases = data?.packages;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Card className="border-orange-300/40 bg-orange-50/40">
        <CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider font-bold text-orange-700 flex items-center gap-1.5">
            <ArrowDownCircle className="h-3 w-3" /> Comissão recebida de motoboys
          </p>
          <p className="text-2xl font-black text-orange-700 mt-1">
            {fmtBRL((motoboyCommissions?.total_cents ?? 0) / 100)}
          </p>
          <p className="text-[10px] text-orange-600/80 font-medium">{motoboyCommissions?.count ?? 0} entregas concluídas</p>
        </CardContent>
      </Card>

      <Card className="border-amber-300/40 bg-amber-50/40">
        <CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700 flex items-center gap-1.5">
            <Activity className="h-3 w-3" /> Engajamento (créditos consumidos)
          </p>
          <p className="text-2xl font-black text-amber-700 mt-1">
            {Number(engagement?.total_credits ?? 0).toLocaleString("pt-BR")} cr
          </p>
          <p className="text-[10px] text-amber-600/80 font-medium">{engagement?.count ?? 0} eventos cobrados</p>
        </CardContent>
      </Card>

      <Card className="border-emerald-300/40 bg-emerald-50/40">
        <CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 flex items-center gap-1.5">
            <ArrowDownCircle className="h-3 w-3" /> Pacotes de créditos adquiridos
          </p>
          <p className="text-2xl font-black text-emerald-700 mt-1">
            {(packagePurchases?.total_cents ?? 0) > 0
              ? fmtBRL((packagePurchases?.total_cents ?? 0) / 100)
              : `${Number(packagePurchases?.total_credits ?? 0).toLocaleString("pt-BR")} cr`}
          </p>
          <p className="text-[10px] text-emerald-600/80 font-medium">{packagePurchases?.count ?? 0} compras</p>
        </CardContent>
      </Card>
    </div>
  );
}

function GlobalLedger() {
  const [direction, setDirection] = useState<"all" | "credit" | "debit">("all");
  const [ownerType, setOwnerType] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: globalData, isLoading } = useGlobalFinances();
  const rows = (globalData?.ledger as any[]) ?? [];

  const filtered = useMemo(() => {
    return rows.filter((r: any) => {
      const dir = String(r.direction || "").toLowerCase();
      if (direction === "credit" && !["credit", "in", "inflow"].includes(dir)) return false;
      if (direction === "debit" && !["debit", "out", "outflow"].includes(dir)) return false;
      if (ownerType !== "all" && r.owner_type !== ownerType) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !(r.description || "").toLowerCase().includes(q) &&
          !(r.entry_type || "").toLowerCase().includes(q) &&
          !(r.reference_id || "").toLowerCase().includes(q) &&
          !(r.owner_id || "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rows, direction, ownerType, search]);

  const totals = useMemo(() => {
    let entradas = 0,
      saidas = 0,
      count = filtered.length;
    for (const r of filtered) {
      const dir = String(r.direction || "").toLowerCase();
      const amt = Number(r.amount || 0);
      if (["credit", "in", "inflow"].includes(dir)) entradas += amt;
      else if (["debit", "out", "outflow"].includes(dir)) saidas += amt;
    }
    return { entradas, saidas, liquido: entradas - saidas, count };
  }, [filtered]);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> Histórico Global de Movimentações
          <Badge variant="outline" className="ml-2 text-[10px]">
            {totals.count} eventos
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold flex items-center gap-1">
              <ArrowDownCircle className="h-3 w-3" /> Entradas
            </p>
            <p className="text-xl font-black text-emerald-700">{fmtBRL(totals.entradas)}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-red-700 font-bold flex items-center gap-1">
              <ArrowUpCircle className="h-3 w-3" /> Saídas
            </p>
            <p className="text-xl font-black text-red-700">{fmtBRL(totals.saidas)}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-blue-700 font-bold">Líquido</p>
            <p className={`text-xl font-black ${totals.liquido >= 0 ? "text-blue-700" : "text-red-700"}`}>
              {fmtBRL(totals.liquido)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar descrição, tipo, owner_id..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Direção" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as direções</SelectItem>
              <SelectItem value="credit">Entradas</SelectItem>
              <SelectItem value="debit">Saídas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ownerType} onValueChange={(v) => setOwnerType(v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tipo de conta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              <SelectItem value="merchant_store">Lojista</SelectItem>
              <SelectItem value="motoboy_profile">Motoboy</SelectItem>
              <SelectItem value="advertiser_account">Anunciante</SelectItem>
              <SelectItem value="platform">Plataforma</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Data</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Referência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">Carregando...</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">Nenhum movimento encontrado com os filtros atuais.</TableCell></TableRow>
              )}
              {filtered.slice(0, 200).map((r: any) => {
                const dir = String(r.direction || "").toLowerCase();
                const positive = ["credit", "in", "inflow"].includes(dir);
                const meta = OWNER_LABEL[r.owner_type] || { label: r.owner_type || "—", cls: "bg-zinc-100 text-zinc-700" };
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <Badge className={`text-[10px] w-fit ${meta.cls}`}>{meta.label}</Badge>
                        <span className="text-[9px] font-mono text-muted-foreground mt-0.5 truncate max-w-[160px]">
                          {r.owner_id || r.account_id?.slice(0, 8)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">{r.entry_type || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono text-sm font-bold ${positive ? "text-emerald-600" : "text-red-500"}`}>
                        {positive ? "+" : "−"}{fmtBRL(Number(r.amount || 0))}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate">{r.description || "—"}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground truncate max-w-[140px]">{r.reference_id || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

const AdminFinanceiro = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const getCurrentTab = () => {
    if (location.pathname.includes("faturas-lojistas")) return "faturas-lojistas";
    if (location.pathname.includes("relatorios")) return "relatorios";
    if (location.pathname.includes("ajustes")) return "ajustes";
    return "repasse-motoboys";
  };

  const currentTab = getCurrentTab();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-muted-foreground">
            Controle de repasses, faturas e ajustes manuais
          </p>
        </div>
      </div>

      <Alert className="border-primary/20 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          Os pagamentos reais são realizados manualmente fora do aplicativo.
          O sistema apenas registra e controla movimentações lógicas de Ledger.
        </AlertDescription>
      </Alert>

      <AdminFinancialStats />
      <CategoryStrip />
      <GlobalLedger />
      <div className="pt-2">
        <AdminFinancialCharts />
      </div>

      <Tabs value={currentTab} className="w-full mt-6">
        {/* Usando grid-cols-4 agora para comportar a nova aba */}
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger
            value="repasse-motoboys"
            onClick={() => navigate("/administrador/financeiro")}
          >
            Repasse Motoboys
          </TabsTrigger>
          <TabsTrigger
            value="faturas-lojistas"
            onClick={() => navigate("/administrador/financeiro/faturas-lojistas")}
          >
            Faturas Lojistas
          </TabsTrigger>
          <TabsTrigger
            value="ajustes"
            onClick={() => navigate("/administrador/financeiro/ajustes")}
          >
            Créditos / Ajustes
          </TabsTrigger>
          <TabsTrigger
            value="relatorios"
            onClick={() => navigate("/administrador/financeiro/relatorios")}
          >
            📊 Relatórios
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  );
};

export default AdminFinanceiro;
