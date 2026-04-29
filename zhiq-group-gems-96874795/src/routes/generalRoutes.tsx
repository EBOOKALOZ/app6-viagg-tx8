/**
 * generalRoutes — rotas protegidas gerais (dashboard, perfil, carteira, etc.).
 */
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  AppLayout,
  Dashboard,
  ChooseProfile,
  ManageProfiles,
  Profile,
  Groups,
  GroupsPage,
  Wallet,
  ReferFriends,
} from "./lazyPages";

export const generalRoutes = (
  <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/choose-profile" element={<ChooseProfile />} />
    <Route path="/manage-profiles" element={<ManageProfiles />} />
    <Route path="/profile" element={<Profile />} />
    <Route path="/groups" element={<Groups />} />
    <Route path="/groups-page" element={<GroupsPage />} />
    <Route path="/wallet" element={<Wallet />} />
    <Route path="/refer-friends" element={<ReferFriends />} />
  </Route>
);
