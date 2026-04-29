import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TermsContent } from "./TermsContent";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface TermsModalProps {
  open: boolean;
  profileType?: string;
}

export function TermsModal({ open, profileType }: TermsModalProps) {
  const { user, refreshProfiles, isAdmin } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🔥 BLINDAGEM TOTAL: Admin nunca vê modal
  if (isAdmin) {
    return null;
  }

  const handleAccept = async () => {
    if (!user || !accepted) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      toast.success("Termos aceitos com sucesso!");
      await refreshProfiles();
    } catch (error) {
      console.error("Error accepting terms:", error);
      toast.error("Erro ao aceitar os termos. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} modal>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">Termos de Uso</DialogTitle>
          <DialogDescription>Por favor, leia e aceite os termos para continuar usando o aplicativo.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[50vh] pr-4">
          <div className="py-4">
            <TermsContent profileType={profileType} />
          </div>
        </ScrollArea>

        <div className="border-t pt-4">
          <div className="flex items-start space-x-3 mb-4">
            <Checkbox
              id="terms-accept"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
              className="mt-1"
            />
            <label htmlFor="terms-accept" className="text-sm text-muted-foreground cursor-pointer leading-relaxed">
              Li, compreendi e aceito os <strong className="text-foreground">Termos de Uso</strong> da plataforma.
              Entendo que nenhum serviço será iniciado sem meu aceite voluntário e que a plataforma atua como
              intermediadora tecnológica.
            </label>
          </div>

          <DialogFooter>
            <Button onClick={handleAccept} disabled={!accepted || isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                "Aceitar e Continuar"
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
