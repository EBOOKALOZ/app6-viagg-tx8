import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShoppingBag, AlertCircle } from "lucide-react";

/**
 * /p/:slug — Public product redirect page with click tracking
 *
 * Reads tracking_slug from URL, optional ?g={group_id}&p={postador_id}
 * 1. Registers click via RPC register_product_click
 * 2. Redirects to /produto/{product_id}
 */
export default function ProductRedirectPage() {
    const { slug } = useParams<{ slug: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!slug) { setError(true); return; }

        const groupId = searchParams.get("g") || null;
        const postadorId = searchParams.get("p") || null;

        const registerAndRedirect = async () => {
            try {
                const { data, error: rpcError } = await (supabase.rpc as any)(
                    "register_product_click",
                    {
                        p_tracking_slug: slug,
                        p_group_id: groupId,
                        p_postador_id: postadorId,
                        p_user_agent: navigator.userAgent || null,
                        p_referer: document.referrer || null,
                    }
                );

                if (rpcError) {
                    console.error("[ProductRedirect] RPC error:", rpcError);
                    setError(true);
                    return;
                }

                if (data?.success && data?.product_id) {
                    navigate(`/produto/${data.product_id}`, { replace: true });
                } else {
                    console.warn("[ProductRedirect] Product not found:", data);
                    setError(true);
                }
            } catch (err) {
                console.error("[ProductRedirect] Error:", err);
                setError(true);
            }
        };

        registerAndRedirect();
    }, [slug, searchParams, navigate]);

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-institutional-yellow">
                <div className="text-center space-y-3 px-6">
                    <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
                        <AlertCircle className="h-8 w-8 text-red-400" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-700">Produto não encontrado</h1>
                    <p className="text-sm text-gray-400 max-w-sm mx-auto">
                        Esse link pode ter expirado ou o produto foi removido.
                    </p>
                    <button
                        onClick={() => navigate("/mercado")}
                        className="mt-4 px-6 py-2 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors"
                    >
                        Ver Marketplace
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-institutional-yellow">
            <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto" />
                <p className="text-sm text-gray-400">Redirecionando...</p>
            </div>
        </div>
    );
}
