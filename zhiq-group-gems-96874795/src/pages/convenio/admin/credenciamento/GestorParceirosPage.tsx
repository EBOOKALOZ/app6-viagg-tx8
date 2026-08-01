import { BadgeCheck } from "lucide-react";
import { GestorCredenciamentoCategoryPage } from "@/components/convenio/GestorCredenciamentoCategoryPage";

export default function GestorParceirosPage() {
  return (
    <GestorCredenciamentoCategoryPage
      icon={BadgeCheck}
      title="Parceiros"
      categoryKey="parceiro"
      singularLabel="Parceiro"
    />
  );
}
