import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";

interface BankAccountFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingData?: {
    banco: string | null;
    agencia: string | null;
    conta: string | null;
    tipo_conta: string | null;
    nome_titular: string | null;
    cpf_titular: string | null;
  } | null;
  onSuccess: () => void;
}

const BANKS = [
  { value: "001", label: "Banco do Brasil" },
  { value: "033", label: "Santander" },
  { value: "104", label: "Caixa Econômica" },
  { value: "237", label: "Bradesco" },
  { value: "341", label: "Itaú" },
  { value: "260", label: "Nubank" },
  { value: "077", label: "Inter" },
  { value: "336", label: "C6 Bank" },
  { value: "290", label: "PagBank" },
  { value: "380", label: "PicPay" },
  { value: "outro", label: "Outro" },
];

const ACCOUNT_TYPES = [
  { value: "corrente", label: "Conta Corrente" },
  { value: "poupanca", label: "Conta Poupança" },
];

export const BankAccountFormModal = ({ open, onOpenChange, existingData, onSuccess }: BankAccountFormModalProps) => {
  const { user } = useAuth();
  const [banco, setBanco] = useState(existingData?.banco || "");
  const [agencia, setAgencia] = useState(existingData?.agencia || "");
  const [conta, setConta] = useState(existingData?.conta || "");
  const [tipoConta, setTipoConta] = useState(existingData?.tipo_conta || "");
  const [nomeTitular, setNomeTitular] = useState(existingData?.nome_titular || "");
  const [cpfTitular, setCpfTitular] = useState(existingData?.cpf_titular || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (existingData) {
      setBanco(existingData.banco || "");
      setAgencia(existingData.agencia || "");
      setConta(existingData.conta || "");
      setTipoConta(existingData.tipo_conta || "");
      setNomeTitular(existingData.nome_titular || "");
      setCpfTitular(existingData.cpf_titular || "");
    }
  }, [existingData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("motoboy_bank_data")
        .upsert({
          user_id: user.id,
          banco,
          agencia,
          conta,
          tipo_conta: tipoConta,
          nome_titular: nomeTitular,
          cpf_titular: cpfTitular,
        }, {
          onConflict: "user_id"
        });

      if (error) throw error;

      toast.success("Conta bancária cadastrada com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving bank data:", error);
      toast.error("Erro ao salvar dados bancários");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = banco && agencia && conta && tipoConta && nomeTitular && cpfTitular;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Cadastrar Conta Bancária
          </DialogTitle>
          <DialogDescription>
            Cadastre sua conta bancária para receber pagamentos futuros.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="banco">Banco</Label>
            <Select value={banco} onValueChange={setBanco}>
              <SelectTrigger id="banco">
                <SelectValue placeholder="Selecione o banco" />
              </SelectTrigger>
              <SelectContent>
                {BANKS.map((bank) => (
                  <SelectItem key={bank.value} value={bank.value}>
                    {bank.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="agencia">Agência</Label>
              <Input
                id="agencia"
                value={agencia}
                onChange={(e) => setAgencia(e.target.value)}
                placeholder="0000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conta">Conta</Label>
              <Input
                id="conta"
                value={conta}
                onChange={(e) => setConta(e.target.value)}
                placeholder="00000-0"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipo-conta">Tipo de Conta</Label>
            <Select value={tipoConta} onValueChange={setTipoConta}>
              <SelectTrigger id="tipo-conta">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nome-titular">Nome do Titular</Label>
            <Input
              id="nome-titular"
              value={nomeTitular}
              onChange={(e) => setNomeTitular(e.target.value)}
              placeholder="Nome completo"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cpf-titular">CPF do Titular</Label>
            <Input
              id="cpf-titular"
              value={cpfTitular}
              onChange={(e) => setCpfTitular(e.target.value)}
              placeholder="000.000.000-00"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || !isFormValid}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Salvar"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
