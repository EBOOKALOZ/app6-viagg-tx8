import { Navigate, Outlet } from "react-router-dom";
import { OperadorSidebar } from "./OperadorSidebar";
import { BackgroundMusic } from "./BackgroundMusic";
import { Footer } from "@/components/Footer";
import { useMarketingRole } from "@/hooks/useMarketingRole";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { OperatorLiveProvider } from "@/providers/OperatorLiveProvider";

export function OperadorLayout() {
  const { user, isLoading: authLoading } = useAuth();
  const { marketingRole, isLoading: roleLoading } = useMarketingRole();

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If not a postador, redirect to admin
  if (marketingRole !== "postador") {
    return <Navigate to="/administrador" replace />;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <OperadorSidebar />
      <div className="flex-1 flex flex-col">
        <main className="flex-1 overflow-auto">
          <div className="container py-6">
            <OperatorLiveProvider>
              <Outlet />
            </OperatorLiveProvider>
          </div>
        </main>
        <Footer />
        <BackgroundMusic />
      </div>
    </div>
  );
}
