import { useState } from "react";
import { CreditCard, QrCode, Wallet, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

type PaymentMethod = "pix" | "credit_card" | "mercado_pago";

interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const paymentMethods: PaymentMethodOption[] = [
  {
    value: "pix",
    label: "PIX",
    icon: <QrCode className="h-5 w-5" />,
    description: "Transferência instantânea",
  },
  {
    value: "credit_card",
    label: "Cartão de Crédito",
    icon: <CreditCard className="h-5 w-5" />,
    description: "Visa, Mastercard, Elo",
  },
  {
    value: "mercado_pago",
    label: "Mercado Pago",
    icon: <Wallet className="h-5 w-5" />,
    description: "Saldo ou cartão",
  },
];

/**
 * AddBalanceCard - Componente para adicionar saldo na carteira do lojista
 * 
 * MVP: Exibe formulário visual sem integração real.
 * Preparado para futuras integrações com:
 * - PIX (QR Code)
 * - Stripe / Cartão
 * - Mercado Pago SDK
 */
export function AddBalanceCard() {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only numbers and format as currency
    const value = e.target.value.replace(/\D/g, "");
    const numericValue = parseInt(value, 10) / 100;
    
    if (isNaN(numericValue) || value === "") {
      setAmount("");
      return;
    }
    
    setAmount(numericValue.toFixed(2));
  };

  const formatDisplayValue = (value: string) => {
    if (!value) return "";
    const num = parseFloat(value);
    if (isNaN(num)) return "";
    return num.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleSubmit = async () => {
    const numericAmount = parseFloat(amount);
    
    if (!amount || numericAmount <= 0) {
      toast.error("Informe um valor válido para adicionar");
      return;
    }

    if (numericAmount < 10) {
      toast.error("O valor mínimo para recarga é R$ 10,00");
      return;
    }

    setIsSubmitting(true);

    // MVP: Simula processamento
    // Futuro: Integrar com gateway real (Stripe, Mercado Pago, etc)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    toast.success("Solicitação de recarga enviada. Aguarde confirmação.", {
      description: `Valor: R$ ${formatDisplayValue(amount)} via ${
        paymentMethods.find((m) => m.value === paymentMethod)?.label
      }`,
      duration: 5000,
    });

    // Reset form
    setAmount("");
    setIsSubmitting(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          Adicionar Saldo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Amount Input */}
        <div className="space-y-2">
          <Label htmlFor="amount">Valor</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
              R$
            </span>
            <Input
              id="amount"
              type="text"
              inputMode="numeric"
              placeholder="0,00"
              value={formatDisplayValue(amount)}
              onChange={handleAmountChange}
              className="pl-10 text-lg font-semibold"
              disabled={isSubmitting}
            />
          </div>
          <p className="text-xs text-muted-foreground">Valor mínimo: R$ 10,00</p>
        </div>

        {/* Payment Method Selection */}
        <div className="space-y-2">
          <Label>Método de Pagamento</Label>
          <RadioGroup
            value={paymentMethod}
            onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
            className="grid gap-2"
            disabled={isSubmitting}
          >
            {paymentMethods.map((method) => (
              <label
                key={method.value}
                htmlFor={method.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  paymentMethod === method.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/50"
                } ${isSubmitting ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <RadioGroupItem value={method.value} id={method.value} />
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    paymentMethod === method.value
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {method.icon}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{method.label}</p>
                    <p className="text-xs text-muted-foreground">{method.description}</p>
                  </div>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !amount}
          className="w-full"
          size="lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processando...
            </>
          ) : (
            <>
              <Wallet className="h-4 w-4 mr-2" />
              Adicionar Saldo
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          O saldo será creditado após confirmação do pagamento.
        </p>
      </CardContent>
    </Card>
  );
}
