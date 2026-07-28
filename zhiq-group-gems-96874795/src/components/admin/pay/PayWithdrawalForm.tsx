import { useState } from "react";
import { Banknote, Building2, User, Send, Save, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { usePayPlatformBankAccounts } from "@/hooks/useAdminPayBankAccounts";
import { useRequestWithdrawal } from "@/hooks/useAdminPayWithdrawals";
import { usePayTreasuryStats } from "@/hooks/useAdminPayTreasury";
import { formatBRL, validateWithdrawalAmount } from "@/skills/pay/payUtils";
import { WITHDRAWAL_FEE_PERCENT } from "@/skills/pay/payConstants";
import { toast } from "sonner";

export default function PayWithdrawalForm() {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [observation, setObservation] = useState("");

  const { data: accounts } = usePayPlatformBankAccounts();
  const { data: stats } = usePayTreasuryStats();
  const requestMutation = useRequestWithdrawal();

  const amountCents = Math.round(parseFloat(amountInput.replace(",", ".") || "0") * 100);
  const feeCents = Math.round(amountCents * WITHDRAWAL_FEE_PERCENT);
  const netCents = amountCents - feeCents;
  const availableCents = stats?.availableForWithdrawalCents || 0;

  const validation = amountCents > 0
    ? validateWithdrawalAmount(amountCents, availableCents)
    : { valid: false, error: undefined };

  const selectedAccount = accounts?.find(a => a.id === selectedAccountId);

  const handleSubmit = async () => {
    if (!validation.valid || !selectedAccountId) return;
    try {
      await requestMutation.mutateAsync({
        amountCents,
        destinationAccountId: selectedAccountId,
        observation: observation || undefined,
      });
      toast.success("Solicitação de saque criada com sucesso", {
        description: `${formatBRL(amountCents)} — Status: Aguardando Aprovação`,
      });
      setAmountInput("");
      setObservation("");
    } catch (err: unknown) {
      toast.error("Erro na solicitação", { description: err instanceof Error ? err.message : "Erro desconhecido" });
    }
  };

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Banknote className="h-4 w-4 text-white" />
          </div>
          <div>
            <CardTitle className="text-sm font-black tracking-tight">Solicitar Saque</CardTitle>
            <p className="text-[10px] text-muted-foreground">Transferência para conta bancária cadastrada</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ─── Available Balance ─── */}
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-xl p-4 border border-emerald-100 dark:border-emerald-900/50">
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider mb-1">Saldo Disponível para Saque</p>
          <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{formatBRL(availableCents)}</p>
        </div>

        {/* ─── Bank Account Selector ─── */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Conta de Destino</label>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="h-11 text-xs">
              <SelectValue placeholder="Selecione a conta bancária..." />
            </SelectTrigger>
            <SelectContent>
              {(!accounts || accounts.length === 0) ? (
                <SelectItem value="none" disabled>Nenhuma conta cadastrada</SelectItem>
              ) : (
                accounts.filter(a => a.is_active).map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    <div className="flex items-center gap-2">
                      {a.account_type === "business" ? (
                        <Building2 className="h-3.5 w-3.5 text-indigo-500" />
                      ) : (
                        <User className="h-3.5 w-3.5 text-blue-500" />
                      )}
                      <span className="font-medium">{a.bank_name || a.bank_code || "Banco"}</span>
                      <span className="text-muted-foreground">· {a.pix_key || `Ag ${a.branch} Cc ${a.account_number}`}</span>
                      {a.is_default && <Badge className="text-[8px] bg-emerald-100 text-emerald-700 ml-1">Padrão</Badge>}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {selectedAccount && (
            <div className="bg-muted/30 rounded-lg p-2.5 mt-1">
              <div className="flex items-center gap-2 text-[10px]">
                <Badge className={`text-[8px] ${selectedAccount.account_type === "business" ? "bg-indigo-100 text-indigo-700" : "bg-blue-100 text-blue-700"}`}>
                  {selectedAccount.account_type === "business" ? "Empresarial" : "Pessoal"}
                </Badge>
                <span className="font-medium">{selectedAccount.holder_name || "—"}</span>
                <span className="text-muted-foreground">· {selectedAccount.holder_document || "—"}</span>
              </div>
            </div>
          )}
        </div>

        {/* ─── Amount ─── */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Valor do Saque (R$)</label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-sm font-bold text-muted-foreground">R$</span>
            <Input
              type="text"
              placeholder="0,00"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              className="pl-10 h-11 text-lg font-bold"
            />
          </div>
          {validation.error && amountCents > 0 && (
            <p className="text-[10px] text-red-500 flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" /> {validation.error}
            </p>
          )}
        </div>

        {/* ─── Observation ─── */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Observação</label>
          <Textarea
            placeholder="Motivo do saque, referência, etc..."
            value={observation}
            onChange={e => setObservation(e.target.value)}
            className="min-h-[60px] text-xs resize-none"
          />
        </div>

        {/* ─── Fee Estimate ─── */}
        {amountCents > 0 && (
          <div className="bg-muted/20 rounded-xl p-3 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor solicitado</span>
              <span className="font-bold">{formatBRL(amountCents)}</span>
            </div>
            {feeCents > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa estimada ({(WITHDRAWAL_FEE_PERCENT * 100).toFixed(1)}%)</span>
                <span className="font-bold text-red-500">-{formatBRL(feeCents)}</span>
              </div>
            )}
            <div className="border-t pt-1 flex justify-between">
              <span className="font-bold">Valor líquido estimado</span>
              <span className="font-black text-emerald-600">{formatBRL(netCents)}</span>
            </div>
          </div>
        )}

        {/* ─── Actions ─── */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={!validation.valid || !selectedAccountId || requestMutation.isPending}
            className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold shadow-lg"
          >
            <Send className="h-4 w-4 mr-2" />
            Solicitar Saque
          </Button>
          <Button
            variant="outline"
            className="h-11 text-xs"
            onClick={() => toast.info("Rascunho salvo", { description: "Função disponível em breve" })}
          >
            <Save className="h-4 w-4 mr-1.5" />
            Rascunho
          </Button>
        </div>

        <p className="text-[9px] text-muted-foreground text-center">
          O saque será criado com status "Aguardando Aprovação" e processado após validação.
        </p>
      </CardContent>
    </Card>
  );
}
