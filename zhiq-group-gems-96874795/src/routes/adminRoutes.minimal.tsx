import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AdminLayout from "@/components/admin/AdminLayout";

export const adminRoutes = (
  <>
    <Route element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
      <Route path="/admin" element={<div style={{padding: '2rem'}}><h1>Admin Dashboard Minimal</h1><p>Funcionou!</p></div>} />
    </Route>
  </>
);
