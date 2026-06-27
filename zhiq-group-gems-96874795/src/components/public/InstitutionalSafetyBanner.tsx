import React from "react";
import {
  ShieldAlert, AlertTriangle, Ban, HandCoins, Building2,
  Car, Plane, Wrench, Truck, Info, Phone, Eye, FileX,
} from "lucide-react";

const DISCLAIMER_ITEMS = [
  { Icon: HandCoins,   text: "Pagamentos, cobranças ou transferências entre usuários e anunciantes." },
  { Icon: Ban,         text: "Inadimplência, golpes, fraudes ou calotes praticados por anunciantes." },
  { Icon: FileX,       text: "Veracidade, qualidade ou disponibilidade dos produtos/serviços anunciados." },
  { Icon: Eye,         text: "Autenticidade das fotos, documentos ou descrições publicadas nos anúncios." },
  { Icon: Building2,   text: "Negociações imobiliárias, contratos de compra/venda ou locação de imóveis." },
  { Icon: Car,         text: "Transferência de veículos, vistoria, multas ou dívidas pendentes do bem." },
  { Icon: Plane,       text: "Cancelamentos de viagens, voos, hospedagens ou pacotes turísticos." },
  { Icon: Wrench,      text: "Qualidade, prazo ou resultado de serviços prestados por terceiros." },
  { Icon: Truck,       text: "Avarias, extravios ou atrasos em fretes e mudanças contratados." },
  { Icon: Phone,       text: "Acordos verbais ou negociações feitas fora da plataforma (WhatsApp, ligação etc.)." },
];

const SEGMENT_WARNINGS = [
  { emoji: "🏠", label: "Imóveis",          text: "Não somos corretora nem imobiliária registrada no CRECI. Toda negociação é de responsabilidade exclusiva das partes." },
  { emoji: "🚗", label: "Veículos",          text: "Não somos revendedora nem dealer. Verifique documentação, débitos e condições do veículo antes de qualquer transação." },
  { emoji: "✈️", label: "Viagens",           text: "Não somos agência de viagens registrada. Confirme todos os detalhes diretamente com a operadora antes de pagar." },
  { emoji: "🔧", label: "Serviços",          text: "Não contratamos prestadores de serviço. A relação é direta entre cliente e prestador." },
  { emoji: "🚚", label: "Fretes",            text: "Não somos transportadora. Avalie o freteiro, solicite nota fiscal e registre o estado da carga antes do transporte." },
];

export const InstitutionalSafetyBanner: React.FC = () => {
  return (
    <div className="w-full mb-8 mt-0">
      <div className="relative overflow-hidden bg-[#D90000] border-y border-white/20 shadow-2xl">
        {/* Glows decorativos */}
        <div className="absolute top-0 right-0 -mt-24 -mr-24 w-[500px] h-[500px] bg-white/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-24 -ml-24 w-[400px] h-[400px] bg-black/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 p-6 md:p-10 lg:p-14 space-y-10">

          {/* ── Cabeçalho ── */}
          <div className="flex flex-col items-center text-center gap-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/25 border border-white/20 backdrop-blur-sm">
              <ShieldAlert className="w-4 h-4 text-yellow-300 shrink-0" />
              <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Aviso Oficial de Segurança & Transparência</span>
            </div>

            <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-none max-w-4xl">
              ESTA PLATAFORMA É UMA <span className="text-yellow-300">VITRINE DE ANÚNCIOS</span> — NÃO INTERMEDIAMOS NEGOCIAÇÕES
            </h2>

            <p className="text-white/90 text-base md:text-lg font-medium max-w-3xl leading-relaxed">
              A <strong className="text-white">Viagg-TX8</strong> conecta anunciantes e interessados, mas <strong className="text-yellow-300">não participa, não garante e não é responsável</strong> por qualquer negociação, pagamento ou transação realizada entre as partes.
            </p>

            <div className="inline-flex items-center justify-center bg-[#F5E62B] text-[#D90000] font-black px-6 py-3 rounded-xl text-sm border-2 border-[#D90000]/20 shadow-lg uppercase tracking-wide animate-vtx-blink">
              <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
              A PLATAFORMA NÃO É RESPONSÁVEL POR PAGAMENTOS OU ACORDOS ENTRE USUÁRIOS
            </div>
          </div>

          {/* ── Grade de isenções ── */}
          <div className="space-y-4">
            <h3 className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 justify-center">
              <Ban className="w-4 h-4 text-yellow-300" />
              NÃO NOS RESPONSABILIZAMOS POR:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {DISCLAIMER_ITEMS.map(({ Icon, text }, i) => (
                <div key={i} className="flex items-start gap-3 bg-black/20 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                  <div className="shrink-0 mt-0.5 w-8 h-8 rounded-xl bg-[#F5E62B]/15 border border-[#F5E62B]/30 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-yellow-300" />
                  </div>
                  <p className="text-white/85 text-xs font-medium leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Avisos por segmento ── */}
          <div className="space-y-4">
            <h3 className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 justify-center">
              <Info className="w-4 h-4 text-yellow-300" />
              AVISO ESPECÍFICO POR SEGMENTO:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {SEGMENT_WARNINGS.map(({ emoji, label, text }, i) => (
                <div key={i} className="bg-black/20 border border-white/10 rounded-2xl p-4 backdrop-blur-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl leading-none">{emoji}</span>
                    <span className="text-yellow-300 font-black text-xs uppercase tracking-widest">{label}</span>
                  </div>
                  <p className="text-white/80 text-xs font-medium leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Rodapé legal ── */}
          <div className="border-t border-white/20 pt-6 text-center space-y-2">
            <p className="text-white/70 text-xs font-medium max-w-4xl mx-auto leading-relaxed">
              Ao utilizar esta plataforma você declara ciência de que a <strong className="text-white">Viagg-TX8</strong> atua exclusivamente como vitrine digital e ferramenta de conexão entre anunciantes e interessados, sem qualquer responsabilidade civil, criminal ou financeira por atos praticados pelas partes. Toda e qualquer negociação é realizada por conta e risco exclusivos dos usuários envolvidos.
            </p>
            <p className="text-yellow-200/60 text-[10px] font-bold uppercase tracking-widest">
              © 2026 Viagg-TX8™ · Plataforma de Vitrine e Conexão · Não somos intermediador financeiro
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
