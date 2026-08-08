import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, HeartHandshake, LayoutList, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { GESTOR_NAV_SECTIONS, type GestorNavItem } from "@/lib/convenio/gestorNav";

interface GestorPanelLayoutProps {
  children: React.ReactNode;
}

function navLinkClassName({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
    isActive
      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
      : "text-white/60 hover:bg-white/[0.06] hover:text-white"
  );
}

function NavItemWithChildren({ item, onNavigate }: { item: GestorNavItem; onNavigate: () => void }) {
  const location = useLocation();
  const hasActiveChild = item.children?.some((child) => location.pathname.startsWith(child.path)) ?? false;
  const [open, setOpen] = useState(hasActiveChild);
  const Icon = item.icon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 flex-shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1 space-y-1 border-l border-white/10 pl-3">
          <NavLink to={item.path} end onClick={onNavigate} className={navLinkClassName}>
            <LayoutList className="h-4 w-4 flex-shrink-0" />
            <span className="truncate text-xs uppercase tracking-wide text-white/40">Visão geral</span>
          </NavLink>
          {item.children!.map((child) => (
            <NavLink key={child.path} to={child.path} onClick={onNavigate} className={navLinkClassName}>
              <child.icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{child.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Comando Convênio Fase 1 — shell do Super Painel Administrativo do Gestor.
 * Totalmente independente do AdminLayout/AdminSidebar existentes: sidebar e
 * layout próprios, visual dark glass-morphism (mesma linha do Centro de
 * Conformidade — ORION-520/521).
 */
export function GestorPanelLayout({ children }: GestorPanelLayoutProps) {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/convenio-admin/login");
  };

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/15">
          <HeartHandshake className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-black text-white leading-tight">Comando Convênio</p>
          <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Super Painel</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
        {GESTOR_NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/30">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) =>
                item.children ? (
                  <NavItemWithChildren key={item.path} item={item} onNavigate={() => setMobileOpen(false)} />
                ) : (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/convenio-admin"}
                    onClick={() => setMobileOpen(false)}
                    className={navLinkClassName}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                )
              )}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-4 space-y-2">
        <p className="truncate px-2 text-[11px] text-white/40">{user?.email}</p>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Sidebar desktop */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-white/10 lg:bg-white/[0.02]">
        {SidebarContent}
      </aside>

      {/* Sidebar mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-white/10 bg-zinc-950">
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Topbar mobile */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <HeartHandshake className="h-5 w-5 text-emerald-400" />
          <span className="text-sm font-black">Comando Convênio</span>
        </div>
        <button onClick={() => setMobileOpen((v) => !v)} className="p-2 text-white/70 hover:text-white">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
