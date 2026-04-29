import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface AdminPalette {
  id: string;
  label: string;
  description: string;
  vars: {
    "--admin-primary": string;
    "--admin-primary-foreground": string;
    "--admin-card": string;
    "--admin-card-foreground": string;
    "--admin-accent": string;
    "--admin-accent-foreground": string;
    "--admin-border": string;
    "--admin-muted": string;
    "--admin-muted-foreground": string;
    "--admin-background": string;
  };
  /** Swatch color for selector UI */
  swatch: string;
}

export const ADMIN_PALETTES: AdminPalette[] = [
  {
    id: "padrao",
    label: "Padrão",
    description: "Tema institucional Viagg",
    swatch: "hsl(158 55% 24%)",
    vars: {
      "--admin-primary": "158 55% 24%",
      "--admin-primary-foreground": "0 0% 100%",
      "--admin-card": "0 0% 100%",
      "--admin-card-foreground": "155 25% 10%",
      "--admin-accent": "38 92% 50%",
      "--admin-accent-foreground": "25 30% 12%",
      "--admin-border": "150 8% 82%",
      "--admin-muted": "145 6% 88%",
      "--admin-muted-foreground": "150 8% 40%",
      "--admin-background": "145 6% 96%",
    },
  },
  {
    id: "informacional",
    label: "Informacional",
    description: "Azul frio para dados e métricas",
    swatch: "hsl(210 70% 45%)",
    vars: {
      "--admin-primary": "210 70% 45%",
      "--admin-primary-foreground": "0 0% 100%",
      "--admin-card": "210 30% 99%",
      "--admin-card-foreground": "210 30% 10%",
      "--admin-accent": "195 80% 42%",
      "--admin-accent-foreground": "0 0% 100%",
      "--admin-border": "210 20% 85%",
      "--admin-muted": "210 15% 92%",
      "--admin-muted-foreground": "210 12% 45%",
      "--admin-background": "210 20% 97%",
    },
  },
  {
    id: "operacional",
    label: "Operacional",
    description: "Verde-escuro para foco operacional",
    swatch: "hsl(160 50% 28%)",
    vars: {
      "--admin-primary": "160 50% 28%",
      "--admin-primary-foreground": "0 0% 100%",
      "--admin-card": "160 10% 99%",
      "--admin-card-foreground": "160 30% 10%",
      "--admin-accent": "45 85% 50%",
      "--admin-accent-foreground": "30 40% 12%",
      "--admin-border": "160 12% 82%",
      "--admin-muted": "160 8% 90%",
      "--admin-muted-foreground": "160 10% 42%",
      "--admin-background": "160 10% 96%",
    },
  },
  {
    id: "premium",
    label: "Premium",
    description: "Dourado sofisticado para visão executiva",
    swatch: "hsl(35 80% 45%)",
    vars: {
      "--admin-primary": "35 80% 45%",
      "--admin-primary-foreground": "0 0% 100%",
      "--admin-card": "35 15% 99%",
      "--admin-card-foreground": "30 20% 12%",
      "--admin-accent": "20 75% 50%",
      "--admin-accent-foreground": "0 0% 100%",
      "--admin-border": "35 15% 82%",
      "--admin-muted": "35 10% 91%",
      "--admin-muted-foreground": "30 10% 42%",
      "--admin-background": "35 12% 96%",
    },
  },
  {
    id: "neutro",
    label: "Neutro",
    description: "Cinza profissional para análises extensas",
    swatch: "hsl(220 12% 40%)",
    vars: {
      "--admin-primary": "220 12% 40%",
      "--admin-primary-foreground": "0 0% 100%",
      "--admin-card": "220 5% 100%",
      "--admin-card-foreground": "220 10% 12%",
      "--admin-accent": "220 50% 55%",
      "--admin-accent-foreground": "0 0% 100%",
      "--admin-border": "220 8% 84%",
      "--admin-muted": "220 5% 92%",
      "--admin-muted-foreground": "220 5% 45%",
      "--admin-background": "220 5% 97%",
    },
  },
  {
    id: "noturno",
    label: "Noturno",
    description: "Escuro para operações de madrugada",
    swatch: "hsl(230 20% 18%)",
    vars: {
      "--admin-primary": "200 60% 50%",
      "--admin-primary-foreground": "0 0% 100%",
      "--admin-card": "230 18% 16%",
      "--admin-card-foreground": "220 10% 90%",
      "--admin-accent": "38 85% 55%",
      "--admin-accent-foreground": "30 30% 10%",
      "--admin-border": "230 12% 25%",
      "--admin-muted": "230 12% 22%",
      "--admin-muted-foreground": "220 8% 55%",
      "--admin-background": "230 20% 10%",
    },
  },
];

const STORAGE_KEY = "admin-palette-id";

interface AdminThemeContextValue {
  paletteId: string;
  palette: AdminPalette;
  setPaletteId: (id: string) => void;
  savePalette: () => void;
  previewPaletteId: string | null;
  setPreviewPaletteId: (id: string | null) => void;
  /** The effective palette (preview takes priority) */
  activePalette: AdminPalette;
}

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [paletteId, setPaletteIdState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || "padrao"
  );
  const [previewPaletteId, setPreviewPaletteId] = useState<string | null>(null);

  const palette = ADMIN_PALETTES.find((p) => p.id === paletteId) || ADMIN_PALETTES[0];
  const activePalette =
    (previewPaletteId && ADMIN_PALETTES.find((p) => p.id === previewPaletteId)) || palette;

  const setPaletteId = (id: string) => setPaletteIdState(id);

  const savePalette = () => {
    localStorage.setItem(STORAGE_KEY, paletteId);
  };

  // Apply CSS variables to the admin wrapper
  useEffect(() => {
    const el = document.getElementById("admin-theme-root");
    if (!el) return;
    const vars = activePalette.vars;
    Object.entries(vars).forEach(([key, value]) => {
      el.style.setProperty(key, value);
    });
  }, [activePalette]);

  return (
    <AdminThemeContext.Provider
      value={{
        paletteId,
        palette,
        setPaletteId,
        savePalette,
        previewPaletteId,
        setPreviewPaletteId,
        activePalette,
      }}
    >
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) throw new Error("useAdminTheme must be inside AdminThemeProvider");
  return ctx;
}
