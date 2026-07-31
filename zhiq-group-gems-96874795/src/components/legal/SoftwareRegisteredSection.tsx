/**
 * Seção institucional "Software Registrado" — exibida na página Sobre (ORION-520).
 */
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SOFTWARE_REGISTRATION } from "@/lib/compliance/complianceData";

export function SoftwareRegisteredSection() {
  return (
    <Card className="mt-8 border-white/10 bg-white/[0.04] text-white">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-black">Software Registrado</h2>
        </div>
        <p className="text-sm leading-relaxed text-white/70">
          A plataforma {SOFTWARE_REGISTRATION.titulo} possui Registro de Programa de Computador
          junto ao Instituto Nacional da Propriedade Industrial (INPI), reforçando a proteção
          da propriedade intelectual, a autenticidade do software e o compromisso da plataforma
          com inovação, segurança, transparência e governança tecnológica.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/50">
          <span><strong className="text-white/80">Processo:</strong> {SOFTWARE_REGISTRATION.processo}</span>
          <span><strong className="text-white/80">Publicação:</strong> {SOFTWARE_REGISTRATION.dataPublicacao}</span>
          <span><strong className="text-white/80">Titular:</strong> {SOFTWARE_REGISTRATION.titular}</span>
        </div>
        <Button asChild size="sm" variant="secondary" className="mt-1">
          <Link to="/conformidade">Visualizar Certificado</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default SoftwareRegisteredSection;
