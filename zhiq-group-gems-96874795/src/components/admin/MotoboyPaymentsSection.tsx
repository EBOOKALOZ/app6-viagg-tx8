import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet, CreditCard, Banknote, Loader2, CheckCircle, AlertCircle, Ban, FileText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ReceiptModal, MotoboyPaymentReceiptData } from "@/components/receipts";

type MotoboyWithBalance = {
  user_id: string;
  name: string | null;
  email: string | null;
  saldo_atual: number;
  has_pix: boolean;
  has_bank_account: boolean;
  pix_chave?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  status: "a_pagar" | "sem_dados" | "pago";
};

type PaymentFormData = {
  valor: string;
  data_pagamento: string;
  observacao: string;
};

export function MotoboyPaymentsSection() {
  const { user, displayName } = useAuth();
  const [selectedMotoboy, setSelectedMotoboy] = useState<MotoboyWithBalance | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>({
    valor: "",
    data_pagamento: new Date().toISOString().split("T")[0],
    observacao: "",
  });
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<MotoboyPaymentReceiptData | null>(null);
  const queryClient = useQueryClient();

  // Fetch motoboys with balance and bank data
  const { data: motoboys, isLoading } = useQuery({
    queryKey: ["admin-motoboy-payments"],
    queryFn: async () => {
      // Get all motoboy profiles
      const { data: motoboyProfiles, error: profilesError } = await supabase
        .from("motoboy_profiles")
        .select("user_id");

      if (profilesError) throw profilesError;

      const userIds = motoboyProfiles?.map((p) => p.user_id) || [];
      if (userIds.length === 0) return [];

      // Get profiles data
      const { data: profiles, error: profilesDataError } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);

      if (profilesDataError) throw profilesDataError;

      // Get bank data
      const { data: bankData, error: bankError } = await supabase
        .from("motoboy_bank_data")
        .select("user_id, pix_chave, banco, agencia, conta")
        .in("user_id", userIds);

      if (bankError) throw bankError;

      // Get wallet balances for each user
      const balancePromises = userIds.map(async (userId) => {
        const { data: balanceData } = await supabase.rpc("get_motoboy_wallet_balance", {
          _user_id: userId,
        });
        return {
          user_id: userId,
          balance: balanceData?.[0] || { saldo_total: 0 },
        };
      });

      const balances = await Promise.all(balancePromises);

      // Combine data
      const result: MotoboyWithBalance[] = userIds.map((userId) => {
        const profile = profiles?.find((p) => p.id === userId);
        const bank = bankData?.find((b) => b.user_id === userId);
        const balanceInfo = balances.find((b) => b.user_id === userId);
        
        const saldo = Number(balanceInfo?.balance?.saldo_total) || 0;

        const hasPix = !!bank?.pix_chave;
        const hasBankAccount = !!bank?.banco;

        let status: "a_pagar" | "sem_dados" | "pago" = "pago";
        if (saldo > 0) {
          status = hasPix || hasBankAccount ? "a_pagar" : "sem_dados";
        }

        return {
          user_id: userId,
          name: profile?.name || null,
          email: profile?.email || null,
          saldo_atual: saldo,
          has_pix: hasPix,
          has_bank_account: hasBankAccount,
          pix_chave: bank?.pix_chave || null,
          banco: bank?.banco || null,
          agencia: bank?.agencia || null,
          conta: bank?.conta || null,
          status,
        };
      });

      // Sort: a_pagar first, then sem_dados, then pago
      return result.sort((a, b) => {
        const order = { a_pagar: 0, sem_dados: 1, pago: 2 };
        return order[a.status] - order[b.status];
      });
    },
  });

  // Mutation to register payment
  const registerPaymentMutation = useMutation({
    mutationFn: async ({
      userId,
      valor,
      observacao,
      motoboyName,
      motoboyEmail,
      paymentMethod,
      bankDetails,
    }: {
      userId: string;
      valor: number;
      observacao: string;
      motoboyName: string;
      motoboyEmail: string;
      paymentMethod: string;
      bankDetails: {
        pix_chave?: string;
        banco?: string;
        agencia?: string;
        conta?: string;
      };
    }) => {
      // Insert payment transaction (negative value to reduce balance)
      const { error: txError } = await supabase.from("motoboy_wallet_transactions").insert({
        user_id: userId,
        tipo: "saque",
        valor: -valor, // Negative to reduce balance
        descricao: observacao || "Pagamento manual administrativo",
        referencia_id: null,
      });

      if (txError) throw txError;

      // Create payment receipt
      const { data: receiptInsert, error: receiptError } = await supabase
        .from("payment_receipts")
        .insert({
          receipt_type: "motoboy_payment",
          user_id: userId,
          amount: valor,
          payment_method: paymentMethod,
          payment_date: new Date().toISOString(),
          paid_by: user?.id,
          details: {
            motoboy_name: motoboyName,
            motoboy_email: motoboyEmail,
            paid_by_name: displayName || "Administrador",
            ...bankDetails,
          },
        })
        .select()
        .single();

      if (receiptError) {
        console.error("Error creating receipt:", receiptError);
        // Don't fail the whole operation for receipt error
      }

      return { receiptInsert, motoboyName, motoboyEmail, bankDetails };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-motoboy-payments"] });
      
      // Show receipt
      if (data) {
        setReceiptData({
          id: data.receiptInsert?.id || crypto.randomUUID(),
          receipt_hash: data.receiptInsert?.receipt_hash || crypto.randomUUID().slice(0, 16),
          motoboy_name: data.motoboyName,
          motoboy_email: data.motoboyEmail,
          amount: parseFloat(paymentForm.valor),
          payment_method: data.bankDetails.pix_chave ? "PIX" : "Transferência Bancária",
          payment_date: new Date().toISOString(),
          paid_by_name: displayName || "Administrador",
          details: data.bankDetails,
        });
        setShowReceipt(true);
      }

      setSelectedMotoboy(null);
      setPaymentForm({
        valor: "",
        data_pagamento: new Date().toISOString().split("T")[0],
        observacao: "",
      });
      toast.success("Pagamento registrado com sucesso!");
    },
    onError: (error) => {
      console.error("Error registering payment:", error);
      toast.error("Erro ao registrar pagamento");
    },
  });

  const handleOpenPaymentModal = (motoboy: MotoboyWithBalance) => {
    setSelectedMotoboy(motoboy);
    setPaymentForm({
      valor: motoboy.saldo_atual.toFixed(2),
      data_pagamento: new Date().toISOString().split("T")[0],
      observacao: "",
    });
  };

  const handleSubmitPayment = () => {
    if (!selectedMotoboy) return;

    const valor = parseFloat(paymentForm.valor);
    if (isNaN(valor) || valor <= 0) {
      toast.error("Informe um valor válido");
      return;
    }

    if (valor > selectedMotoboy.saldo_atual) {
      toast.error("O valor não pode ser maior que o saldo disponível");
      return;
    }

    const paymentMethod = selectedMotoboy.has_pix ? "PIX" : "Transferência Bancária";
    
    registerPaymentMutation.mutate({
      userId: selectedMotoboy.user_id,
      valor,
      observacao: `Pagamento em ${format(new Date(paymentForm.data_pagamento), "dd/MM/yyyy", { locale: ptBR })}${paymentForm.observacao ? ` - ${paymentForm.observacao}` : ""}`,
      motoboyName: selectedMotoboy.name || "Sem nome",
      motoboyEmail: selectedMotoboy.email || "",
      paymentMethod,
      bankDetails: {
        pix_chave: selectedMotoboy.pix_chave || undefined,
        banco: selectedMotoboy.banco || undefined,
        agencia: selectedMotoboy.agencia || undefined,
        conta: selectedMotoboy.conta || undefined,
      },
    });
  };

  const getStatusBadge = (status: "a_pagar" | "sem_dados" | "pago") => {
    switch (status) {
      case "a_pagar":
        return (
          <Badge className="bg-yellow-600 text-white">
            <Wallet className="h-3 w-3 mr-1" />A Pagar
          </Badge>
        );
      case "sem_dados":
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Sem Dados
          </Badge>
        );
      case "pago":
        return (
          <Badge className="bg-green-600 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Quitado
          </Badge>
        );
    }
  };

  const getBankDataBadges = (motoboy: MotoboyWithBalance) => {
    return (
      <div className="flex gap-1">
        {motoboy.has_pix ? (
          <Badge variant="outline" className="text-xs border-green-500 text-green-600">
            PIX
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs border-muted text-muted-foreground">
            <Ban className="h-2 w-2 mr-1" />
            PIX
          </Badge>
        )}
        {motoboy.has_bank_account ? (
          <Badge variant="outline" className="text-xs border-green-500 text-green-600">
            Conta
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs border-muted text-muted-foreground">
            <Ban className="h-2 w-2 mr-1" />
            Conta
          </Badge>
        )}
      </div>
    );
  };

  const motoboysToPay = motoboys?.filter((m) => m.status === "a_pagar") || [];
  const motoboysNoData = motoboys?.filter((m) => m.status === "sem_dados") || [];
  const motoboysPaid = motoboys?.filter((m) => m.status === "pago") || [];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <Banknote className="h-6 w-6 text-primary" />
          <div>
            <CardTitle>Pagamentos de Motoboys</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {motoboysToPay.length} a pagar • {motoboysNoData.length} sem dados bancários
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : motoboys && motoboys.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Motoboy</TableHead>
                    <TableHead>Saldo</TableHead>
                    <TableHead>Dados Bancários</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {motoboys.map((motoboy) => (
                    <TableRow key={motoboy.user_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{motoboy.name || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">{motoboy.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono font-bold ${motoboy.saldo_atual > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          R$ {motoboy.saldo_atual.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>{getBankDataBadges(motoboy)}</TableCell>
                      <TableCell>{getStatusBadge(motoboy.status)}</TableCell>
                      <TableCell className="text-right">
                        {motoboy.status === "a_pagar" && (
                          <Button
                            size="sm"
                            onClick={() => handleOpenPaymentModal(motoboy)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CreditCard className="h-4 w-4 mr-1" />
                            Pagar
                          </Button>
                        )}
                        {motoboy.status === "sem_dados" && (
                          <span className="text-xs text-muted-foreground">
                            Aguardando cadastro
                          </span>
                        )}
                        {motoboy.status === "pago" && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              Nenhum motoboy cadastrado.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Modal de Pagamento */}
      <Dialog open={!!selectedMotoboy} onOpenChange={() => setSelectedMotoboy(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Registrar Pagamento
            </DialogTitle>
          </DialogHeader>

          {selectedMotoboy && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="font-medium">{selectedMotoboy.name || "Sem nome"}</p>
                <p className="text-sm text-muted-foreground">{selectedMotoboy.email}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Saldo disponível:</span>
                  <span className="font-mono font-bold text-green-600">
                    R$ {selectedMotoboy.saldo_atual.toFixed(2)}
                  </span>
                </div>
                <div className="mt-2">{getBankDataBadges(selectedMotoboy)}</div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Valor Pago (R$) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={selectedMotoboy.saldo_atual}
                    value={paymentForm.valor}
                    onChange={(e) => setPaymentForm({ ...paymentForm, valor: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Data do Pagamento *</label>
                  <Input
                    type="date"
                    value={paymentForm.data_pagamento}
                    onChange={(e) => setPaymentForm({ ...paymentForm, data_pagamento: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Observação</label>
                  <Textarea
                    value={paymentForm.observacao}
                    onChange={(e) => setPaymentForm({ ...paymentForm, observacao: e.target.value })}
                    placeholder="Ex: Transferência PIX realizada"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedMotoboy(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitPayment}
              disabled={registerPaymentMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {registerPaymentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      {receiptData && (
        <ReceiptModal
          open={showReceipt}
          onClose={() => {
            setShowReceipt(false);
            setReceiptData(null);
          }}
          type="motoboy_payment"
          data={receiptData}
        />
      )}
    </>
  );
}
