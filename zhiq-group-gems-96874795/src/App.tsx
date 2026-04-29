import { Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { GlobalCallProvider } from "@/contexts/GlobalCallContext";
import { SoundSettingsProvider } from "@/contexts/SoundSettingsContext";
import { FloatingCartButton } from "@/components/public/FloatingCartButton";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageFallback from "@/components/PageFallback";
import { Index, NotFound } from "@/routes/lazyPages";

/* ── Módulos de rotas ── */
import { publicRoutes } from "@/routes/publicRoutes";
import { supportRoutes } from "@/routes/supportRoutes";
import { generalRoutes } from "@/routes/generalRoutes";
import { merchantRoutes } from "@/routes/merchantRoutes";
import { motoboyRoutes } from "@/routes/motoboyRoutes";
import { driverRoutes } from "@/routes/driverRoutes";
import { adminRoutes } from "@/routes/adminRoutes";
import { advertiserRoutes } from "@/routes/advertiserRoutes";

/* ================================
   Query Client
================================ */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Dados expiram na hora, forçando atualização real
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: true, // Atualiza quando usuário volta pra aba
      refetchInterval: 10000, // Sempre atualizar a cada 10 segundos
      retry: 1,
    },
    mutations: {
      onSuccess: () => {
        // Ao cadastrar, editar ou excluir, atualizar a página automaticamente
        queryClient.invalidateQueries();
      }
    }
  },
});

/* ================================
   APP
================================ */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SoundSettingsProvider>
            <GlobalCallProvider>
              <TooltipProvider>
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    {/* ── Rotas públicas / auth / legal ── */}
                    {publicRoutes}

                    {/* ── Suporte ao cliente ── */}
                    {supportRoutes}

                    {/* ── Área geral protegida ── */}
                    {generalRoutes}

                    {/* ── Merchant — ErrorBoundary isolado ── */}
                    <Route element={<ErrorBoundary><Outlet /></ErrorBoundary>}>
                      {merchantRoutes}
                    </Route>

                    {/* ── Motoboy / Mototáxi — ErrorBoundary isolado ── */}
                    <Route element={<ErrorBoundary><Outlet /></ErrorBoundary>}>
                      {motoboyRoutes}
                    </Route>

                    {/* ── Driver / Freteiro / Passageiro ── */}
                    {driverRoutes}

                    {/* ── Admin — ErrorBoundary isolado ── */}
                    <Route element={<ErrorBoundary><Outlet /></ErrorBoundary>}>
                      {adminRoutes}
                    </Route>

                    {/* ── Anunciante — ErrorBoundary isolado ── */}
                    <Route element={<ErrorBoundary><Outlet /></ErrorBoundary>}>
                      {advertiserRoutes}
                    </Route>

                    {/* ── Index / catch-all ── */}
                    <Route path="/" element={<Index />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>

                  {/* Carrinho flutuante global para páginas públicas */}
                  <FloatingCartButton />
                </Suspense>
              </TooltipProvider>
            </GlobalCallProvider>
          </SoundSettingsProvider>
        </AuthProvider>
      </BrowserRouter>
      <Toaster />
      <Sonner />
    </QueryClientProvider>
  );
}
