import React from "react";
import { 
  Building2, 
  Package, 
  PlusCircle, 
  UserCircle, 
  CreditCard, 
  TrendingUp, 
  ArrowRight,
  Plus,
  MessageSquare
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const actions = [
  {
    title: "MEUS ANÚNCIOS",
    description: "Gerencie suas ofertas ativas e pausadas.",
    icon: Package,
    color: "bg-orange-500",
    href: "/anunciante/meus-anuncios",
    stats: "0 Ativos",
  },
  {
    title: "CRIAR NOVO ANÚNCIO",
    description: "Publique um novo imóvel ou produto agora.",
    icon: PlusCircle,
    color: "bg-[#FF6A00]",
    href: "/anunciante/anuncios/novo",
    isPrimary: true,
  },
  {
    title: "MINHA CONTA",
    description: "Edite seus dados e preferências.",
    icon: UserCircle,
    color: "bg-[#2A3038]",
    href: "/anunciante/conta",
  },
  {
    title: "CRÉDITOS / PLANOS",
    description: "Acompanhe seus créditos e assinaturas.",
    icon: CreditCard,
    color: "bg-emerald-600",
    href: "/anunciante/creditos",
    stats: "R$ 0,00",
  },
  {
    title: "MENSAGENS / LEADS",
    description: "Gerencie perguntas e intenções de contato.",
    icon: MessageSquare,
    color: "bg-[#2A3038]",
    href: "/anunciante/mensagens",
    stats: "Perguntas de Visitantes",
  },
];

export function AdvertiserOverviewCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
      {actions.map((action) => (
        <Link key={action.title} to={action.href} className="group flex h-full">
          <Card className={cn(
            "border border-[#2A3038] shadow-lg shadow-black/30 rounded-[28px] overflow-hidden hover:-translate-y-1 transition-all duration-300 w-full flex flex-col h-full",
            action.isPrimary ? "bg-[#0D0F12]" : "bg-[#1B1F24]"
          )}>
            <CardContent className="p-8 space-y-4 flex flex-col h-full">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center p-0.5 shadow-lg shadow-black/5 transition-all group-hover:scale-110",
                action.isPrimary ? "bg-orange-500 text-white" : `${action.color} text-white`
              )}>
                <action.icon className="w-6 h-6" />
              </div>

              <div className="space-y-1 flex-1">
                 <h3 className="font-black text-xs uppercase tracking-[0.1em] text-[#F5F7FA]">{action.title}</h3>
                 <p className="text-[11px] font-bold leading-relaxed text-[#A7B0BE]">
                    {action.description}
                 </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#2A3038] group-hover:border-[#FF6A00]/20 transition-all mt-auto">
                 {action.stats ? (
                   <span className="text-[10px] font-black uppercase tracking-widest text-[#FF6A00]">{action.stats}</span>
                 ) : (
                   <span className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE]">Gerenciar</span>
                 )}
                 <ArrowRight className="w-4 h-4 text-[#A7B0BE] transition-transform group-hover:translate-x-1 group-hover:text-[#FF6A00]" />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
