import { useState } from "react";
import {
  Satellite,
  Brain,
  Cpu,
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
  UserCog,
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
  BrainCircuit,
  Camera,
  CreditCard,
  Briefcase,
  Bot,
  Plane,
  Megaphone,
  Monitor,
  History,
  SlidersHorizontal,
  Radio,
  MapPin,
  Radar,
  ShieldCheck,
  ShieldAlert,
  HeartHandshake,
  BadgeCheck,
  Waypoints,
  Rocket,
  HeartPulse,
  Crown,
  Telescope,
  Workflow,
  Tag,
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
      { title: "Impulsionar", url: "/admin/posting", icon: Send },
      { title: "Central de Impulsionamento", url: "/admin/impulsionar-central", icon: Target },
      { title: "Robô de Impulsionamento (IA)", url: "/admin/auto-poster", icon: Bot },
      { title: "Buscador de Grupos", url: "/admin/group-finder", icon: Search },
      { title: "Config. de Grupos", url: "/admin/group-settings", icon: Settings },
      { title: "Fila de Grupos", url: "/admin/marketing/fila-grupos", icon: Users },
      { title: "Central de Campanhas", url: "/admin/campaign-queue", icon: Inbox },
      { title: "Dispatch de Campanhas", url: "/admin/campaign-dispatch", icon: Send },
      { title: "Biblioteca de Mídias", url: "/admin/marketing/biblioteca", icon: Layers },
      { title: "Impulsionamentos", url: "/admin/marketing/postagens", icon: Send },
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
    title: "ORION AI CENTER",
    emoji: "🧠",
    items: [
      { title: "Command Center", url: "/admin/orion-command", icon: Crown, badge: "TOP" },
      { title: "Operations AI", url: "/admin/orion-operations", icon: Briefcase, badge: "COO" },
      { title: "Strategy Suite", url: "/admin/orion-strategy", icon: Telescope, badge: "NOVO" },
      { title: "Conversion AI", url: "/admin/orion-conversion", icon: Coins, badge: "ROI" },
      { title: "Execution Orchestrator", url: "/admin/orion-execution", icon: Workflow, badge: "AUTO" },
      { title: "Pricing AI", url: "/admin/orion-pricing", icon: Tag, badge: "NOVO" },
      { title: "Demand Forecast", url: "/admin/orion-forecast", icon: TrendingUp, badge: "NOVO" },
      { title: "Support AI", url: "/admin/orion-support", icon: Headphones, badge: "NOVO" },
      { title: "Marketplace AI", url: "/admin/orion-marketplace", icon: Store, badge: "NOVO" },
      { title: "Personalization AI", url: "/admin/orion-personalization", icon: UserCog, badge: "NOVO" },
      { title: "Trust & Reputation AI", url: "/admin/orion-trust", icon: Shield, badge: "NOVO" },
      { title: "Automation AI", url: "/admin/orion-automation", icon: Zap, badge: "NOVO" },
      { title: "Business Intelligence", url: "/admin/orion-business-intelligence", icon: BarChart3, badge: "EXEC" },
      { title: "Marketing AI", url: "/admin/orion-marketing", icon: Target, badge: "NOVO" },
      { title: "Sales AI", url: "/admin/orion-sales", icon: Wallet, badge: "NOVO" },
      { title: "Customer Success AI", url: "/admin/orion-customer-success", icon: HeartHandshake, badge: "NOVO" },
      { title: "Logistics AI", url: "/admin/orion-logistics", icon: Truck, badge: "NOVO" },
      { title: "Security AI", url: "/admin/orion-security", icon: ShieldAlert, badge: "NOVO" },
      { title: "Certification Engine", url: "/admin/orion-certification", icon: BadgeCheck, badge: "CORE" },
      { title: "Centro Nacional", url: "/admin/orion", icon: Satellite, badge: "IA" },
      { title: "Mobility 360°", url: "/admin/orion-mobility", icon: Brain, badge: "IA" },
      { title: "ORION OS", url: "/admin/orion-os", icon: Cpu, badge: "NOVO" },
      { title: "Publisher Control", url: "/admin/orion-publisher", icon: Inbox, badge: "IA" },
      { title: "RIDV Moderação", url: "/admin/ridv", icon: ShieldCheck, badge: "NOVO" },
      { title: "AI Gateway", url: "/admin/orion-ai", icon: BrainCircuit, badge: "NOVO" },
      { title: "Package AI", url: "/admin/orion-package", icon: Package, badge: "NOVO" },
      { title: "Finance AI", url: "/admin/orion-finance", icon: Landmark, badge: "NOVO" },
      { title: "Campaign AI", url: "/admin/orion-campaign", icon: Megaphone, badge: "NOVO" },
      { title: "Dispatcher AI", url: "/admin/orion-dispatcher", icon: Waypoints, badge: "NOVO" },
      { title: "Growth AI", url: "/admin/orion-growth", icon: Rocket, badge: "NOVO" },
      { title: "Performance AI", url: "/admin/orion-performance", icon: Gauge, badge: "NOVO" },
      { title: "Health Center", url: "/admin/orion-health", icon: HeartPulse, badge: "NOVO" },
    ],
  },
  {
    title: "Gestão",
    emoji: "🔶",
    items: [
      { title: "Comissão Inteligente", url: "/admin/comissao-inteligente", icon: Target },
      { title: "Fila de Divulgações", url: "/admin/fila-divulgacoes", icon: Inbox, badge: "IA" },
      { title: "Auditoria de Categorias", url: "/admin/auditoria-categorias", icon: Search },
      { title: "RADAR IA", url: "/admin/radar-ia", icon: Radar, badge: "IA" },
      { title: "Grupos Aprovados", url: "/admin/grupos-aprovados", icon: BadgeCheck, badge: "IA" },
      { title: "Moderação IA", url: "/admin/moderacao-ia", icon: ShieldCheck, badge: "IA" },
      { title: "Hub de Profissionais", url: "/admin/profissionais-hub", icon: Users, badge: "HUB" },
      { title: "Finanças Motoboy", url: "/admin/motoboy-financeiro", icon: Bike, badge: "MOTO" },
      { title: "Finanças Moto Táxi", url: "/admin/moto-taxi-financeiro", icon: Zap, badge: "TÁXI" },
      { title: "Finanças Motorista", url: "/admin/motorista-financeiro", icon: Car, badge: "CAR" },
      { title: "Console em Tempo Real", url: "/admin/eventos", icon: Radio, badge: "LIVE" },
      { title: "Mapa Inteligente", url: "/admin/mapa", icon: MapPin, badge: "IA" },
      { title: "Centro de Comando IA", url: "/admin/ai", icon: BrainCircuit },
      { title: "Análise de Chat IA", url: "/admin/ai-analytics", icon: Bot },
      { title: "Histórico de Consumo", url: "/admin/ai-historico", icon: History },
      { title: "Configuração da IA", url: "/admin/ai-config", icon: SlidersHorizontal, badge: "NOVO" },
      { title: "Pré-Visualização", url: "/admin/pre-visualizacao", icon: Monitor },
      { title: "Auditoria Operacional", url: "/admin/auditoria-postagens", icon: Shield },
      { title: "Usuários", url: "/admin/users", icon: Users },
      { title: "Motoboys", url: "/admin/perfis/motoboys", icon: Bike },
      { title: "🧪 Teste Motoboy", url: "/admin/motoboy-test", icon: Bike },
      { title: "Lojas", url: "/admin/lojas", icon: Store },
      { title: "Imóveis", url: "/admin/imoveis", icon: Building2 },
      { title: "Veículos", url: "/admin/vehicles", icon: Car },
      { title: "Serviços", url: "/admin/servicos", icon: Briefcase },
      { title: "Fretes & Transportes", url: "/admin/fretes", icon: Truck },
      { title: "Viagens & Turismo", url: "/admin/viagens", icon: Plane },
      { title: "Créditos", url: "/admin/creditos", icon: Coins },
      { title: "Pacotes de Promoção", url: "/admin/promotion-packages", icon: Megaphone },
      { title: "Pacotes Imóveis", url: "/admin/imoveis/pacotes", icon: Building2 },
      { title: "Moderação de Imóveis", url: "/admin/imoveis/moderacao", icon: Building2 },
      { title: "Aprovação de Imagens", url: "/admin/imoveis/aprovacao-imagens", icon: Camera },
      { title: "Marketplace", url: "/admin/marketplace", icon: BarChart3 },
      { title: "Produtos Marketplace", url: "/admin/marketplace/products", icon: Package },
      { title: "Imagens Produtos", url: "/admin/moderacao-imagens", icon: Camera },
      { title: "Financeiro", url: "/admin/financeiro", icon: Wallet },
      { title: "Config. Mercado Pago", url: "/admin/pagamentos/mercadopago", icon: CreditCard, badge: "NOVO" },
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
  const [sidebarSearch, setSidebarSearch] = useState("");

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

  // Filtro de busca: filtra itens cujo título contém o texto digitado
  if (sidebarSearch.trim()) {
    const q = sidebarSearch.toLowerCase();
    filteredSections = filteredSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          item.title.toLowerCase().includes(q) ||
          section.title.toLowerCase().includes(q)
        ),
      }))
      .filter((section) => section.items.length > 0);
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
      <div className="border-b">
        <div className="flex h-16 items-center px-5 gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm shrink-0">
            SP
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-none">SuperPainel</h1>
            <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">
              Centro Nacional
            </span>
          </div>
        </div>
        {/* Caixa de pesquisa */}
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Buscar menu..."
              className="w-full h-8 pl-8 pr-8 rounded-lg border border-border bg-muted/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
            {sidebarSearch && (
              <button
                onClick={() => setSidebarSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <nav className="p-3 space-y-5">
          {filteredSections.length === 0 && sidebarSearch.trim() && (
            <div className="py-8 text-center">
              <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum item encontrado</p>
              <button onClick={() => setSidebarSearch("")} className="mt-2 text-[10px] text-primary underline">
                Limpar busca
              </button>
            </div>
          )}
          {filteredSections.map((section, sectionIdx) => {
            const isGestao = section.title === "Gestão";
            const isOrionAi = section.title === "ORION AI CENTER";
            return (
            <div
              key={section.title}
              className={cn(
                isGestao && "bg-[#FFE600] rounded-xl p-2 -mx-1",
                isOrionAi && "bg-[#E3F2FD] border border-blue-200/80 rounded-xl p-2 -mx-1"
              )}
            >
              {sectionIdx > 0 && !isGestao && !isOrionAi && <Separator className="mb-4" />}
              <div className="mb-2 px-2">
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.15em] flex items-center gap-1.5",
                    isGestao ? "text-zinc-900" : isOrionAi ? "text-blue-900" : "text-zinc-900"
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
                          : isOrionAi
                          ? "text-blue-950 hover:bg-blue-200/80 hover:text-blue-900"
                          : "text-zinc-900 hover:bg-muted hover:text-black"
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
          className="w-full justify-start gap-2.5 text-zinc-900 hover:text-destructive text-[13px]"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
