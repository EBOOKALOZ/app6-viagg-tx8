import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";
import logoImage from "@/assets/logo.png";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const emailSchema = z.string().email("Email inválido");

export default function ResetPassword() {
    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const navigate = useNavigate();
    const { toast } = useToast();

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        setErrorMessage("");

        try {
            emailSchema.parse(email);
        } catch {
            setErrorMessage("Por favor, informe um email válido.");
            setIsSubmitting(false);
            return;
        }

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/update-password',
            });

            if (error) {
                setErrorMessage(error.message);
            } else {
                setIsSent(true);
                toast({
                    title: "Link de recuperação enviado!",
                    description: "Verifique sua caixa de entrada e pasta de spam.",
                });
            }
        } catch (e: any) {
            console.error("Erro fatal ao resetar senha:", e);
            setErrorMessage("Ocorreu um erro no servidor. Tente novamente mais tarde.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-black">
            <div className="p-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-emerald-50 hover:bg-emerald-900/30"
                    onClick={() => navigate("/auth")}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar para Login
                </Button>
            </div>

            <div className="flex flex-1 items-center justify-center p-4">
                <div className="w-full max-w-sm rounded-2xl p-8 sm:p-10 border border-emerald-400/15 bg-[#0a1e16] shadow-xl">
                    <div className="text-center mb-6">
                        <img src={logoImage} alt="Viagg-TX8" className="mx-auto h-20 sm:h-24 rounded-xl" />
                        <h1 className="mt-4 text-xl sm:text-2xl font-semibold text-emerald-50">
                            Recuperar Senha
                        </h1>
                        <p className="text-sm text-emerald-300 mt-1">
                            Enviaremos as instruções para o seu e-mail
                        </p>
                    </div>

                    {!isSent ? (
                        <form onSubmit={handleReset} className="space-y-4">
                            <Input
                                type="email"
                                placeholder="Seu email cadastrado"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isSubmitting}
                                className="bg-black/20 border-emerald-500/30 text-emerald-50 focus-visible:ring-emerald-500/50"
                                required
                            />

                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Enviando...
                                    </>
                                ) : (
                                    "Enviar link de recuperação"
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
                            <div className="bg-emerald-900/40 border border-emerald-500/50 rounded-lg p-4 text-emerald-100">
                                <p className="font-medium text-emerald-300 mb-2">Instruções enviadas!</p>
                                <p className="text-sm">Enviamos um link de recuperação para <strong>{email}</strong>.</p>
                                <p className="text-sm mt-2">Clique no link contido no email para criar sua nova senha.</p>
                            </div>
                            <Button
                                variant="outline"
                                className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/30 hover:text-emerald-300"
                                onClick={() => navigate("/auth")}
                            >
                                Retornar ao Login
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
