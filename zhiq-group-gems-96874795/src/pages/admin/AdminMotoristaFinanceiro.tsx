/**
 * AdminMotoristaFinanceiro — Análise Financeira Exclusiva para MOTORISTA (Carros/Corridas)
 * Rota: /admin/motorista-financeiro
 */
import React from "react";
import { ProfileFinancialDashboard } from "@/components/admin/ProfileFinancialDashboard";

export default function AdminMotoristaFinanceiro() {
  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-4">
      <ProfileFinancialDashboard
        profileType="ride"
        title="Análise Financeira — Motorista"
        subtitle="Dashboard executivo, KPIs de viagens de passageiros, comissão dinâmica, rankings operacionais e exportação de relatórios exclusivos da vertical de Motoristas."
        accentColor="#f59e0b"
      />
    </div>
  );
}
