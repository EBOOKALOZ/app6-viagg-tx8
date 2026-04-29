import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const CARD_KEY = "gf_card_color";
const CANVAS_KEY = "gf_canvas_color";

interface AdminPanelColorsValue {
  cardColor: string;
  canvasColor: string;
  setCardColor: (c: string) => void;
  setCanvasColor: (c: string) => void;
}

const AdminPanelColorsContext = createContext<AdminPanelColorsValue | null>(null);

export function AdminPanelColorsProvider({ children }: { children: ReactNode }) {
  const [cardColor, setCardColorState] = useState(() => localStorage.getItem(CARD_KEY) || "#FFFFFF");
  const [canvasColor, setCanvasColorState] = useState(() => localStorage.getItem(CANVAS_KEY) || "#F4F6F8");

  const setCardColor = useCallback((c: string) => {
    setCardColorState(c);
    localStorage.setItem(CARD_KEY, c);
  }, []);

  const setCanvasColor = useCallback((c: string) => {
    setCanvasColorState(c);
    localStorage.setItem(CANVAS_KEY, c);
  }, []);

  return (
    <AdminPanelColorsContext.Provider value={{ cardColor, canvasColor, setCardColor, setCanvasColor }}>
      {children}
    </AdminPanelColorsContext.Provider>
  );
}

export function useAdminPanelColors() {
  const ctx = useContext(AdminPanelColorsContext);
  if (!ctx) throw new Error("useAdminPanelColors must be inside AdminPanelColorsProvider");
  return ctx;
}
