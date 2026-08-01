/**
 * /convenio-admin/credenciamento — hub de Credenciamento (Comando Convênio Fase 1).
 * Visão geral das 6 categorias (Clínicas, Laboratórios, Farmácias, Hospitais,
 * Instituições, Parceiros) com atalho para cada gestão.
 */
import { Link } from "react-router-dom";
import { ShieldCheck, Stethoscope, FlaskConical, Pill, Hospital, Landmark, BadgeCheck, ChevronRight } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorPlaceholderNotice } from "@/components/convenio/GestorPlaceholderNotice";
import { SIMULATED_ENTITIES_BY_CATEGORY } from "@/lib/convenio/simulatedData";

const CATEGORIES = [
  { key: "clinica", label: "Clínicas", icon: Stethoscope, path: "/convenio-admin/credenciamento/clinicas" },
  { key: "laboratorio", label: "Laboratórios", icon: FlaskConical, path: "/convenio-admin/credenciamento/laboratorios" },
  { key: "farmacia", label: "Farmácias", icon: Pill, path: "/convenio-admin/credenciamento/farmacias" },
  { key: "hospital", label: "Hospitais", icon: Hospital, path: "/convenio-admin/credenciamento/hospitais" },
  { key: "instituicao", label: "Instituições", icon: Landmark, path: "/convenio-admin/credenciamento/instituicoes" },
  { key: "parceiro", label: "Parceiros", icon: BadgeCheck, path: "/convenio-admin/credenciamento/parceiros" },
] as const;

export default function GestorCredenciamentoHubPage() {
  return (
    <div>
      <GestorPageHeader
        icon={ShieldCheck}
        title="Credenciamento"
        subtitle="Gerenciamento de clínicas, laboratórios, hospitais, farmácias, instituições e parceiros"
      />
      <GestorPlaceholderNotice />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map(({ key, label, icon: Icon, path }) => {
          const count = SIMULATED_ENTITIES_BY_CATEGORY[key]?.length ?? 0;
          return (
            <Link
              key={key}
              to={path}
              className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:bg-white/[0.07]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
                  <Icon className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="font-black text-white">{label}</p>
                  <p className="text-xs text-white/40">{count} cadastrado(s)</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
