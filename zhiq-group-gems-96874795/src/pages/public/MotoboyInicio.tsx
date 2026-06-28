import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bike, MapPin, ArrowRight, ChevronLeft, Package } from "lucide-react";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import motoboyHero from "@/assets/motoboy-hero.png";

export default function MotoboyInicio() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      onSearchSubmit={(val) => navigate(`/mercado?q=${encodeURIComponent(val)}`)}
      hideCart
      headerChildren={<MarketNavButtons />}
      blueFooter
      blueFooterLabel="🛵 Motoboy"
      mainClassName="bg-gradient-to-b from-[#FF6A00] via-[#FF8C00] to-[#F5E62B]"
    >
      <div className="min-h-[calc(100vh-160px)] flex flex-col items-center justify-center px-4 py-10">
        {/* Título */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shadow-lg overflow-hidden border-2 border-white/30">
              <img src={motoboyHero} alt="Motoboy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.classList.remove('hidden'); }} />
              <Bike className="w-8 h-8 text-white hidden" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-white drop-shadow">Módulo Motoboy</h1>
          <p className="text-orange-100 text-base mt-1">Plataforma VIAGG-TX8™</p>
        </div>

        {/* Cards */}
        <div className="w-full max-w-sm flex flex-col gap-5">
          {/* Card 1: Sou Motoboy */}
          <button
            onClick={() => navigate("/select-profile")}
            className="group relative overflow-hidden bg-white rounded-3xl shadow-2xl p-8 text-center flex flex-col items-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            {/* Fundo decorativo */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF6A00]/5 to-[#FF8C00]/10 pointer-events-none" />

            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] flex items-center justify-center shadow-xl overflow-hidden border-2 border-white/50">
              <img src={motoboyHero} alt="Motoboy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.classList.remove('hidden'); }} />
              <Bike className="w-11 h-11 text-white hidden" />
            </div>

            <div>
              <p className="text-2xl font-black text-zinc-900 tracking-tight">QUERO SER MOTOBOY</p>
              <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
                Quero me cadastrar e receber<br />corridas na plataforma
              </p>
            </div>

            <div className="flex items-center gap-2 px-6 py-2.5 bg-[#FF6A00] rounded-2xl shadow-lg mt-1">
              <span className="text-white font-black text-sm">Entrar como motoboy</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </div>

            {/* Badge */}
            <span className="absolute top-4 right-4 bg-green-100 text-green-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide">
              Ganhe dinheiro
            </span>
          </button>

          {/* Card 2: Solicitante de Motoboy */}
          <button
            onClick={() => navigate("/chamar-motoboy")}
            className="group relative overflow-hidden bg-zinc-900 rounded-3xl shadow-2xl p-8 text-center flex flex-col items-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            {/* Fundo decorativo — z-0 para não cobrir conteúdo */}
            <div className="absolute inset-0 z-0 bg-gradient-to-br from-zinc-800 to-zinc-950 pointer-events-none" />

            {/* Conteúdo — z-10 acima do overlay */}
            <div className="relative z-10 flex flex-col items-center gap-4">
              {/* Ícone composto: motoboy */}
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-[#F5E62B] flex items-center justify-center shadow-xl overflow-hidden border-2 border-zinc-900/20">
                  <img src={motoboyHero} alt="Motoboy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.classList.remove('hidden'); }} />
                  <Bike className="w-11 h-11 text-zinc-900 hidden" />
                </div>
              </div>

              <div>
                <p className="text-2xl font-black text-white tracking-tight">SOLICITANTE</p>
                <p className="text-[#F5E62B] text-lg font-black tracking-tight">DE MOTOBOY</p>
                <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
                  Preciso de um motoboy agora<br />para entrega ou coleta
                </p>
              </div>

              <div className="flex items-center gap-2 px-6 py-2.5 bg-[#F5E62B] rounded-2xl shadow-lg mt-1">
                <span className="text-zinc-900 font-black text-sm">Solicitar motoboy agora</span>
                <ArrowRight className="w-4 h-4 text-zinc-900" />
              </div>
            </div>

            {/* Badge */}
            <span className="absolute top-4 right-4 z-10 bg-[#F5E62B]/15 text-[#F5E62B] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide border border-[#F5E62B]/30">
              Sem cadastro
            </span>
          </button>
        </div>

        {/* Voltar */}
        <button
          onClick={() => navigate("/mercado")}
          className="mt-8 flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-medium transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar ao mercado
        </button>
      </div>
    </MarketLayout>
  );
}
