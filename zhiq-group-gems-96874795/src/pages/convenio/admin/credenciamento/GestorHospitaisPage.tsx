import { Hospital } from "lucide-react";
import { GestorCredenciamentoCategoryPage } from "@/components/convenio/GestorCredenciamentoCategoryPage";

export default function GestorHospitaisPage() {
  return (
    <GestorCredenciamentoCategoryPage
      icon={Hospital}
      title="Hospitais"
      categoryKey="hospital"
      singularLabel="Hospital"
    />
  );
}
