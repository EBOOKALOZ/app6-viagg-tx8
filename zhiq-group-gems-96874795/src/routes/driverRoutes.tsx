/**
 * driverRoutes — rotas do motorista, freteiro e passageiro.
 */
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  AppLayout,
  DriverPanel,
  DriverCalls,
  FreteiroPanel,
  PassengerPanel,
  PassengerHistory,
} from "./lazyPages";

export const driverRoutes = (
  <>
    {/* Motorista */}
    <Route element={<ProtectedRoute requiredProfile="driver"><AppLayout /></ProtectedRoute>}>
      <Route path="/driver" element={<DriverPanel />} />
      <Route path="/driver/calls" element={<DriverCalls />} />
    </Route>

    {/* Freteiro */}
    <Route element={<ProtectedRoute requiredProfile="freteiro"><AppLayout /></ProtectedRoute>}>
      <Route path="/freteiro" element={<FreteiroPanel />} />
    </Route>

    {/* Passageiro */}
    <Route element={<ProtectedRoute requiredProfile="passenger"><AppLayout /></ProtectedRoute>}>
      <Route path="/passenger" element={<PassengerPanel />} />
      <Route path="/passenger/history" element={<PassengerHistory />} />
    </Route>
  </>
);
