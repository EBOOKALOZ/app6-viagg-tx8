import { Stethoscope } from "lucide-react";
import { GestorCredenciamentoCategoryPage } from "@/components/convenio/GestorCredenciamentoCategoryPage";

export default function GestorClinicasPage() {
  return (
    <GestorCredenciamentoCategoryPage
      icon={Stethoscope}
      title="Clínicas"
      categoryKey="clinica"
      singularLabel="Clínica"
    />
  );
}
