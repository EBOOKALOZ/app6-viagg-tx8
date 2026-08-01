import { Pill } from "lucide-react";
import { GestorCredenciamentoCategoryPage } from "@/components/convenio/GestorCredenciamentoCategoryPage";

export default function GestorFarmaciasPage() {
  return (
    <GestorCredenciamentoCategoryPage
      icon={Pill}
      title="Farmácias"
      categoryKey="farmacia"
      singularLabel="Farmácia"
    />
  );
}
