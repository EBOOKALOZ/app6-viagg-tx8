/**
 * ComplianceBadge — selo institucional discreto "Software Registrado no INPI".
 * Usado em Home/Rodapé/Login/Cadastro/Sobre/Marketplace/Admin (ORION-520).
 */
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComplianceBadgeProps {
  variant?: "light" | "dark";
  size?: "sm" | "md";
  className?: string;
  /** Se falso, renderiza um <span> em vez de link para /conformidade. */
  linked?: boolean;
}

export function ComplianceBadge({
  variant = "dark",
  size = "sm",
  className,
  linked = true,
}: ComplianceBadgeProps) {
  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-black uppercase tracking-wide transition-opacity hover:opacity-100",
        size === "sm" ? "px-2.5 py-1 text-[9px] gap-1" : "px-3 py-1.5 text-[10px]",
        variant === "dark"
          ? "bg-white/10 text-white/80 ring-1 ring-white/15"
          : "bg-zinc-900/5 text-zinc-600 ring-1 ring-zinc-900/10",
        className
      )}
      title="VIAGG-TX8 PLATFORM CORE — Registro de Programa de Computador (INPI, processo BR512026003461-2)"
    >
      <ShieldCheck className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5", "text-emerald-500")} />
      Software Registrado no INPI
    </span>
  );

  if (!linked) return content;

  return (
    <Link to="/conformidade" className="inline-flex opacity-70 hover:opacity-100 transition-opacity">
      {content}
    </Link>
  );
}

export default ComplianceBadge;
