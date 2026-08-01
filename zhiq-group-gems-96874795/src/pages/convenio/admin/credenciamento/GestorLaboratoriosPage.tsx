import { FlaskConical } from "lucide-react";
import { GestorCredenciamentoCategoryPage } from "@/components/convenio/GestorCredenciamentoCategoryPage";

export default function GestorLaboratoriosPage() {
  return (
    <GestorCredenciamentoCategoryPage
      icon={FlaskConical}
      title="Laboratórios"
      categoryKey="laboratorio"
      singularLabel="Laboratório"
    />
  );
}
