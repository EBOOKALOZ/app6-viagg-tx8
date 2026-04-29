import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { QrCode, Loader2 } from "lucide-react";

interface PixFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingData?: {
    pix_tipo_chave: string | null;
    pix_chave: string | null;
  } | null;
  onSuccess: () => void;
}

const PIX_KEY_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
  { value: "aleatoria", label: "Chave Aleatória" },
];

export const PixFormModal = ({ open, onOpenChange, existingData, onSuccess }: PixFormModalProps) => {
  const { user } = useAuth();
  const [tipoChave, setTipoChave] = useState(existingData?.pix_tipo_chave || "");
  const [chave, setChave] = useState(existingData?.pix_chave || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (existingData) {
      setTipoChave(existingData.pix_tipo_chave || "");
      setChave(existingData.pix_chave || "");
    }
  }, [existingData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !tipoChave || !chave) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("motoboy_bank_data")
        .upsert({
          user_id: user.id,
          pix_tipo_chave: tipoChave,
          pix_chave: chave,
        }, {
          onConflict: "user_id"
        });

      if (error) throw error;

      toast.success("Chave Pix cadastrada com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving pix data:", error);
      toast.error("Erro ao salvar dados do Pix");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPlaceholder = () => {
    switch (tipoChave) {
      case "cpf": return "000.000.000-00";
      case "cnpj": return "00.000.000/0000-00";
      case "email": return "seu@email.com";
      case "telefone": return "+55 11 99999-9999";
      case "aleatoria": return "Chave aleatória";
      default: return "Digite sua chave";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Cadastrar Chave Pix
          </DialogTitle>
          <DialogDescription>
            Cadastre sua chave Pix para receber pagamentos futuros.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tipo-chave">Tipo da Chave</Label>
            <Select value={tipoChave} onValueChange={setTipoChave}>
              <SelectTrigger id="tipo-chave">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {PIX_KEY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chave-pix">Chave Pix</Label>
            <Input
              id="chave-pix"
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              placeholder={getPlaceholder()}
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
              disabled={isSubmitting || !tipoChave || !chave}
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
