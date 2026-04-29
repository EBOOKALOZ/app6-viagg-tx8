import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const COLOR_OPTIONS = [
  { value: "#FFFFFF", label: "Branco" },
  { value: "#F4F6F8", label: "Cinza Claro" },
  { value: "#E8F5E9", label: "Verde Suave" },
  { value: "#FFF3E0", label: "Laranja Suave" },
  { value: "#E3F2FD", label: "Azul Suave" },
  { value: "#FCE4EC", label: "Rosa Suave" },
];

const DARK_CANVAS_COLORS = [
  { value: "#3F5166", label: "Azul Escuro" },
  { value: "#2E3E4F", label: "Marinho" },
  { value: "#1F2A36", label: "Noturno" },
];

const DARK_CARD_COLORS = [
  { value: "#C97A7A", label: "Rosa Antigo" },
  { value: "#A85C5C", label: "Terracota" },
  { value: "#7A3E3E", label: "Bordô" },
];

/** Returns true if a hex color is considered dark (needs white text) */
export function isDarkColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  // Relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.55;
}

interface GroupColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  variant?: "canvas" | "card";
}

export function GroupColorPicker({ label, value, onChange, variant = "canvas" }: GroupColorPickerProps) {
  const darkColors = variant === "canvas" ? DARK_CANVAS_COLORS : DARK_CARD_COLORS;
  const allColors = [...COLOR_OPTIONS, ...darkColors];

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex gap-2 flex-wrap">
        {allColors.map((color) => {
          const dark = isDarkColor(color.value);
          return (
            <button
              key={color.value}
              onClick={() => onChange(color.value)}
              className={cn(
                "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110",
                value === color.value ? "border-primary ring-2 ring-primary/30" : "border-gray-300"
              )}
              style={{ backgroundColor: color.value }}
              title={color.label}
            >
              {value === color.value && (
                <Check className="h-4 w-4" style={{ color: dark ? "#fff" : "#333" }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
