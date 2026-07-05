import React, { useState } from "react";
import { Sparkles, Zap, DollarSign, Share2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CampaignItem {
  id: string;
  title: string;
  category: string;
  reward: string;
  engagement: string;
  tags: string[];
  isHot?: boolean;
}

interface ImpulsionarCampaignTabsProps {
  onSelectCampaign?: (campaign: CampaignItem) => void;
  profileType?: string;
}

const MOCK_CAMPAIGNS: CampaignItem[] = [
  {
    id: "camp-01",
    title: "Expansão de Bairro — Corridas com Desconto",
    category: "corridas",
    reward: "R$ 4,50 por corrida concluída",
    engagement: "Alta conversão nos horários de pico",
    tags: ["Moto-Táxi", "Passageiros", "Bairro"],
    isHot: true,
  },
  {
    id: "camp-02",
    title: "E-commerce & Restaurantes Locais",
    category: "entregas",
    reward: "15% de comissão no 1º pedido",
    engagement: "Excelente para grupos de condomínios",
    tags: ["Motoboy", "Delivery", "Alimentação"],
    isHot: true,
  },
  {
    id: "camp-03",
    title: "Traslados & Corridas Executivas VIP",
    category: "executivo",
    reward: "R$ 18,00 por agendamento validado",
    engagement: "Público corporativo e aeroportos",
    tags: ["Motorista", "Carros", "Premium"],
  },
  {
    id: "camp-04",
    title: "Bônus Indicação de Novos Operadores RIDV",
    category: "bonus",
    reward: "R$ 25,00 por novo motorista ativo",
    engagement: "Programa de indicação exponencial",
    tags: ["Todos", "Bônus", "Rede"],
    isHot: true,
  },
];

export function ImpulsionarCampaignTabs({ onSelectCampaign, profileType }: ImpulsionarCampaignTabsProps) {
  const [activeTab, setActiveTab] = useState("todas");

  const tabs = [
    { id: "todas", label: "Todas as Campanhas" },
    { id: "corridas", label: "Corridas" },
    { id: "entregas", label: "Entregas" },
    { id: "executivo", label: "Executivo" },
    { id: "bonus", label: "🔥 Bônus VIP" },
  ];

  const filteredCampaigns = activeTab === "todas"
    ? MOCK_CAMPAIGNS
    : MOCK_CAMPAIGNS.filter(c => c.category === activeTab);

  return (
    <div className="space-y-4">
      {/* Tabs list */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
              activeTab === tab.id
                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-black shadow-lg shadow-orange-500/20 scale-105"
                : "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Campaigns list */}
      <div className="space-y-3">
        {filteredCampaigns.map((camp) => (
          <div
            key={camp.id}
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/10 hover:border-orange-500/40 p-4 transition-all duration-300 hover:shadow-xl hover:shadow-orange-500/5"
          >
            {camp.isHot && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] font-black uppercase tracking-wider text-red-400">
                <Sparkles className="w-3 h-3 text-red-400 animate-spin" /> Em Alta
              </div>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5 pr-16">
                {camp.tags.map((tag, i) => (
                  <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/5 text-zinc-300 border border-white/5">
                    {tag}
                  </span>
                ))}
              </div>

              <h4 className="text-sm font-bold text-white group-hover:text-orange-400 transition-colors">
                {camp.title}
              </h4>

              <div className="flex items-center gap-2 pt-1 text-xs">
                <div className="flex items-center gap-1 font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
                  <DollarSign className="w-3.5 h-3.5" />
                  {camp.reward}
                </div>
              </div>

              <p className="text-[11px] text-zinc-400 font-medium pt-0.5">
                💡 {camp.engagement}
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-500">
                Pronta para envio
              </span>
              <Button
                size="sm"
                onClick={() => onSelectCampaign && onSelectCampaign(camp)}
                className="bg-white/10 hover:bg-orange-500 hover:text-black text-white font-bold text-xs h-8 px-3 rounded-xl transition-all gap-1 group-hover:bg-orange-500 group-hover:text-black"
              >
                <Share2 className="w-3.5 h-3.5" /> Divulgar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
