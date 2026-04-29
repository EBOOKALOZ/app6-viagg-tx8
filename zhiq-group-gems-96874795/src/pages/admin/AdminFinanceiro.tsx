import { Wallet } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { AdminFinancialStats } from "@/components/admin/financial/AdminFinancialStats";
import { AdminFinancialCharts } from "@/components/admin/financial/AdminFinancialCharts";

const AdminFinanceiro = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const getCurrentTab = () => {
    if (location.pathname.includes("faturas-lojistas")) return "faturas-lojistas";
    if (location.pathname.includes("relatorios")) return "relatorios";
    if (location.pathname.includes("ajustes")) return "ajustes";
    return "repasse-motoboys";
  };

  const currentTab = getCurrentTab();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-muted-foreground">
            Controle de repasses, faturas e ajustes manuais
          </p>
        </div>
      </div>

      <Alert className="border-primary/20 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          Os pagamentos reais são realizados manualmente fora do aplicativo.
          O sistema apenas registra e controla movimentações lógicas de Ledger.
        </AlertDescription>
      </Alert>

      <AdminFinancialStats />
      <div className="pt-2">
        <AdminFinancialCharts />
      </div>

      <Tabs value={currentTab} className="w-full mt-6">
        {/* Usando grid-cols-4 agora para comportar a nova aba */}
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger
            value="repasse-motoboys"
            onClick={() => navigate("/administrador/financeiro")}
          >
            Repasse Motoboys
          </TabsTrigger>
          <TabsTrigger
            value="faturas-lojistas"
            onClick={() => navigate("/administrador/financeiro/faturas-lojistas")}
          >
            Faturas Lojistas
          </TabsTrigger>
          <TabsTrigger
            value="ajustes"
            onClick={() => navigate("/administrador/financeiro/ajustes")}
          >
            Créditos / Ajustes
          </TabsTrigger>
          <TabsTrigger
            value="relatorios"
            onClick={() => navigate("/administrador/financeiro/relatorios")}
          >
            📊 Relatórios
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  );
};

export default AdminFinanceiro;
