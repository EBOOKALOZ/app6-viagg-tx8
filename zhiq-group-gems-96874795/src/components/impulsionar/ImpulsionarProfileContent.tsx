import React from "react";
import { Bike, Car, Shield, Target, Award, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImpulsionarProfileContentProps {
  profileType: 'motoboy' | 'mototaxi' | 'driver' | string;
}

export function ImpulsionarProfileContent({ profileType }: ImpulsionarProfileContentProps) {
  const getProfileData = () => {
    switch (profileType) {
      case 'mototaxi':
        return {
          title: "Impulsionamento para Moto-Táxi",
          badge: "Módulo Passageiros & Corridas Rápidas",
          icon: Bike,
          color: "from-yellow-400 to-amber-500",
          textColor: "text-amber-400",
          borderColor: "border-amber-500/30",
          bgColor: "bg-amber-500/10",
          description: "Aumente as solicitações de corridas na sua região compartilhando links estratégicos em grupos de bairro e comércio local.",
          tips: [
            "Divulgue nos horários de pico (07h-09h e 17h-19h) para maior conversão.",
            "Links direcionados a grupos de faculdades e shoppings geram até 40% mais comissão.",
            "Ganhos creditados automaticamente na sua carteira a cada corrida concluída via seu link."
          ]
        };
      case 'driver':
        return {
          title: "Impulsionamento para Motoristas",
          badge: "Módulo Corridas Premium & Aeroportos",
          icon: Car,
          color: "from-blue-400 to-indigo-600",
          textColor: "text-blue-400",
          borderColor: "border-blue-500/30",
          bgColor: "bg-blue-500/10",
          description: "Promova serviços executivos, viagens intermunicipais e traslados em grupos empresariais e condomínios de alto padrão.",
          tips: [
            "Concentre suas divulgações em grupos de condomínios residenciais e centros empresariais.",
            "Corridas agendadas geram comissões especiais com bônus de fidelidade.",
            "Acompanhe o impacto em tempo real através dos gráficos de conversão abaixo."
          ]
        };
      case 'motoboy':
      default:
        return {
          title: "Impulsionamento para Motoboy",
          badge: "Módulo Entregas & E-commerce Local",
          icon: Bike,
          color: "from-orange-400 to-red-500",
          textColor: "text-orange-400",
          borderColor: "border-orange-500/30",
          bgColor: "bg-orange-500/10",
          description: "Conecte comércios locais, restaurantes e farmácias à nossa rede de entregas rápidas divulgando campanhas exclusivas.",
          tips: [
            "Restaurantes e lanchonetes têm maior adesão nos horários próximos às 11h e 18h.",
            "Cada novo comércio ativado na sua região garante comissão recorrente nas 10 primeiras entregas.",
            "Utilize as legendas geradas por Inteligência Artificial para aumentar o engajamento nos grupos."
          ]
        };
    }
  };

  const data = getProfileData();
  const Icon = data.icon;

  return (
    <div className={cn("rounded-3xl p-5 border bg-gradient-to-b from-white/[0.04] to-transparent relative overflow-hidden", data.borderColor)}>
      <div className="flex items-start gap-3.5 mb-4">
        <div className={cn("p-3 rounded-2xl bg-gradient-to-br text-black shadow-lg shrink-0", data.color)}>
          <Icon className="w-6 h-6 stroke-[2.5]" />
        </div>
        <div>
          <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border inline-block mb-1", data.bgColor, data.textColor, data.borderColor)}>
            {data.badge}
          </span>
          <h3 className="text-base font-bold text-white leading-tight">{data.title}</h3>
          <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{data.description}</p>
        </div>
      </div>

      <div className="space-y-2 mt-4 pt-4 border-t border-white/10">
        <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
          <Target className="w-4 h-4 text-emerald-400" />
          <span>Estratégia Recomendada para seu Perfil:</span>
        </div>

        <ul className="space-y-1.5">
          {data.tips.map((tip, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-zinc-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
