/**
 * AdminMotoboyFinanceiro — Análise Financeira Exclusiva para MOTOBOY (Entregas)
 * Rota: /admin/motoboy-financeiro
 */
import React from "react";
import { ProfileFinancialDashboard } from "@/components/admin/ProfileFinancialDashboard";

export default function AdminMotoboyFinanceiro() {
  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-4">
      <ProfileFinancialDashboard
        profileType="delivery"
        title="Análise Financeira — Motoboy (Entregas)"
        subtitle="Dashboard executivo, KPIs operacionais, auditoria de repasses, rankings e exportação de relatórios exclusivos da vertical de Motoboys."
        accentColor="#f97316"
      />
    </div>
  );
}
