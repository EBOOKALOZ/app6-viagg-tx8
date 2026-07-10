/**
 * AdminMotoTaxiFinanceiro — Análise Financeira Exclusiva para MOTO TÁXI
 * Rota: /admin/moto-taxi-financeiro
 */
import React from "react";
import { ProfileFinancialDashboard } from "@/components/admin/ProfileFinancialDashboard";

export default function AdminMotoTaxiFinanceiro() {
  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-4">
      <ProfileFinancialDashboard
        profileType="mototaxi"
        title="Análise Financeira — Moto Táxi"
        subtitle="Dashboard executivo, KPIs de corridas, comissões em tempo real, rankings de faturamento e exportação de relatórios exclusivos da vertical de Moto Táxi."
        accentColor="#3b82f6"
      />
    </div>
  );
}
