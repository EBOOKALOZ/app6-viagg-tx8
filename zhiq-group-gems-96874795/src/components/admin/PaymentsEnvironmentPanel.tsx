/**
 * PaymentsEnvironmentPanel — Pagamentos (Mercado Pago) no Painel Financeiro
 * Admin, separando PRODUÇÃO × SANDBOX.
 *
 * Fonte: RPC admin_list_payment_orders (SECURITY DEFINER, só admin) sobre
 * pay_payment_orders — a etiqueta vem de metadata.environment ('sandbox' |
 * 'production'), carimbada pela edge payments-charge a cada ordem (backfill
 * 20260711 marcou o histórico). Sandbox flui pelo MESMO motor da produção
 * (ordem → webhook/simulador → ledger → carteira); aqui é só leitura +
 * identificação visual. Nunca mistura: cada linha tem o selo do ambiente.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, FlaskConical, Globe, Wallet } from "lucide-react";

type OrderRow = {
  id: string;
  created_at: string;
  paid_at: string | null;
  status: string;
  amount: number;
  provider_name: string;
  payer_owner_type: string;
  payer_owner_id: string;
  product_type: string | null;
  environment: string;
  kind: string;
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });

const KIND_LABEL: Record<string, string> = {
  wallet_topup: "Recarga de saldo",
  credit_package: "Pacote de créditos",
  travel: "Viagem",
};

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  waiting_payment: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  failed: "bg-red-500/15 text-red-600 border-red-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
};

function EnvBadge({ env }: { env: string }) {
  return env === "production" ? (
    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 gap-1">
      <Globe className="h-3 w-3" /> PRODUÇÃO
    </Badge>
  ) : (
    <Badge className="bg-amber-500 text-black hover:bg-amber-500 gap-1">
      <FlaskConical className="h-3 w-3" /> SANDBOX
    </Badge>
  );
}

export function PaymentsEnvironmentPanel() {
  const [envFilter, setEnvFilter] = useState<"todos" | "production" | "sandbox">("todos");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-payment-orders"],
    queryFn: async (): Promise<OrderRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("admin_list_payment_orders", {
        p_limit: 500,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as OrderRow[];
    },
    refetchInterval: 60_000,
  });

  const paid = useMemo(() => (orders ?? []).filter((o) => o.status === "paid"), [orders]);

  const totals = useMemo(() => {
    const sum = (rows: OrderRow[]) => rows.reduce((a, o) => a + Number(o.amount || 0), 0);
    const prod = paid.filter((o) => o.environment === "production");
    const sand = paid.filter((o) => o.environment !== "production");
    const now = new Date();
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startWeek = new Date(startDay); startWeek.setDate(startWeek.getDate() - startDay.getDay());
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const inRange = (rows: OrderRow[], from: Date) =>
      sum(rows.filter((o) => new Date(o.paid_at ?? o.created_at) >= from));
    const sel = envFilter === "todos" ? paid
      : envFilter === "production" ? prod : sand;
    return {
      prod: sum(prod), sand: sum(sand), total: sum(paid),
      dia: inRange(sel, startDay), semana: inRange(sel, startWeek), mes: inRange(sel, startMonth),
    };
  }, [paid, envFilter]);

  const visible = useMemo(() => {
    const base = orders ?? [];
    if (envFilter === "todos") return base;
    if (envFilter === "production") return base.filter((o) => o.environment === "production");
    return base.filter((o) => o.environment !== "production");
  }, [orders, envFilter]);

  const lastSandbox = useMemo(
    () => (orders ?? []).filter((o) => o.environment !== "production").slice(0, 10),
    [orders],
  );

  return (
    <div className="space-y-4">
      {/* Aviso de ambiente ativo */}
      <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2">
        <FlaskConical className="h-4 w-4 text-amber-500 shrink-0" />
        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
          Gateway Mercado Pago em modo SANDBOX — os pagamentos abaixo fluem pelo motor
          financeiro real (ledger, carteiras, comissões) com dinheiro fictício. Em produção,
          o painel é o mesmo: muda só o selo de cada transação.
        </p>
      </div>

      {/* Receita Produção × Sandbox × Total */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Globe className="h-3.5 w-3.5 text-emerald-500" /> Receita Produção
            </p>
            <p className="mt-1 text-xl font-black">{fmtBRL(totals.prod)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <FlaskConical className="h-3.5 w-3.5 text-amber-500" /> Receita Sandbox
            </p>
            <p className="mt-1 text-xl font-black">{fmtBRL(totals.sand)}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 text-primary" /> Receita Total
            </p>
            <p className="mt-1 text-xl font-black">{fmtBRL(totals.total)}</p>
            <p className="text-[10px] text-muted-foreground">Produção + Sandbox</p>
          </CardContent>
        </Card>
      </div>

      {/* Pagamentos com filtro de ambiente */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Pagamentos Mercado Pago</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Dia {fmtBRL(totals.dia)} · Semana {fmtBRL(totals.semana)} · Mês {fmtBRL(totals.mes)}
              {envFilter !== "todos" ? ` (${envFilter === "production" ? "produção" : "sandbox"})` : ""}
            </p>
          </div>
          <Select value={envFilter} onValueChange={(v) => setEnvFilter(v as typeof envFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="production">Produção</SelectItem>
              <SelectItem value="sandbox">Sandbox</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Pagador</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ambiente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                        Nenhum pagamento neste filtro.
                      </TableCell>
                    </TableRow>
                  )}
                  {visible.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="whitespace-nowrap text-xs">{fmtDate(o.created_at)}</TableCell>
                      <TableCell className="text-xs">{KIND_LABEL[o.kind] ?? o.kind}</TableCell>
                      <TableCell className="text-xs">{o.payer_owner_type}</TableCell>
                      <TableCell className="text-right text-xs font-bold">{fmtBRL(Number(o.amount))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLE[o.status] ?? ""}>
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell><EnvBadge env={o.environment} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auditoria: últimos pagamentos Sandbox */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-amber-500" />
            Últimos pagamentos Sandbox (auditoria)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lastSandbox.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-[10px]">{o.id.slice(0, 8)}…</TableCell>
                    <TableCell className="text-right text-xs font-bold">{fmtBRL(Number(o.amount))}</TableCell>
                    <TableCell className="text-xs">{o.provider_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLE[o.status] ?? ""}>
                        {o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(o.created_at)}</TableCell>
                    <TableCell className="font-mono text-[10px]">{o.payer_owner_id.slice(0, 8)}…</TableCell>
                    <TableCell className="text-xs">{KIND_LABEL[o.kind] ?? o.kind}</TableCell>
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
