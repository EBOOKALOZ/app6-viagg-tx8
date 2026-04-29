import { Volume2, VolumeX } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useSoundSettings } from "@/contexts/SoundSettingsContext";
import { cn } from "@/lib/utils";

interface SoundtrackToggleProps {
  className?: string;
  showLabel?: boolean;
  compact?: boolean;
}

/**
 * Toggle para ativar/desativar a trilha sonora do app.
 * Usa o contexto SoundSettingsContext para persistir a preferência.
 */
export function SoundtrackToggle({ 
  className, 
  showLabel = true,
  compact = false,
}: SoundtrackToggleProps) {
  const { soundtrackEnabled, toggleSoundtrack } = useSoundSettings();

  if (compact) {
    return (
      <button
        onClick={toggleSoundtrack}
        className={cn(
          "p-2 rounded-full transition-colors",
          soundtrackEnabled 
            ? "bg-primary/10 text-primary" 
            : "bg-muted text-muted-foreground",
          className
        )}
        title={soundtrackEnabled ? "Desativar trilha sonora" : "Ativar trilha sonora"}
      >
        {soundtrackEnabled ? (
          <Volume2 className="w-5 h-5" />
        ) : (
          <VolumeX className="w-5 h-5" />
        )}
      </button>
    );
  }

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex items-center gap-3">
        {soundtrackEnabled ? (
          <Volume2 className="w-5 h-5 text-primary" />
        ) : (
          <VolumeX className="w-5 h-5 text-muted-foreground" />
        )}
        {showLabel && (
          <Label htmlFor="soundtrack-toggle" className="cursor-pointer">
            Ativar trilha sonora
          </Label>
        )}
      </div>
      <Switch
        id="soundtrack-toggle"
        checked={soundtrackEnabled}
        onCheckedChange={toggleSoundtrack}
      />
    </div>
  );
}

export default SoundtrackToggle;
