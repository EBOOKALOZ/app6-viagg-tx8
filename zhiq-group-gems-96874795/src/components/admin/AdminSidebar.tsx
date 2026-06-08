import {
  LayoutDashboard,
  Package,
  Users,
  Gift,
  BarChart3,
  LogOut,
  Send,
  Search,
  Headphones,
  Wallet,
  FileText,
  Scale,
  Globe,
  Target,
  Swords,
  Map,
  TrendingUp,
  Zap,
  Bike,
  Car,
  Store,
  Truck,
  Flag,
  Activity,
  Settings,
  Layers,
  Gauge,
  Inbox,
  Coins,
  Landmark,
  Banknote,
  Building2,
  Shield,
  Camera,
  CreditCard,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketingRole } from "@/hooks/useMarketingRole";
import { useSupportRole } from "@/hooks/useSupportRole";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MenuSection {
  title: string;
  emoji?: string;
  items: {
    title: string;
    url: string;
    icon: React.ElementType;
    badge?: string;
  }[];
}

const menuSections: MenuSection[] = [
  {
    title: "Centro de Comando",
    emoji: "🔷",
    items: [
      { title: "Dashboard Nacional", url: "/admin/nacional", icon: Globe },
      { title: "War Room Nacional", url: "/admin/war-room", icon: Swords },
      { title: "Motor Territorial", url: "/admin/motor-territorial", icon: Zap },
      { title: "Cobertura Nacional", url: "/admin/cobertura-nacional", icon: Map },
      { title: "Regiões Ativas", url: "/admin/regioes-ativas", icon: Activity },
      { title: "Fila de Expansão", url: "/admin/fila-expansao", icon: Layers },
    ],
  },
  {
    title: "Operação",
    emoji: "🔶",
    items: [
      { title: "Dashboard Operacional", url: "/admin", icon: LayoutDashboard },
      { title: "Incentivos", url: "/admin/incentives", icon: Gift },
      { title: "Metas Regionais", url: "/admin/metas-regionais", icon: Target },
      { title: "Centro de Crescimento", url: "/admin/centro-crescimento", icon: TrendingUp },
      { title: "Expansão", url: "/admin/expansao", icon: Gauge },
    ],
  },
  {
    title: "Marketing",
    emoji: "📢",
    items: [
      { title: "Radar Territorial", url: "/admin/marketing/radar", icon: Zap },
      { title: "Postador", url: "/admin/posting", icon: Send },
      { title: "Central do Postador", url: "/admin/postador-central", icon: Target },
      { title: "Buscador de Grupos", url: "/admin/group-finder", icon: Search },
      { title: "Config. de Grupos", url: "/admin/group-settings", icon: Settings },
      { title: "Fila de Grupos", url: "/admin/marketing/fila-grupos", icon: Users },
      { title: "Central de Campanhas", url: "/admin/campaign-queue", icon: Inbox },
      { title: "Dispatch de Campanhas", url: "/admin/campaign-dispatch", icon: Send },
      { title: "Biblioteca de Mídias", url: "/admin/marketing/biblioteca", icon: Layers },
      { title: "Postagens", url: "/admin/marketing/postagens", icon: Send },
      { title: "Histórico", url: "/admin/marketing/historico", icon: BarChart3 },
      { title: "Impacto Econômico", url: "/admin/marketing/impacto", icon: TrendingUp },
      { title: "Controle Econômico", url: "/admin/marketing/controle", icon: Settings },
    ],
  },
  {
    title: "Multi-Perfil",
    emoji: "🔷",
    items: [
      { title: "Dashboard Geral", url: "/admin/perfis/dashboard", icon: BarChart3 },
      { title: "Motoboys", url: "/admin/perfis/motoboys", icon: Bike },
      { title: "Lojistas", url: "/admin/perfis/lojistas", icon: Store },
      { title: "Passageiros", url: "/admin/perfis/passageiros", icon: Car },
      { title: "Motoristas", url: "/admin/perfis/motoristas", icon: Truck },
      { title: "Moto-Táxi", url: "/admin/perfis/mototaxi", icon: Zap },
      { title: "Fretes", url: "/admin/perfis/fretes", icon: Flag },
    ],
  },
  {
    title: "PAY — Financeiro",
    emoji: "💰",
    items: [
      { title: "Tesouraria PAY", url: "/admin/pay", icon: Landmark },
      { title: "PI2 — Motoboy", url: "/admin/pay/courier-wallets", icon: Bike },
      { title: "Wallets", url: "/admin/pay/wallets", icon: Wallet },
      { title: "Ledger", url: "/admin/pay/ledger", icon: Layers },
      { title: "Gateways", url: "/admin/pagamentos/gateways", icon: CreditCard },
      { title: "Demo Fluxo", url: "/admin/pagamentos/demo", icon: Activity },
    ],
  },
  {
    title: "Gestão",
    emoji: "🔶",
    items: [
      { title: "Usuários", url: "/admin/users", icon: Users },
      { title: "Lojas", url: "/admin/lojas", icon: Store },
      { title: "Veículos", url: "/admin/vehicles", icon: Car },
      { title: "Créditos", url: "/admin/creditos", icon: Coins },
      { title: "Pacotes Imóveis", url: "/admin/imoveis/pacotes", icon: Building2 },
      { title: "Moderação de Imóveis", url: "/admin/imoveis/moderacao", icon: Building2 },
      { title: "Aprovação de Imagens", url: "/admin/imoveis/aprovacao-imagens", icon: Camera },
      { title: "Marketplace", url: "/admin/marketplace", icon: BarChart3 },
      { title: "Produtos Marketplace", url: "/admin/marketplace/products", icon: Package },
      { title: "Imagens Produtos", url: "/admin/moderacao-imagens", icon: Camera },
      { title: "Financeiro", url: "/admin/financeiro", icon: Wallet },
      { title: "Profit", url: "/admin/stats", icon: TrendingUp },
    ],
  },
  {
    title: "Institucional",
    emoji: "🔷",
    items: [
      { title: "Documentos Legais", url: "/admin/legal-documents", icon: Scale },
      { title: "Rodapés", url: "/admin/footer-contents", icon: FileText },
      { title: "Tickets (Suporte)", url: "/admin/support", icon: Headphones },
      { title: "Supervisor de IA", url: "/admin/supervisor", icon: Activity },
      { title: "Métricas (Suporte)", url: "/admin/support/stats", icon: BarChart3 },
      { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
    ],
  },
];

const postadorAllowedUrls = new Set([
  "/admin/posting",
  "/admin/marketing/postagens",
  "/admin/marketing/historico",
]);

export function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, isAdmin } = useAuth();
  // const { marketingRole } = useMarketingRole(); // TEMPORARILY DISABLED
  // const { supportRole } = useSupportRole(); // TEMPORARILY DISABLED
  const marketingRole = null; // Temporário
  const supportRole = null; // Temporário

  const isPostador = marketingRole === "postador";
  const isSupportOnly = !!supportRole && !isAdmin;

  const isAdminArea = location.pathname.startsWith("/admin");
  const isMultiPerfil = location.pathname.startsWith("/admin/perfis");

  const supportAllowedUrls = new Set([
    "/admin/support",
    "/admin/supervisor",
    "/admin/support/stats",
  ]);

  let filteredSections = menuSections;

  if (isSupportOnly && !isAdmin) {
    filteredSections = menuSections
      .map((section) => {
        if (section.title !== "Institucional") return section;
        return {
          ...section,
          items: section.items.filter((item) => supportAllowedUrls.has(item.url)),
        };
      })
      .filter((s) => s.title === "Institucional");
  } else if (isPostador && !isAdminArea) {
    filteredSections = menuSections
      .map((section) => {
        if (section.title !== "Marketing") return section;
        return {
          ...section,
          items: section.items.filter((item) => postadorAllowedUrls.has(item.url)),
        };
      })
      .filter((s) => s.title === "Marketing" || s.title === "Institucional");
  }

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <aside
      className={cn(
        "flex h-screen w-64 flex-col border-r shrink-0 transition-colors duration-300",
        isMultiPerfil ? "" : "bg-card"
      )}
      style={isMultiPerfil ? { backgroundColor: "#E8F5E9" } : undefined}
    >
      {/* Header */}
      <div className="flex h-16 items-center border-b px-5 gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          SP
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground leading-none">SuperPainel</h1>
          <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">
            Centro Nacional
          </span>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <nav className="p-3 space-y-5">
          {filteredSections.map((section, sectionIdx) => {
            const isGestao = section.title === "Gestão";
            return (
            <div
              key={section.title}
              className={cn(isGestao && "bg-[#FFE600] rounded-xl p-2 -mx-1")}
            >
              {sectionIdx > 0 && !isGestao && <Separator className="mb-4" />}
              <div className="mb-2 px-2">
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.15em] flex items-center gap-1.5",
                    isGestao ? "text-zinc-900" : "text-muted-foreground"
                  )}
                >
                  {section.emoji && <span className="text-xs">{section.emoji}</span>}
                  {section.title}
                </span>
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <NavLink
                      key={item.url}
                      to={item.url}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-md"
                          : isGestao
                          ? "text-zinc-800 hover:bg-yellow-300"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.title}</span>
                      {item.badge && (
                        <span className="ml-auto text-[10px] bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 leading-none font-bold">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2.5 text-muted-foreground hover:text-destructive text-[13px]"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
