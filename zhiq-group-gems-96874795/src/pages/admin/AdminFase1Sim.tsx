/**
 * AdminFase1Sim — Simulador da Fase 1 (TESTE / moeda virtual)
 *
 * Roda o ciclo financeiro real via RPCs do schema pay_* / merchant_credit_*:
 *   1. (opcional) credita o lojista de teste     -> credit_merchant_credits
 *   2. debita o lojista pela entrega             -> debit_merchant_credits
 *   3. credita o motoboy (você) ao concluir      -> credit_pay_motoboy_earning
 *
 * O passo 3 escreve em pay_financial_accounts — exatamente o que a
 * Carteira do motoboy lê agora. Logue como motoboy e veja o saldo entrar.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminFase1Sim() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [gross, setGross] = useState(20);
  const [commissionPct, setCommissionPct] = useState(15);
  const [storeId, setStoreId] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: payBal } = useQuery({
    queryKey: ["sim-pay-balance", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pay_financial_accounts")
        .select("available_balance, reserved_balance, pending_balance, current_balance")
        .eq("owner_type", "motoboy_profile")
        .eq("owner_id", user!.id)
        .eq("account_type", "motoboy_wallet")
        .maybeSingle();
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sim-pay-balance", user?.id] });
    qc.invalidateQueries({ queryKey: ["motoboy-pay-balance", user?.id] });
    qc.invalidateQueries({ queryKey: ["motoboy-pay-history", user?.id] });
    qc.invalidateQueries({ queryKey: ["motoboy-pay-earnings", user?.id] });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); refresh(); }
    catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setBusy(false); }
  };

  const creditMerchant = () =>
    run(async () => {
      if (!storeId.trim()) throw new Error("Informe o store_id do lojista de teste");
      const { error } = await supabase.rpc("credit_merchant_credits", {
        p_store_id: storeId.trim(),
        p_amount: Math.round(gross * 5),
        p_entry_type: "credit",
        p_reason_code: "admin_grant",
        p_description: "[SIM Fase 1] crédito de teste",
        p_metadata: { test: true },
        p_created_by: user?.id,
      });
      if (error) throw error;
      toast.success(`Lojista creditado: ${Math.round(gross * 5)} créditos`);
    });

  const simulateDelivery = () =>
    run(async () => {
      // Débito opcional do lojista (se informado)
      if (storeId.trim()) {
        const { error: dErr } = await supabase.rpc("debit_merchant_credits", {
          p_store_id: storeId.trim(),
          p_amount: Math.round(gross),
          p_entry_type: "debit",
          p_reason_code: "delivery_payment",
          p_description: "[SIM Fase 1] pagamento de entrega",
          p_metadata: { test: true },
          p_created_by: user?.id,
        });
        if (dErr) throw dErr;
      }
      // Crédito do motoboy (você) — escreve em pay_financial_accounts
      const commission = Math.round(gross * (commissionPct / 100) * 100) / 100;
      const { error } = await supabase.rpc("credit_pay_motoboy_earning", {
        p_motoboy_profile_id: user!.id,
        p_source_type: "delivery",
        p_source_id: null,
        p_gross_amount: gross,
        p_commission_amount: commission,
        p_metadata: { test: true, simulator: true },
        p_idempotency_key: `sim-${user!.id}-${Date.now()}`,
        p_created_by: user!.id,
      });
      if (error) throw error;
      toast.success(`Entrega simulada · motoboy recebeu ${brl(gross - commission)} líquido`);
    });

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>🧪 Simulador Fase 1 (teste / moeda virtual)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Roda o ciclo via RPCs reais. O crédito do motoboy escreve em{" "}
            <code>pay_financial_accounts</code> — depois troque para o perfil
            motoboy e abra <strong>Carteira</strong> para ver o saldo entrar.
          </p>

          <div className="rounded-lg bg-zinc-50 p-3 space-y-1">
            <div className="font-bold">Carteira motoboy (pay_*) — você</div>
            <div>Disponível: <strong>{brl(Number(payBal?.available_balance || 0))}</strong></div>
            <div className="text-xs text-muted-foreground">
              reservado {brl(Number(payBal?.reserved_balance || 0))} · pendente{" "}
              {brl(Number(payBal?.pending_balance || 0))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor bruto da entrega (R$)</Label>
              <Input type="number" value={gross}
                onChange={(e) => setGross(Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Comissão plataforma (%)</Label>
              <Input type="number" value={commissionPct}
                onChange={(e) => setCommissionPct(Number(e.target.value) || 0)} />
            </div>
          </div>

          <div>
            <Label>store_id do lojista de teste (opcional)</Label>
            <Input placeholder="uuid da loja de teste — deixe vazio p/ só motoboy"
              value={storeId} onChange={(e) => setStoreId(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" disabled={busy || !storeId.trim()}
              onClick={creditMerchant}>
              1. Creditar lojista (teste)
            </Button>
            <Button disabled={busy || !user?.id} onClick={simulateDelivery}>
              {storeId.trim() ? "2. Entrega: debita lojista + paga motoboy" : "Simular entrega → pagar motoboy"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Tudo marcado <code>test:true</code> e idempotente. Não toca em
            lojas reais a menos que você informe um store_id.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
