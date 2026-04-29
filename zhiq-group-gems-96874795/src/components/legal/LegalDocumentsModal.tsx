import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PendingDocument {
  code: string;
  title: string;
  content: string;
  version: number;
}

interface LegalDocumentsModalProps {
  open: boolean;
  onAcceptAll: () => void;
}

export function LegalDocumentsModal({ open, onAcceptAll }: LegalDocumentsModalProps) {
  const { user, activeProfile } = useAuth();

  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  // ============================
  // BUSCAR DOCUMENTOS PENDENTES
  // ============================
  const fetchPendingDocuments = useCallback(async () => {
    if (!user || !activeProfile) {
      setLoading(false);
      return;
    }

    try {
      // 1️⃣ Buscar documentos ativos aplicáveis ao perfil
      const { data: allDocs, error: docsError } = await supabase
        .from("legal_documents")
        .select("code, title, content, version")
        .eq("is_active", true)
        .eq("language", "pt-BR")
        .or(`profile_scope.eq.${activeProfile},profile_scope.eq.all`)
        .order("version", { ascending: false });

      if (docsError) {
        console.error("Erro ao buscar documentos:", docsError);
        toast.error("Erro ao carregar documentos legais");
        setLoading(false);
        return;
      }

      if (!allDocs || allDocs.length === 0) {
        onAcceptAll();
        setLoading(false);
        return;
      }

      // 2️⃣ Pegar maior versão necessária
      const latestVersion = Math.max(...allDocs.map((d) => d.version));

      // 3️⃣ Buscar aceite atual do usuário para o perfil
      const { data: acceptance } = await supabase
        .from("legal_acceptances")
        .select("version_accepted")
        .eq("user_id", user.id)
        .eq("profile_type", activeProfile)
        .maybeSingle();

      const acceptedVersion = acceptance?.version_accepted || 0;

      // 4️⃣ Verificar se já está atualizado
      if (acceptedVersion >= latestVersion) {
        onAcceptAll();
        setLoading(false);
        return;
      }

      // 5️⃣ Criar lista pendente
      const pendingList = allDocs.filter((doc) => doc.version > acceptedVersion);

      setPendingDocs(pendingList);
      setCurrentIndex(0);
    } catch (err) {
      console.error("Erro inesperado:", err);
      toast.error("Erro inesperado ao carregar documentos");
    } finally {
      setLoading(false);
    }
  }, [user, activeProfile, onAcceptAll]);

  useEffect(() => {
    if (open && user && activeProfile) {
      setLoading(true);
      fetchPendingDocuments();
    }
  }, [open, user, activeProfile, fetchPendingDocuments]);

  // ============================
  // ACEITAR DOCUMENTO
  // ============================
  const handleAccept = async () => {
    if (!activeProfile || pendingDocs.length === 0 || !user) return;

    setAccepting(true);

    try {
      const currentDoc = pendingDocs[currentIndex];

      const { error } = await supabase.rpc("accept_legal_document", {
        p_profile_type: activeProfile,
        p_version: currentDoc.version,
      });

      if (error) {
        toast.error("Erro ao registrar aceite");
        return;
      }

      if (currentIndex < pendingDocs.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        toast.success("Documentos aceitos com sucesso!");
        onAcceptAll();
      }
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setAccepting(false);
    }
  };

  // ============================
  // LOADING STATES
  // ============================
  if (!user || !activeProfile) {
    return (
      <Dialog open={open}>
        <DialogContent>
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p>Carregando usuário...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (loading) {
    return (
      <Dialog open={open}>
        <DialogContent>
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p>Carregando documentos...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (pendingDocs.length === 0) {
    return null;
  }

  const currentDoc = pendingDocs[currentIndex];
  const progress = ((currentIndex + 1) / pendingDocs.length) * 100;

  // ============================
  // RENDER FINAL
  // ============================
  return (
    <Dialog open={open} modal>
      <DialogContent
        className="sm:max-w-2xl h-[85vh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header fixo */}
        <div className="flex-shrink-0 p-6 pb-4 border-b bg-background">
          <DialogHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <DialogTitle>Documentos Obrigatórios</DialogTitle>
              </div>
              <span className="text-xs bg-muted px-2 py-1 rounded">
                {currentIndex + 1} de {pendingDocs.length}
              </span>
            </div>

            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>

            <DialogDescription className="text-center font-medium">
              {currentDoc.title}
              <span className="block text-xs text-muted-foreground mt-1">Versão {currentDoc.version}</span>
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Área de conteúdo com scroll interno */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6 pt-4">
              <div className="rounded-md border bg-muted/20 p-4">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{currentDoc.content}</div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Footer fixo com botão */}
        <div className="flex-shrink-0 p-6 pt-4 border-t bg-background space-y-4">
          <p className="text-xs text-muted-foreground text-center">
            Ao clicar em "ACEITO", você concorda com os termos acima.
          </p>

          <Button onClick={handleAccept} disabled={accepting} className="w-full h-12 text-base font-semibold">
            {accepting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                ACEITO
              </>
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center">
            Você precisa aceitar todos os documentos para continuar usando a plataforma.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
