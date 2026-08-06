import { cn } from "@/lib/utils";

interface GestorStatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  accent?: "emerald" | "cyan" | "amber" | "violet" | "red";
}

const ACCENT_CLASSES: Record<NonNullable<GestorStatCardProps["accent"]>, string> = {
  emerald: "text-emerald-400 bg-emerald-500/10",
  cyan: "text-cyan-400 bg-cyan-500/10",
  amber: "text-amber-400 bg-amber-500/10",
  violet: "text-violet-400 bg-violet-500/10",
  red: "text-red-400 bg-red-500/10",
};

export function GestorStatCard({ icon: Icon, label, value, hint, accent = "emerald" }: GestorStatCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-white/50">{label}</span>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl", ACCENT_CLASSES[accent])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </div>
  );
}
