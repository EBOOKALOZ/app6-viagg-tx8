import React from "react";
import { ShieldAlert, MessageCircle, ShoppingBag, ArrowRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const InstitutionalSafetyBanner: React.FC = () => {
    return (
        <div className="w-full px-4 lg:px-6 mb-8 mt-2">
            <div className="max-w-[1920px] mx-auto relative overflow-hidden bg-[#D90000] rounded-[32px] border border-white/20 shadow-2xl">
                {/* Visual Elements - Glow Effect */}
                <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-white/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-72 h-72 bg-black/10 rounded-full blur-[80px]" />

                <div className="relative z-10 p-8 md:p-12 lg:p-16">
                    <div className="flex flex-col lg:flex-row gap-12 lg:items-center">
                        {/* Left Content - Main Highlight */}
                        <div className="flex-1 space-y-6">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/20 border border-white/20 backdrop-blur-sm">
                                <ShieldAlert className="w-4 h-4 text-yellow-300" />
                                <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Aviso de Segurança & Transparência</span>
                            </div>

                            <div className="space-y-4">
                                <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-none">
                                    ESTA PLATAFORMA ATUA COMO <br className="hidden md:block" />
                                    <span className="text-yellow-300">VITRINE E CONEXÃO DIRETA</span>
                                </h2>
                                
                                <p className="text-white text-lg md:text-xl font-medium leading-relaxed max-w-3xl drop-shadow-sm">
                                    <strong className="text-white">Importante:</strong> A Viagg-TX8 é uma plataforma de serviços e vitrine de anúncios.
                                    <span className="opacity-90"> Não somos responsáveis pelo conteúdo dos anúncios, pela disponibilidade real dos produtos, nem realizamos qualquer intermediação de pagamentos entre usuários e lojistas.</span>
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-4 pt-4">
                                <div className="inline-flex items-center justify-center bg-white text-zinc-900 font-bold px-5 py-2.5 rounded-xl text-sm border border-emerald-500/20 shadow-sm cursor-default">
                                    Fale com o lojista antes de comprar
                                </div>
                            </div>
                        </div>

                        {/* Right Content - Guidance List */}
                        <div className="lg:w-[450px] shrink-0">
                            <div className="bg-black/20 rounded-3xl p-8 border border-white/20 backdrop-blur-md space-y-6 shadow-xl">
                                <h4 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
                                    <Info className="w-4 h-4 text-yellow-300" />
                                    Como proceder com segurança:
                                </h4>
                                
                                <ul className="space-y-4">
                                    {[
                                        {
                                            icon: <MessageCircle className="w-5 h-5 text-yellow-100" />,
                                            text: "Sempre converse diretamente com o lojista para confirmar os detalhes."
                                        },
                                        {
                                            icon: <ShoppingBag className="w-5 h-5 text-yellow-100" />,
                                            text: "Peça ao lojista a reserva do item antes de se deslocar ou fechar negócio."
                                        },
                                        {
                                            icon: <Info className="w-5 h-5 text-yellow-100" />,
                                            text: "Verifique o estado do produto e combine o pagamento diretamente com a loja."
                                        }
                                    ].map((item, idx) => (
                                        <li key={idx} className="flex gap-4 items-start">
                                            <div className="mt-1 shrink-0">{item.icon}</div>
                                            <p className="text-white text-sm font-medium leading-snug drop-shadow-sm">
                                                {item.text}
                                            </p>
                                        </li>
                                    ))}
                                </ul>

                                <div className="pt-4 mt-4 border-t border-white/20">
                                    <p className="text-[13px] text-yellow-200 font-bold uppercase leading-tight italic drop-shadow-sm">
                                        RECOMENDAÇÃO: Confirme estoque, estado do produto e forma de entrega/retirada diretamente com o vendedor.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
