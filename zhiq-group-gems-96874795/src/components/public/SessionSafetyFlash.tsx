import { useState, useEffect } from "react";

const SHOW_DURATION_MS = 3000; // 3 segundos

export function SessionSafetyFlash() {
  const [visible, setVisible] = useState(true);
  const [redPhase, setRedPhase] = useState(true);

  useEffect(() => {
    const blink = setInterval(() => setRedPhase((p) => !p), 350);
    const hide = setTimeout(() => {
      setVisible(false);
      clearInterval(blink);
    }, SHOW_DURATION_MS);

    return () => {
      clearInterval(blink);
      clearTimeout(hide);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center pb-8 sm:pb-0"
      style={{ pointerEvents: "none" }}
    >
      <div
        className="mx-4 px-6 py-4 rounded-2xl text-center font-black text-sm sm:text-base lg:text-lg uppercase tracking-widest shadow-2xl border-4 max-w-xs sm:max-w-sm"
        style={{
          backgroundColor: redPhase ? "#D90000" : "#F5E62B",
          color:           redPhase ? "#F5E62B" : "#D90000",
          borderColor:     redPhase ? "#F5E62B" : "#D90000",
          transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
        }}
      >
        🚨 A PLATAFORMA NÃO É RESPONSÁVEL POR PAGAMENTOS
      </div>
    </div>
  );
}
