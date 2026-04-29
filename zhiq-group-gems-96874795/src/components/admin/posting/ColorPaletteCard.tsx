import { Check, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

const COLOR_OPTIONS = [
  { id: "orange", label: "Laranja", color: "hsl(25 95% 53%)" },
  { id: "green", label: "Verde", color: "hsl(142 71% 35%)" },
  { id: "blue", label: "Azul", color: "hsl(217 91% 50%)" },
  { id: "purple", label: "Roxo", color: "hsl(271 76% 53%)" },
  { id: "black", label: "Preto", color: "hsl(0 0% 9%)" },
  { id: "gray", label: "Cinza", color: "hsl(0 0% 45%)" },
] as const;

interface ColorPaletteCardProps {
  selected: string;
  onChange: (color: string) => void;
}

export function ColorPaletteCard({ selected, onChange }: ColorPaletteCardProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium flex items-center gap-1.5">
        <Palette className="h-4 w-4" />
        Cor da Campanha
      </label>
      <div className="flex flex-wrap gap-2">
        {COLOR_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            title={opt.label}
            onClick={() => onChange(opt.id)}
            className={cn(
              "relative h-9 w-9 rounded-full border-2 transition-all duration-150",
              selected === opt.id
                ? "border-foreground scale-110 shadow-md"
                : "border-transparent hover:scale-105 hover:border-muted-foreground/40"
            )}
            style={{ backgroundColor: opt.color }}
          >
            {selected === opt.id && (
              <Check
                className="absolute inset-0 m-auto h-4 w-4"
                style={{ color: opt.id === "black" || opt.id === "purple" || opt.id === "blue" ? "white" : "white" }}
              />
            )}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cor usada no destaque visual da campanha e no painel do motoboy
      </p>
    </div>
  );
}
