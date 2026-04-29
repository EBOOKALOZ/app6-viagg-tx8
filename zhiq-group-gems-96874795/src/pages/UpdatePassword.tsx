import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import logoImage from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export default function UpdatePassword() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const navigate = useNavigate();
    const { toast } = useToast();
    const isAdvertiserMode = localStorage.getItem("viagg_auth_entry") === "advertiser";

    useEffect(() => {
        // Verifica se há uma sessão ativa proveniente do link de recuperação
        const checkSession = async () => {
            const { data } = await supabase.auth.getSession();
            if (!data.session) {
                setErrorMessage("Sessão de recuperação inválida ou expirada. Solicite um novo link.");
            }
        };
        checkSession();
    }, []);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        if (password.length < 6) {
            setErrorMessage("A senha deve ter no mínimo 6 caracteres.");
            return;
        }

        if (password !== confirmPassword) {
            setErrorMessage("As senhas digitadas não conferem.");
            return;
        }

        setIsSubmitting(true);
        setErrorMessage("");

        try {
            const { error } = await supabase.auth.updateUser({
                password: password,
            });

            if (error) {
                setErrorMessage(error.message);
            } else {
                setIsSuccess(true);
                toast({
                    title: "Senha atualizada!",
                    description: "Sua nova senha foi salva com sucesso. Você já pode fazer login.",
                });

                // Desloga o usuário da sessão de recuperação após definir a senha
                await supabase.auth.signOut();

                setTimeout(() => {
                    navigate("/auth");
                }, 3000);
            }
        } catch (e: any) {
            console.error("Erro fatal ao atualizar senha:", e);
            setErrorMessage("Ocorreu um erro no servidor. Tente novamente mais tarde.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={cn(
            "flex min-h-screen flex-col transition-colors duration-500",
            isAdvertiserMode ? "bg-[#F7E7CE]" : "bg-black"
        )}>
            {!isSuccess && (
                <div className="p-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-emerald-50 hover:bg-emerald-900/30"
                        onClick={() => navigate("/auth")}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Cancelar e ir para o Login
                    </Button>
                </div>
            )}

            <div className="flex flex-1 items-center justify-center p-4">
                <div className={cn(
                    "w-full max-w-sm rounded-[32px] p-8 sm:p-10 border shadow-2xl transition-all duration-500",
                    isAdvertiserMode 
                        ? "bg-[#3B1F14] border-[#D6A75C]/30 text-[#FFF4E6]" 
                        : "bg-[#0a1e16] border-emerald-400/15 text-emerald-50"
                )}>
                    <div className="text-center mb-6">
                        <img 
                            src={isAdvertiserMode ? "/assets/brand/logo-advertiser.jpg" : logoImage} 
                            alt="Viagg-TX8" 
                            className={cn(
                                "mx-auto h-20 sm:h-24 rounded-2xl shadow-lg transition-transform hover:scale-105",
                                isAdvertiserMode ? "h-28" : ""
                            )} 
                        />
                        <h1 className={cn(
                            "mt-6 text-xl sm:text-2xl font-black uppercase tracking-tight",
                            isAdvertiserMode ? "text-[#FFF4E6]" : "text-emerald-50"
                        )}>
                            Nova Senha
                        </h1>
                        <p className={cn(
                            "text-sm mt-1 font-medium",
                            isAdvertiserMode ? "text-[#FFF4E6]/60" : "text-emerald-300"
                        )}>
                            Digite e confirme sua nova senha abaixo
                        </p>
                    </div>

                    {!isSuccess ? (
                        <form onSubmit={handleUpdatePassword} className="space-y-4">
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Nova senha (mín. 6 caracteres)"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isSubmitting}
                                    className={cn(
                                        "h-14 rounded-xl font-black transition-all",
                                        isAdvertiserMode 
                                            ? "bg-[#422618] border-[#D6A75C]/30 text-white placeholder:text-white/20 focus:ring-[#EA580C]/40" 
                                            : "bg-black/20 border-emerald-500/30 text-emerald-50 focus-visible:ring-emerald-500/50"
                                    )}
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-400 focus:outline-none"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Confirme sua nova senha"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    disabled={isSubmitting}
                                    className={cn(
                                        "h-14 rounded-xl font-black transition-all",
                                        isAdvertiserMode 
                                            ? "bg-[#422618] border-[#D6A75C]/30 text-white placeholder:text-white/20 focus:ring-[#EA580C]/40" 
                                            : "bg-black/20 border-emerald-500/30 text-emerald-50 focus-visible:ring-emerald-500/50"
                                    )}
                                    required
                                    minLength={6}
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className={cn(
                                    "w-full h-14 font-black uppercase tracking-[0.2em] rounded-xl shadow-xl transition-all",
                                    isAdvertiserMode 
                                        ? "bg-[#EA580C] hover:bg-orange-600 text-white" 
                                        : "bg-emerald-600 hover:bg-emerald-500 text-white"
                                )}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Salvando...
                                    </>
                                ) : (
                                    "Atualizar Senha"
                                )}
                            </Button>

                            {errorMessage && (
                                <div className="text-red-400 text-sm text-center font-medium mt-2 bg-red-950/30 p-2 rounded border border-red-900/50">
                                    {errorMessage}
                                </div>
                            )}
                        </form>
                    ) : (
                        <div className="text-center space-y-4">
                            <div className="bg-emerald-900/40 border border-emerald-500/50 rounded-lg p-6 text-emerald-100 flex flex-col items-center justify-center">
                                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                </div>
                                <p className="font-medium text-emerald-300 mb-2">Senha redifinida!</p>
                                <p className="text-sm">Sua conta está segura com a nova senha.</p>
                                <p className="text-xs text-emerald-400/60 mt-4">Redirecionando para o login...</p>
                            </div>
                            <Button
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                                onClick={() => navigate("/auth")}
                            >
                                Fazer Login Agora
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
