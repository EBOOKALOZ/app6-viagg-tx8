import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { User, Phone, FileText } from "lucide-react";

interface CustomerFieldsProps {
  customerName: string;
  customerPhone: string;
  deliveryNotes: string;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onNotesChange: (v: string) => void;
}

export function CustomerFields({
  customerName,
  customerPhone,
  deliveryNotes,
  onNameChange,
  onPhoneChange,
  onNotesChange,
}: CustomerFieldsProps) {
  const formatPhone = (value: string) => {
    // Remove all non-digits
    const numbers = value.replace(/\D/g, "");
    
    // Apply MB mask (XX) XXXXX-XXXX
    if (numbers.length <= 11) {
      return numbers
        .replace(/^(\d{2})(\d)/g, "($1) $2")
        .replace(/(\d{5})(\d)/, "$1-$2");
    }
    // Limit to 11 digits
    const truncated = numbers.slice(0, 11);
    return truncated
      .replace(/^(\d{2})(\d)/g, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2");
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    onPhoneChange(formatted);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
            <User className="h-4 w-4 text-primary" />
            Nome do cliente *
          </Label>
          <Input
            placeholder="Nome de quem receberá"
            id="customer-name"
            value={customerName}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <div>
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
            <Phone className="h-4 w-4 text-muted-foreground" />
            Telefone (opcional)
          </Label>
          <Input
            placeholder="(00) 00000-0000"
            id="customer-phone"
            value={customerPhone}
            onChange={handlePhoneChange}
            maxLength={15} // (XX) XXXXX-XXXX is 15 chars
          />
        </div>
        <div>
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Observações (opcional)
          </Label>
          <Textarea
            placeholder="Ponto de referência, instruções..."
            value={deliveryNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            className="resize-none"
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  );
}
