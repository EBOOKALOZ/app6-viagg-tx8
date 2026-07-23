/**
 * BusinessAppearancePage — página "Aparência da {Imobiliária|Revenda|Empresa|
 * Agência}" / "Aparência dos {Leilões|Arremates}". O módulo é resolvido pela
 * URL (registry BUSINESS_MODULES); todo o conteúdo é o
 * GenericBusinessAppearance (mesmo editor do lojista, parametrizado).
 */
import { useLocation } from "react-router-dom";
import { resolveModuleByPath } from "@/lib/business-modules";
import GenericBusinessAppearance from "@/components/business/GenericBusinessAppearance";

export default function BusinessAppearancePage() {
  const { pathname } = useLocation();
  const module = resolveModuleByPath(pathname);
  if (!module) return null;
  return <GenericBusinessAppearance module={module} />;
}
