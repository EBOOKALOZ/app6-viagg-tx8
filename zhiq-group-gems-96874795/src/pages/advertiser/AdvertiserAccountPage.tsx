import React from "react";
import { useAdvertiserAccountData } from "@/hooks/useAdvertiserAccountData";
import LoadingTransition from "@/pages/LoadingTransition";
import { AccountIdentitySection } from "@/components/advertiser/account/AccountIdentitySection";
import { ProfileStatusChecklist } from "@/components/advertiser/account/ProfileStatusChecklist";
import { SecuritySettingsSection } from "@/components/advertiser/account/SecuritySettingsSection";
import { PlanBenefitsSection } from "@/components/advertiser/account/PlanBenefitsSection";
import { AccountPreferencesSection } from "@/components/advertiser/account/AccountPreferencesSection";
import { OperationalSummarySection } from "@/components/advertiser/account/OperationalSummarySection";
import MerchantSettingsContent from "@/pages/MerchantSettingsContent";
import { FooterNeutral } from "@/components/FooterNeutral";
import { ShieldAlert, Store } from "lucide-react";

export default function AdvertiserAccountPage() {
  const { data: account, isLoading, isError } = useAdvertiserAccountData();

  if (isLoading) return <LoadingTransition />;

  // Note: account will now have safe fallbacks even if DB fetch fails
  const data = account!;

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20 flex-1 flex flex-col">
      
      {/* Row 1: Identity & Status Checklist */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10 items-stretch">
         <div className="xl:col-span-2">
           <AccountIdentitySection data={account} />
         </div>
         <div className="xl:col-span-1 h-full">
           <div className="h-full">
             <ProfileStatusChecklist data={account} />
           </div>
         </div>
      </div>

      {/* Row 2: Plan Benefits & Operational Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
         <div className="xl:col-span-2">
           <PlanBenefitsSection data={account} />
         </div>
         <div className="xl:col-span-1">
           <OperationalSummarySection data={account} />
         </div>
      </div>

      {/* Row 3: Preferences & Security */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-10">
         <div className="xl:col-span-1">
           <AccountPreferencesSection data={account} />
         </div>
         <div className="xl:col-span-2">
           <SecuritySettingsSection />
         </div>
      </div>

      {/* Row 4: Store Settings */}
      <div className="pt-2">
         <div className="flex items-center gap-2 text-[#FF6A00] font-black uppercase tracking-widest text-[11px] mb-6 pl-2">
            Configuração da Loja (Localização e Dados Comerciais)
         </div>
         <div className="bg-card rounded-[2rem] border shadow-2xl overflow-hidden pb-4">
            <MerchantSettingsContent />
         </div>
      </div>

      {/* Rodapé preto */}
      <div className="mt-auto pt-10 rounded-2xl overflow-hidden">
         <FooterNeutral />
      </div>
    </div>
  );
}
