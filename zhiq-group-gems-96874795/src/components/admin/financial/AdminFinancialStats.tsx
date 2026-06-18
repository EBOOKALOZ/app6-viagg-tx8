import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminFinancialStats } from "@/hooks/useAdminFinancials";
import { Info, Activity, ArrowDownRight, ArrowUpRight, Banknote, HelpCircle, Store, Users, Wallet, Bike, Coins, Building2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
};

export function AdminFinancialStats() {
    const { data, isLoading, isError } = useAdminFinancialStats();

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground w-1/2 h-4 bg-muted rounded"></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-8 w-2/3 bg-muted rounded mt-2"></div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    if (isError || !data) {
        return (
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 text-sm">
                Erro ao carregar dados financeiros da plataforma.
            </div>
        );
    }

    const cards = [
        {
            title: "Saldo da Plataforma",
            value: data.saldoPlataforma,
            icon: <Wallet className="h-4 w-4" style={{ color: "hsl(var(--admin-primary))" }} />,
            tooltip: "Valor total disponível na conta da plataforma administradora.",
            color: "hsl(var(--admin-primary))"
        },
        {
            title: "Transacionado Hoje",
            value: data.transacionadoHoje,
            icon: <Activity className="h-4 w-4 text-blue-500" />,
            tooltip: "Soma de todas as entradas e saídas no sistema hoje.",
            color: "#3b82f6"
        },
        {
            title: "Receita (Taxas)",
            value: data.receitaPlataforma,
            icon: <ArrowUpRight className="h-4 w-4 text-emerald-500" />,
            tooltip: "Receita da plataforma: venda de pacotes de créditos/recargas + comissão das entregas.",
            color: "#10b981"
        },
        {
            title: "Pacotes de Marketplace",
            value: data.pacotesLojistas,
            subtitle: `${data.pacotesLojistasQtd} pacote(s) comprado(s)`,
            icon: <Store className="h-4 w-4 text-emerald-500" />,
            tooltip: "Entrada de compras de pacotes de créditos do marketplace (lojistas/anunciantes — compras confirmadas).",
            color: "#10b981"
        },
        {
            title: "Pacotes de Imóveis",
            value: data.pacotesImoveis,
            subtitle: `${data.pacotesImoveisQtd} pacote(s) comprado(s)`,
            icon: <Building2 className="h-4 w-4 text-emerald-500" />,
            tooltip: "Entrada de compras de pacotes de créditos de imóveis (compras confirmadas).",
            color: "#10b981"
        },
        {
            title: "Entrada Total (Pacotes)",
            value: data.pacotesLojistas + data.pacotesImoveis,
            subtitle: `${data.pacotesLojistasQtd + data.pacotesImoveisQtd} pacote(s) · Marketplace + Imóveis`,
            icon: <Coins className="h-4 w-4 text-emerald-500" />,
            tooltip: "Entrada total de compras de pacotes somando Marketplace (lojistas/anunciantes) + Imóveis.",
            color: "#10b981"
        },
        {
            title: "Total Lojistas",
            value: data.saldoLojistas,
            subtitle: `${data.totalLojas} loja(s) cadastrada(s)`,
            icon: <Store className="h-4 w-4 text-indigo-500" />,
            tooltip: "Total gasto pelos lojistas/anunciantes em créditos. Subtítulo: nº de lojas cadastradas.",
            color: "#6366f1"
        },
        {
            title: "Total Motoboys",
            value: data.saldoMotoboys,
            icon: <Users className="h-4 w-4 text-orange-500" />,
            tooltip: "Ganho dos motoboys nas entregas concluídas (após a comissão da plataforma).",
            color: "#f97316"
        },
        {
            title: "Saques Pendentes",
            value: data.saquesPendentesValor,
            subtitle: `${data.saquesPendentesQtd} pedido(s)`,
            icon: <ArrowDownRight className="h-4 w-4 text-rose-500" />,
            tooltip: "Valor total de saques solicitados aguardando aprovação.",
            color: "#f43f5e"
        },
        {
            title: "Saldo p/ Chamar Motoboy",
            value: data.saldoChamarMotoboy,
            icon: <Bike className="h-4 w-4 text-amber-500" />,
            tooltip: "Saldo disponível dos lojistas para chamar motoboy (recargas pagas menos o gasto em entregas).",
            color: "#f59e0b"
        }
    ];

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((card, idx) => (
                <Card
                    key={idx}
                    style={{
                        backgroundColor: "hsl(var(--admin-card, var(--card)))",
                        borderColor: "hsl(var(--admin-border, var(--border)))",
                    }}
                    className="transition-all hover:shadow-md hover:-translate-y-0.5"
                >
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: "hsl(var(--admin-muted-foreground))" }}>
                            {card.icon}
                            {card.title}
                        </CardTitle>
                        {card.tooltip && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="h-3.5 w-3.5 opacity-50 cursor-pointer" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="w-[200px] text-xs leading-relaxed">{card.tooltip}</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold" style={{ color: "hsl(var(--admin-card-foreground))" }}>
                            {formatCurrency(card.value)}
                        </div>
                        {card.subtitle && (
                            <p className="text-xs mt-1 font-medium" style={{ color: card.color }}>
                                {card.subtitle}
                            </p>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
