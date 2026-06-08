import { Outlet, useLocation } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { FooterProfile } from "@/components/FooterProfile";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";
import { AdminPanelColorsProvider, useAdminPanelColors } from "@/contexts/AdminPanelColorsContext";
import { isDarkColor } from "@/components/admin/GroupColorPicker";

function AdminLayoutInner() {
  const { canvasColor } = useAdminPanelColors();
  const darkCanvas = isDarkColor(canvasColor);
  const location = useLocation();

  // Páginas do menu Multi-Perfil recebem fundo verde
  const isMultiPerfil = location.pathname.startsWith("/admin/perfis");
  const effectiveCanvasColor = isMultiPerfil ? "#E8F5E9" : canvasColor;
  const effectiveDark = isDarkColor(effectiveCanvasColor);

  return (
    <div
      className="flex min-h-screen w-full"
      id="admin-theme-root"
      style={{
        backgroundColor: effectiveCanvasColor,
        color: effectiveDark ? "#fff" : "hsl(var(--admin-card-foreground, var(--foreground)))",
      }}
    >
      <AdminSidebar />
      <div className="flex-1 flex flex-col">
        <main className="flex-1 overflow-auto">
          <div className="container py-6">
            <Outlet />
          </div>
        </main>
        <FooterProfile profile="admin" />
      </div>
    </div>
  );
}

export function AdminLayout() {
  return (
    <AdminThemeProvider>
      <AdminPanelColorsProvider>
        <AdminLayoutInner />
      </AdminPanelColorsProvider>
    </AdminThemeProvider>
  );
}
