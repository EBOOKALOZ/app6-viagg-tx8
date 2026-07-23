/**
 * BusinessProfilePage — página "Minha {Imobiliária|Revenda|Empresa|Agência}" /
 * "Meus {Leilões|Arremates}". O módulo é resolvido pela URL (registry
 * BUSINESS_MODULES); todo o conteúdo é o GenericBusinessProfile.
 */
import { useLocation } from "react-router-dom";
import { resolveModuleByPath } from "@/lib/business-modules";
import GenericBusinessProfile from "@/components/business/GenericBusinessProfile";

export default function BusinessProfilePage() {
  const { pathname } = useLocation();
  const module = resolveModuleByPath(pathname);
  if (!module) return null;
  return <GenericBusinessProfile module={module} />;
}
