import { ShieldCheck, Lock, FileText, Share2, Server, Users, ArrowLeft, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function MotoboyLGPDPage() {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 animate-in fade-in duration-300">

            {/* Premium Header */}
            <div className="bg-gradient-to-r from-motoboy to-motoboy/80 pt-12 pb-16 px-6 relative overflow-hidden rounded-b-[2.5rem] shadow-sm">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                    <ShieldCheck className="w-48 h-48" />
                </div>
                <div className="relative z-10">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20 mb-4 h-8 w-8 rounded-full"
                        onClick={() => navigate(-1)}
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3 text-white mb-2">
                        <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                            <ShieldCheck className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">LGPD e Privacidade</h1>
                    </div>
                    <p className="text-primary-foreground/90 text-sm max-w-[280px] leading-relaxed mt-2">
                        Transparência e segurança. Entenda como tratamos seus dados pessoais na Viagg-TX8.
                    </p>
                </div>
            </div>

            <div className="px-5 -mt-8 space-y-4 relative z-20">

                <Card className="border-0 shadow-md rounded-2xl overflow-hidden bg-card">
                    <CardContent className="p-5 flex flex-col gap-5">
                        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
                            <FileText className="w-5 h-5 text-motoboy" />
                            1. Quais dados coletamos
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Para você utilizar o aplicativo de forma segura e eficiente, coletamos
                            dados como: <strong className="text-foreground font-medium">Nome, CPF, CNH, Telefone, E-mail</strong>,
                            dados do veículo (Placa/Renavam) e a <strong className="text-foreground font-medium">localização GPS</strong> do seu dispositivo quando o app está em uso.
                        </p>

                        <div className="w-full h-px bg-border/50" />

                        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
                            <Server className="w-5 h-5 text-motoboy" />
                            2. Como usamos os dados
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Utilizamos sua localização em tempo real para conectar você aos pedidos (Logística e Mobilidade) mais próximos, calcular distância e otimizar ganhos. Seus dados financeiros são tratados de forma isolada exclusivamente para o repasse de pagamentos.
                        </p>

                        <div className="w-full h-px bg-border/50" />

                        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
                            <Share2 className="w-5 h-5 text-motoboy" />
                            3. Compartilhamento
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Compartilhamos os dados estritamente necessários (ex: Placa e Nome) com os lojistas e clientes para viabilizar as entregas. Nunca vendemos ou cedemos seus dados para fins de marketing a terceiros.
                        </p>

                        <div className="w-full h-px bg-border/50" />

                        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
                            <Lock className="w-5 h-5 text-motoboy" />
                            4. Segurança
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Seus dados sensíveis são criptografados através de tecnologia padrão da indústria. Somente sistemas automatizados e colaboradores auditados têm acesso as informações em caso de suporte.
                        </p>

                        <div className="w-full h-px bg-border/50" />

                        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
                            <Users className="w-5 h-5 text-motoboy" />
                            5. Direitos do Usuário (LGPD)
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Você tem direito a: <br />
                            - Solicitar uma cópia dos seus dados;<br />
                            - Pedir correção de informações incorretas;<br />
                            - Solicitar o apagamento total de seus dados caso encerre seu vínculo;<br />
                            - Revogar consentimentos oferecidos anteriormente.
                        </p>
                    </CardContent>
                </Card>

                <Card className="border border-motoboy/20 shadow-sm rounded-2xl bg-motoboy/5 overflow-hidden mt-6 mb-8">
                    <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                        <div className="bg-motoboy/20 p-3 rounded-full">
                            <Mail className="w-6 h-6 text-motoboy" />
                        </div>
                        <h3 className="font-bold text-foreground">Dúvidas sobre Privacidade?</h3>
                        <p className="text-xs text-muted-foreground mb-2">
                            Você pode entrar em contato direto com o nosso suporte ao parceiro ou abrir um ticket para o Encarregado de Dados (DPO).
                        </p>
                        <Button
                            className="w-full h-11 rounded-xl font-semibold shadow-sm bg-motoboy hover:bg-motoboy-hover text-white"
                            onClick={() => navigate('/motoboy/support')}
                        >
                            Falar com o Suporte
                        </Button>
                    </CardContent>
                </Card>

                <Link
                    to="/motoboy"
                    className="block w-full py-4 text-center font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                    Voltar ao Início
                </Link>
            </div>
        </div>
    );
}
