import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
    Download, 
    ShieldCheck, 
    Zap, 
    Loader2,
    XCircle,
    ArrowLeft,
    Clock,
    Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MarketLayout } from "@/components/layout/MarketLayout";

export default function DigitalDeliveryGateway() {
    const { itemId } = useParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState<"loading" | "verifying" | "success" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState("");
    const [downloadInfo, setDownloadInfo] = useState<any>(null);

    useEffect(() => {
        const verifyAndRedirect = async () => {
            if (!itemId) return;
            setStatus("verifying");

            try {
                // Call the secure RPC
                const { data, error } = await supabase.rpc('get_secure_download_url', {
                    p_item_id: itemId
                });

                if (error) throw error;
                
                const result = data as any;
                if (!result.success) {
                    setErrorMsg(result.error || "Acesso negado.");
                    setStatus("error");
                    return;
                }

                // If success, we have the URL
                setDownloadInfo(result);
                setStatus("success");
                
                // Automatic trigger after 2 seconds
                setTimeout(() => {
                    handleStartDownload(result.download_url);
                }, 2000);

            } catch (err: any) {
                console.error(err);
                setErrorMsg("Erro de comunicação com o servidor de segurança.");
                setStatus("error");
            }
        };

        verifyAndRedirect();
    }, [itemId]);

    const handleStartDownload = (url: string) => {
        toast.success("Download iniciado!");
        window.location.href = url;
    };

    return (
        <MarketLayout>
            <div className="bg-institutional-yellow min-h-screen py-12 px-4 flex items-center justify-center">
                <Card className="max-w-xl w-full border-none shadow-3xl rounded-[48px] bg-white overflow-hidden p-12">
                    
                    <div className="flex flex-col items-center text-center space-y-8">
                        
                        {/* ICON STATUS */}
                        <div className="relative">
                            <div className={cn(
                                "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-700",
                                status === "loading" || status === "verifying" ? "bg-zinc-100 text-zinc-400" :
                                status === "error" ? "bg-red-50 text-red-500 animate-shake" :
                                "bg-emerald-500 text-white shadow-2xl shadow-emerald-500/20"
                            )}>
                                {status === "loading" || status === "verifying" ? (
                                    <Loader2 className="w-10 h-10 animate-spin" />
                                ) : status === "error" ? (
                                    <Lock className="w-10 h-10" />
                                ) : (
                                    <Download className="w-10 h-10" />
                                )}
                            </div>
                            
                            {status === "success" && (
                                <div className="absolute -bottom-2 -right-2 bg-white p-2 rounded-xl shadow-xl">
                                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                                </div>
                            )}
                        </div>

                        {/* TEXT CONTENT */}
                        <div className="space-y-4">
                            <h2 className="text-3xl font-black text-zinc-900 uppercase tracking-tighter leading-tight">
                                {status === "verifying" ? "Verificando Credenciais..." :
                                 status === "error" ? "Acesso Protegido" :
                                 "Link Liberado!"}
                            </h2>
                            
                            <p className="text-zinc-500 text-sm font-medium uppercase tracking-widest leading-loose max-w-sm mx-auto">
                                {status === "verifying" ? "Validando pagamento e cotas de download em nossos servidores seguros." :
                                 status === "error" ? errorMsg :
                                 "Seu download começará em instantes. Por favor, mantenha esta página aberta."}
                            </p>
                        </div>

                        {/* INFO BOX */}
                        {status === "success" && downloadInfo && (
                            <div className="bg-zinc-50 w-full p-6 rounded-[32px] border border-zinc-100/50 flex flex-col gap-1 items-center">
                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Saldo Restante</span>
                                <span className="text-xl font-black text-zinc-900 tracking-tight">{downloadInfo.remaining_downloads} downloads</span>
                            </div>
                        )}

                        {/* ACTIONS */}
                        <div className="w-full pt-4">
                            {status === "error" ? (
                                <div className="space-y-3">
                                    <Button 
                                        onClick={() => navigate("/minha-biblioteca")}
                                        className="w-full h-16 bg-zinc-900 hover:bg-zinc-800 text-white rounded-[24px] font-black uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-2"
                                    >
                                        <ArrowLeft className="w-4 h-4" /> Voltar à Biblioteca
                                    </Button>
                                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Consulte o vendedor se você acredita que isso é um erro.</p>
                                </div>
                            ) : status === "success" ? (
                                <Button 
                                    onClick={() => handleStartDownload(downloadInfo.download_url)}
                                    className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[24px] font-black uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-110 transition-transform"
                                >
                                    <Zap className="w-5 h-5 fill-current" /> Baixar Imediatamente
                                </Button>
                            ) : (
                                <div className="flex items-center justify-center gap-2 text-zinc-400 font-bold text-[10px] uppercase tracking-widest animate-pulse">
                                    <Clock className="w-3 h-3" /> Camada de Segurança Ativa
                                </div>
                            )}
                        </div>

                    </div>

                </Card>
            </div>
        </MarketLayout>
    );
}
