import React from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { RealEstateCheckoutContent } from "@/components/real-estate/RealEstateCheckoutContent";
import { ArrowLeft, CreditCard } from "lucide-react";

export default function AdvertiserCheckoutPage() {
    const { listingId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const packageId = searchParams.get('packageId');

    // Se veio packageId na query, usa como listingId temporário
    const effectiveId = listingId || packageId;

    // Segmento de origem (imoveis/veiculos/lojista) → define para onde voltar
    // após o pagamento aprovado, mantendo o usuário no painel certo.
    const seg = searchParams.get('ret');
    const creditsRoute =
        seg === 'imoveis' ? '/anunciante/imoveis/creditos'
        : seg === 'veiculos' ? '/anunciante/veiculos/creditos'
        : seg === 'servicos' ? '/anunciante/servicos/creditos'
        : seg === 'fretes' ? '/anunciante/fretes/creditos'
        : seg === 'viagens' ? '/anunciante/viagens/creditos'
        : '/anunciante/creditos';

    const walletCtx: 'advertiser' | 'real_estate' | 'vehicle' | 'service' | 'freight' | 'travel' =
        seg === 'imoveis' ? 'real_estate'
        : seg === 'veiculos' ? 'vehicle'
        : seg === 'servicos' ? 'service'
        : seg === 'fretes' ? 'freight'
        : seg === 'viagens' ? 'travel'
        : 'advertiser';

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-zinc-900 tracking-tight flex items-center gap-3">
                        <CreditCard className="w-8 h-8 text-orange-500" />
                        CHECKOUT SEGURO
                    </h1>
                    <p className="text-zinc-500 font-medium tracking-tight">Finalize seu pagamento para liberar créditos ou visibilidade.</p>
                </div>
                <button 
                    onClick={() => navigate(creditsRoute)}
                    className="flex items-center gap-2 text-zinc-400 hover:text-orange-600 transition-colors text-sm font-black uppercase tracking-widest"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar aos Créditos
                </button>
            </div>

            <div className="mt-8">
                <RealEstateCheckoutContent
                    listingId={effectiveId}
                    layout="dashboard"
                    walletContext={walletCtx}
                    returnTo={creditsRoute}
                    onBack={() => navigate(creditsRoute)}
                    onSuccess={() => {
                        // Optional: additional logic on success inside dashboard
                    }}
                />
            </div>
        </div>
    );
}
