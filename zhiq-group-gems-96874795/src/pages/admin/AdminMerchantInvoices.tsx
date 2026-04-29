import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Store,
  Loader2,
  CheckCircle,
  Clock,
  TrendingUp,
  Wallet,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  MapPin,
  Users
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MerchantFinancialHistory } from "./MerchantFinancialHistory";

type MerchantWithBalance = {
  user_id: string;
  store_id: string;
  nome_loja: string | null;
  owner_name: string | null;
  owner_email: string | null;
  cidade: string | null;
  estado: string | null;
  balance_cents: number;
  reserved_cents: number;
  gross_added_cents: number;
  total_debited_cents: number;
  last_movement_at: string | null;
  status_code: "ativo" | "saldo_baixo" | "sem_saldo" | string;
};

const AdminMerchantInvoices = () => {
  const [expandedMerchantId, setExpandedMerchantId] = useState<string | null>(null);

  // Fetch merchants with balance
  const { data: merchants, isLoading, error } = useQuery({
    queryKey: ["admin-merchant-invoices"],
    queryFn: async () => {
      // Direct query to financial_accounts for merchants
      const { data: accounts, error: accountsError } = await supabase
        .from("financial_accounts")
        .select(`
          owner_user_id,
          available_balance,
          reserved_balance,
          pending_balance,
          last_movement_at,
          profile_type
        `)
        .eq("profile_type", "merchant")
        .eq("is_active", true);

      if (accountsError) {
        console.error("Erro ao carregar financial_accounts:", accountsError);
        throw accountsError;
      }

      if (!accounts || accounts.length === 0) return [];

      // Fetch store names and profile emails
      const userIds = accounts.map(a => a.owner_user_id);
      
      const { data: stores } = await supabase
        .from("merchant_stores")
        .select("user_id, nome_loja, street, neighborhood, cidade, estado")
        .in("user_id", userIds);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      const storesMap: Record<string, any> = {};
      (stores || []).forEach(s => { storesMap[s.user_id] = s; });

      const profilesMap: Record<string, any> = {};
      (profiles || []).forEach(p => { profilesMap[p.id] = p; });

      const result: MerchantWithBalance[] = accounts.map((account: any) => {
        const userId = account.owner_user_id;
        const store = storesMap[userId];
        const profile = profilesMap[userId];

        const balanceCents = Math.round((account.available_balance || 0) * 100);
        const reservedCents = Math.round((account.reserved_balance || 0) * 100);
        
        let status_code = "ativo";
        if (balanceCents <= 0) status_code = "sem_saldo";
        else if (balanceCents < 5000) status_code = "saldo_baixo"; // Less than R$ 50

        return {
          user_id: userId,
          store_id: store?.id || "",
          nome_loja: store?.nome_loja || profile?.full_name || "Loja sem nome",
          owner_name: profile?.full_name || "Sem nome",
          owner_email: profile?.email || null,
          cidade: store?.cidade || null,
          estado: store?.estado || null,
          balance_cents: balanceCents,
          reserved_cents: reservedCents,
          gross_added_cents: 0, // Not available directly in financial_accounts
          total_debited_cents: 0, // Not available directly in financial_accounts
          last_movement_at: account.last_movement_at,
          status_code: status_code
        };
      });

      return result.sort((a, b) => {
        const order: Record<string, number> = { sem_saldo: 0, saldo_baixo: 1, ativo: 2 };
        const orderA = order[a.status_code] ?? 3;
        const orderB = order[b.status_code] ?? 3;
        return orderA - orderB;
      });
    },
  });



  const getStatusBadge = (status: "ativo" | "saldo_baixo" | "sem_saldo") => {
    switch (status) {
      case "ativo":
        return (
          <Badge className="bg-green-600 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Ativo
          </Badge>
        );
      case "saldo_baixo":
        return (
          <Badge className="bg-yellow-600 text-white">
            <Clock className="h-3 w-3 mr-1" />
            Saldo Baixo
          </Badge>
        );
      case "sem_saldo":
        return (
          <Badge variant="destructive">
            <Wallet className="h-3 w-3 mr-1" />
            Sem Saldo
          </Badge>
        );
    }
  };

  const merchantsNoBalance = merchants?.filter((m) => m.status_code === "sem_saldo") || [];
  const merchantsLowBalance = merchants?.filter((m) => m.status_code === "saldo_baixo") || [];
  const merchantsActive = merchants?.filter((m) => m.status_code === "ativo") || [];

  const totalCadastrados = merchants?.length || 0;
  const totalAtivos = merchants?.filter((m) => m.status_code === "ativo").length || 0;

  const cidadesSet = new Set(merchants?.map(m => m.cidade?.trim().toUpperCase()).filter(Boolean));
  const totalCidades = cidadesSet.size;

  const getDistribuiCidades = () => {
    if (!merchants) return [];
    const counts: Record<string, number> = {};
    merchants.forEach(m => {
      const cidade = m.cidade?.trim().toUpperCase();
      if (cidade) {
        counts[cidade] = (counts[cidade] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5); // top 5
  };

  const topCidades = getDistribuiCidades();

  console.log("AdminMerchantInvoices debug:", { merchants, isLoading, error, merchantsNoBalance: merchantsNoBalance.length });

  return (
    <div className="mt-6 space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar dados financeiros</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao buscar as informações dos lojistas."}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Lojistas Ativos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAtivos}</div>
            <p className="text-xs text-muted-foreground mt-1">Lojistas com status ativo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Cadastrados</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCadastrados}</div>
            <p className="text-xs text-muted-foreground mt-1">Lojistas na base</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total de Cidades</CardTitle>
            <MapPin className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCidades}</div>
            <p className="text-xs text-muted-foreground mt-1">Cidades atendidas</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 border bg-muted/20">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground tracking-wider">Top 5 Cidades</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {topCidades.length > 0 ? topCidades.map(([cidade, count]) => (
                <div key={cidade} className="flex justify-between items-center text-sm">
                  <span className="truncate max-w-[120px] font-medium" title={cidade}>{cidade}</span>
                  <Badge variant="secondary" className="font-mono">{count}</Badge>
                </div>
              )) : (
                <span className="text-xs text-muted-foreground">Sem dados de cidade</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center gap-3">
          <Store className="h-6 w-6 text-primary" />
          <div>
            <CardTitle>Métricas Financeiras por Lojista</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {merchantsNoBalance.length} sem saldo • {merchantsLowBalance.length} saldo baixo • {merchantsActive.length} ativos
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : merchants && merchants.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>Saldo Atual</TableHead>
                    <TableHead>Reservado</TableHead>
                    <TableHead>Bruto Adicionado</TableHead>
                    <TableHead>Total Debitado</TableHead>
                    <TableHead>Última Movimentação</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merchants.map((merchant) => {
                    const displayName = merchant.nome_loja ?? merchant.owner_name ?? "Loja sem nome";

                    return (
                      <React.Fragment key={merchant.user_id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setExpandedMerchantId(expandedMerchantId === merchant.user_id ? null : merchant.user_id)}
                        >
                          <TableCell>
                            {expandedMerchantId === merchant.user_id ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{displayName}</p>
                              {merchant.owner_email && (
                                <p className="text-[10px] text-primary/70 truncate max-w-[200px]">{merchant.owner_email}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {merchant.cidade ? `${merchant.cidade}${merchant.estado ? ` - ${merchant.estado}` : ''}` : 'Local não informado'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`font-mono font-bold ${(merchant.balance_cents || 0) > 0 ? "text-green-600" : "text-destructive"}`}>
                              R$ {((merchant.balance_cents || 0) / 100).toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-amber-600">
                              R$ {((merchant.reserved_cents || 0) / 100).toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-emerald-600">
                              <TrendingUp className="h-4 w-4" />
                              <span className="font-mono text-sm">
                                R$ {((merchant.gross_added_cents || 0) / 100).toFixed(2)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-rose-600">
                              R$ {((merchant.total_debited_cents || 0) / 100).toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {merchant.last_movement_at ? new Date(merchant.last_movement_at).toLocaleDateString('pt-BR') : '-'}
                            </span>
                          </TableCell>
                          <TableCell>{getStatusBadge(merchant.status_code as any)}</TableCell>
                        </TableRow>
                        {expandedMerchantId === merchant.user_id && (
                          <TableRow className="bg-muted/10 hover:bg-muted/10">
                            <TableCell colSpan={8} className="p-0 border-b-0">
                              <div className="p-4 bg-muted/20 border-x border-b shadow-inner">
                                <MerchantFinancialHistory
                                  merchantId={merchant.user_id}
                                  merchantName={displayName}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              Nenhum lojista cadastrado.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminMerchantInvoices;
