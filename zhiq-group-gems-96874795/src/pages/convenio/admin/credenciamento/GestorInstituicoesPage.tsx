import { Landmark } from "lucide-react";
import { GestorCredenciamentoCategoryPage } from "@/components/convenio/GestorCredenciamentoCategoryPage";

export default function GestorInstituicoesPage() {
  return (
    <GestorCredenciamentoCategoryPage
      icon={Landmark}
      title="Instituições"
      categoryKey="instituicao"
      singularLabel="Instituição"
    />
  );
}
