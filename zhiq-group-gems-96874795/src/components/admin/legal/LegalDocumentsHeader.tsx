import { Button } from "@/components/ui/button";
import { BarChart3, Plus, Scale, Shield } from "lucide-react";

interface LegalDocumentsHeaderProps {
  onViewAcceptances: () => void;
  onNewVersion: () => void;
}

export function LegalDocumentsHeader({ 
  onViewAcceptances, 
  onNewVersion 
}: LegalDocumentsHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#0F3D2E] via-[#1a5a42] to-[#0F3D2E] p-6 md:p-8">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-4 right-4">
          <Scale className="h-32 w-32 text-white" />
        </div>
        <div className="absolute bottom-4 left-4">
          <Shield className="h-24 w-24 text-white" />
        </div>
      </div>

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Scale className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                Documentos Legais
              </h1>
              <p className="text-white/70 text-sm md:text-base">
                Gestão de versões e vigência documental
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={onViewAcceptances}
            className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
          >
            <BarChart3 className="h-4 w-4" />
            Ver Aceites
          </Button>
          <Button
            onClick={onNewVersion}
            className="gap-2 bg-white text-[#0F3D2E] hover:bg-white/90"
          >
            <Plus className="h-4 w-4" />
            Nova Versão
          </Button>
        </div>
      </div>
    </div>
  );
}
