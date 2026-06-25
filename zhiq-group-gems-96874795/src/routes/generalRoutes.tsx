/**
 * generalRoutes — rotas protegidas gerais (dashboard, perfil, carteira, etc.).
 */
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  AppLayout,
  Dashboard,
  ChooseProfile,
  ManageProfiles,
  Profile,
  MinhaConta,
  Groups,
  GroupsPage,
  Wallet,
  ReferFriends,
} from "./lazyPages";

export const generalRoutes = (
  <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/select-profile" element={<ChooseProfile />} />
    <Route path="/choose-profile" element={<Navigate to="/select-profile" replace />} />
    <Route path="/manage-profiles" element={<ManageProfiles />} />
    <Route path="/profile" element={<Profile />} />
    <Route path="/minha-conta" element={<MinhaConta />} />
    <Route path="/groups" element={<Groups />} />
    <Route path="/groups-page" element={<GroupsPage />} />
    <Route path="/wallet" element={<Wallet />} />
    <Route path="/refer-friends" element={<ReferFriends />} />
  </Route>
);
