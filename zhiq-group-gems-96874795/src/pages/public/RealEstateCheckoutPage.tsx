import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { ArrowLeft } from "lucide-react";
import { RealEstateCheckoutContent } from "@/components/real-estate/RealEstateCheckoutContent";

export default function RealEstateCheckoutPage() {
    const { listingId } = useParams();
    const navigate = useNavigate();
    const [search, setSearch] = useState("");

    return (
        <MarketLayout 
            search={search} 
            setSearch={setSearch}
            headerChildren={
                <div className="flex items-center gap-2 pb-2">
                    <button 
                        onClick={() => navigate('/mercado/meus-anuncios')}
                        className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm font-bold"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Voltar ao Anúncio
                    </button>
                    <div className="h-4 w-px bg-white/20 mx-2" />
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">
                        Checkout de Visibilidade
                    </span>
                </div>
            }
        >
            <RealEstateCheckoutContent 
                listingId={listingId}
                layout="public"
                onBack={() => navigate('/mercado/meus-anuncios')}
                onSuccess={() => {}}
            />
        </MarketLayout>
    );
}
