/**
 * convenioAdminRoutes — Comando Convênio Fase 1.
 * Rotas do Super Painel Administrativo exclusivo do Gestor de Convênios.
 * Totalmente independente do painel /admin existente.
 */
import { Suspense } from "react";
import { Route, Outlet } from "react-router-dom";
import { GestorConvenioProtectedRoute } from "@/components/convenio/GestorConvenioProtectedRoute";
import { GestorPanelLayout } from "@/components/convenio/GestorPanelLayout";
import PageFallback from "@/components/PageFallback";
import {
  GestorLoginPage,
  GestorDashboardPage,
  GestorConveniosPage,
  GestorCredenciamentoHubPage,
  GestorClinicasPage,
  GestorLaboratoriosPage,
  GestorFarmaciasPage,
  GestorHospitaisPage,
  GestorInstituicoesPage,
  GestorParceirosPage,
  GestorCampanhasPage,
  GestorDoacoesPage,
  GestorPrestacaoContasPage,
  GestorRelatoriosPage,
  GestorAuditoriaPage,
  GestorMensagensPage,
  GestorConfiguracoesPage,
} from "./lazyPages";

export const convenioAdminRoutes = (
  <>
    {/* Login exclusivo — fora do gate, senão vira loop de redirecionamento */}
    <Route
      path="/convenio-admin/login"
      element={<Suspense fallback={<PageFallback />}><GestorLoginPage /></Suspense>}
    />

    <Route
      element={
        <GestorConvenioProtectedRoute>
          <GestorPanelLayout><Outlet /></GestorPanelLayout>
        </GestorConvenioProtectedRoute>
      }
    >
      <Route path="/convenio-admin" element={<Suspense fallback={<PageFallback />}><GestorDashboardPage /></Suspense>} />
      <Route path="/convenio-admin/convenios" element={<Suspense fallback={<PageFallback />}><GestorConveniosPage /></Suspense>} />
      <Route path="/convenio-admin/credenciamento" element={<Suspense fallback={<PageFallback />}><GestorCredenciamentoHubPage /></Suspense>} />
      <Route path="/convenio-admin/credenciamento/clinicas" element={<Suspense fallback={<PageFallback />}><GestorClinicasPage /></Suspense>} />
      <Route path="/convenio-admin/credenciamento/laboratorios" element={<Suspense fallback={<PageFallback />}><GestorLaboratoriosPage /></Suspense>} />
      <Route path="/convenio-admin/credenciamento/farmacias" element={<Suspense fallback={<PageFallback />}><GestorFarmaciasPage /></Suspense>} />
      <Route path="/convenio-admin/credenciamento/hospitais" element={<Suspense fallback={<PageFallback />}><GestorHospitaisPage /></Suspense>} />
      <Route path="/convenio-admin/credenciamento/instituicoes" element={<Suspense fallback={<PageFallback />}><GestorInstituicoesPage /></Suspense>} />
      <Route path="/convenio-admin/credenciamento/parceiros" element={<Suspense fallback={<PageFallback />}><GestorParceirosPage /></Suspense>} />
      <Route path="/convenio-admin/campanhas" element={<Suspense fallback={<PageFallback />}><GestorCampanhasPage /></Suspense>} />
      <Route path="/convenio-admin/doacoes" element={<Suspense fallback={<PageFallback />}><GestorDoacoesPage /></Suspense>} />
      <Route path="/convenio-admin/prestacao-de-contas" element={<Suspense fallback={<PageFallback />}><GestorPrestacaoContasPage /></Suspense>} />
      <Route path="/convenio-admin/relatorios" element={<Suspense fallback={<PageFallback />}><GestorRelatoriosPage /></Suspense>} />
      <Route path="/convenio-admin/auditoria" element={<Suspense fallback={<PageFallback />}><GestorAuditoriaPage /></Suspense>} />
      <Route path="/convenio-admin/mensagens" element={<Suspense fallback={<PageFallback />}><GestorMensagensPage /></Suspense>} />
      <Route path="/convenio-admin/configuracoes" element={<Suspense fallback={<PageFallback />}><GestorConfiguracoesPage /></Suspense>} />
    </Route>
  </>
);
