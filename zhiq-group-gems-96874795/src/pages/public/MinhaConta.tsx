// ── MinhaConta ───────────────────────────────────────────────────────────────
// Hub da conta do usuário viajante (mini-conta via magic link). Agrupa os
// acessos: Meus dados, Minha Carteira e Meus perfis. Só navegação — não lê
// nem grava nada novo. Envolvido no MarketLayout (cabeçalho do mercado).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  User, Wallet, Users, LogOut, LogIn, ChevronRight, ShieldCheck,
} from "lucide-react";

interface HubItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  to: string;
  accent: string; // classes tailwind do círculo do ícone
}

const ITEMS: HubItem[] = [
  {
    icon: User,
    title: "Meus dados",
    desc: "Foto, nome, cidade e informações pessoais",
    to: "/meus-dados",
    accent: "bg-blue-500/15 text-blue-500 border-blue-500/25",
  },
  {
    icon: Wallet,
    title: "Minha Carteira",
    desc: "Saldo, adicionar crédito e histórico de corridas",
    to: "/minha-carteira",
    accent: "bg-[#FF6A00]/15 text-[#FF6A00] border-[#FF6A00]/25",
  },
  {
    icon: Users,
    title: "Meus perfis",
    desc: "Trocar entre passageiro, lojista ou profissional",
    to: "/select-profile",
    accent: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
  },
];

export default function MinhaConta() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [search, setSearch] = useState("");

  const displayName =
    (user?.user_metadata?.name as string) || user?.email?.split("@")[0] || "Viajante";

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      onSearchSubmit={(val) => navigate(`/mercado?q=${encodeURIComponent(val)}`)}
      headerChildren={<MarketNavButtons />}
      blueFooter
      blueFooterLabel="👤 Minha Conta"
      myAccountPath="/conta"
    >
      <div className="mx-auto max-w-lg space-y-5 px-4 pb-12 pt-5">
        {/* Cabeçalho do usuário */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Card
            className="overflow-hidden rounded-2xl border-0 text-white shadow-xl"
            style={{ background: "linear-gradient(135deg, #1a1f28, #0D0F12)" }}
          >
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#FF6A00]/30 bg-[#FF6A00]/20 text-2xl font-black text-[#FF6A00]">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Minha Conta</p>
                <p className="truncate text-lg font-black">{user ? displayName : "Visitante"}</p>
                <p className="truncate text-xs text-white/60">{user?.email || "Você não está logado"}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Itens do hub */}
        <div className="space-y-3">
          {ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.to}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 + i * 0.05, ease: "easeOut" }}
                onClick={() => navigate(item.to)}
                className="w-full text-left"
              >
                <Card className="rounded-2xl border border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${item.accent}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </motion.button>
            );
          })}
        </div>

        {/* Entrar / Sair */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25, ease: "easeOut" }}
        >
          {user ? (
            <Button
              variant="outline"
              className="w-full gap-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
              onClick={async () => { await signOut?.(); navigate("/mercado"); }}
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </Button>
          ) : (
            <Button className="w-full gap-2" onClick={() => navigate("/auth")}>
              <LogIn className="h-4 w-4" />
              Entrar / Criar mini-conta
            </Button>
          )}
        </motion.div>

        <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Seus dados são protegidos pela plataforma VIAGG-TX8™</span>
        </div>
      </div>
    </MarketLayout>
  );
}
