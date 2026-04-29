import { useState } from "react";
import AdminDashboard from "./admin/AdminDashboard";
import MerchantPanelContent from "./MerchantPanelContent";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { AdminPanelColorsProvider } from "@/contexts/AdminPanelColorsContext";

/**
 * Esta página é apenas para desenvolvimento (DEV).
 * Coloca o Painel Lojista de um lado e o Admin do outro.
 */
export default function DevSplitView() {
    const { user } = useAuth();
    const [splitRatio, setSplitRatio] = useState(50);

    if (!user) return <Navigate to="/auth" replace />;

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-background">
            {/* Lado Esquerdo - Lojista */}
            <div
                className="h-full overflow-y-auto border-r border-border"
                style={{ width: `${splitRatio}%` }}
            >
                <div className="bg-primary/5 text-primary text-center p-2 text-xs font-bold uppercase tracking-wider sticky top-0 z-50 backdrop-blur-md">
                    🟢 Visão do Lojista (APP)
                </div>
                <div className="relative isolate">
                    <MerchantPanelContent />
                </div>
            </div>

            {/* Resize Handle (Opcional - mas legal pra ajustar o tamanho) */}
            <div
                className="w-2 bg-muted hover:bg-primary/50 cursor-col-resize flex flex-col items-center justify-center shrink-0 z-50 transition-colors"
                onMouseDown={(e) => {
                    const startX = e.clientX;
                    const startRatio = splitRatio;

                    const onMouseMove = (moveEvent: MouseEvent) => {
                        const diff = moveEvent.clientX - startX;
                        const newRatio = startRatio + (diff / window.innerWidth) * 100;
                        // Limitar entre 20% e 80%
                        setSplitRatio(Math.min(Math.max(newRatio, 20), 80));
                    };

                    const onMouseUp = () => {
                        document.removeEventListener("mousemove", onMouseMove);
                        document.removeEventListener("mouseup", onMouseUp);
                    };

                    document.addEventListener("mousemove", onMouseMove);
                    document.addEventListener("mouseup", onMouseUp);
                }}
            >
                <div className="h-8 w-1 bg-border rounded-full" />
            </div>

            {/* Lado Direito - Admin */}
            <div
                className="h-full overflow-y-auto bg-admin-background"
                style={{ width: `calc(${100 - splitRatio}% - 8px)` }}
            >
                <div className="bg-primary text-primary-foreground text-center p-2 text-xs font-bold uppercase tracking-wider sticky top-0 z-50 shadow-md">
                    🛡️ Visão do Administrador (PAINEL)
                </div>
                <div className="p-4 relative isolate">
                    <AdminThemeProvider>
                        <AdminPanelColorsProvider>
                            <AdminDashboard />
                        </AdminPanelColorsProvider>
                    </AdminThemeProvider>
                </div>
            </div>
        </div>
    );
}
