// ── MeusDados ────────────────────────────────────────────────────────────────
// "Meus dados" do CLIENTE/PASSAGEIRO (mini-conta via magic link — sem perfil
// profissional). Permite editar avatar, endereço (cidade/estado) e demais
// dados pessoais gravados em `profiles`.
//
// REGRA: só grava em colunas que o app já grava hoje (ver Profile.tsx →
// handleSave): name, cidade, estado, avatar_url, cpf, data_nascimento,
// updated_at. Nenhuma coluna nova (nada de telefone/rua/cep/bairro aqui).

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { brazilianStates } from "@/lib/brazilianStates";
import { goToMiniLogin } from "@/lib/auth/miniReturn";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import viaggLogo from "@/assets/logo.png";
import {
  User,
  Mail,
  MapPin,
  Calendar,
  CreditCard,
  Check,
  ArrowLeft,
  Loader2,
  Wallet,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface MeusDadosForm {
  name: string;
  cpf: string;
  data_nascimento: string;
  cidade: string;
  estado: string;
  avatar_url: string;
}

// ── Helpers puros ─────────────────────────────────────────────────────────────
const formatCPF = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const validateBirthDate = (dateStr: string): boolean => {
  if (!dateStr) return true;
  const date = new Date(dateStr);
  const today = new Date();
  return date <= today;
};

// ── Componente principal ──────────────────────────────────────────────────────
export default function MeusDados() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Se veio do botão "Chamar" de um perfil, ?next= traz a rota do mapa.
  const next = searchParams.get("next");
  const { user, initialized } = useAuth();

  const [search, setSearch] = useState("");

  const [form, setForm] = useState<MeusDadosForm>({
    name: "",
    cpf: "",
    data_nascimento: "",
    cidade: "",
    estado: "",
    avatar_url: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ── Carrega dados atuais de `profiles` ──────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    let alive = true;
    setIsLoading(true);

    (supabase as any)
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }: any) => {
        if (!alive) return;
        if (error) {
          console.warn("[MeusDados] erro ao buscar profile:", error);
        } else if (data) {
          setForm({
            name: data.name || "",
            cpf: data.cpf || "",
            data_nascimento: data.data_nascimento || "",
            cidade: data.cidade || "",
            estado: data.estado || "",
            avatar_url: data.avatar_url || "",
          });
        }
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [user]);

  const handleChange = (field: keyof MeusDadosForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAvatarUpload = (url: string) => {
    setForm((prev) => ({ ...prev, avatar_url: url }));
  };

  // ── Save — mesma lógica/colunas de Profile.tsx (handleSave) ─────────────────
  const handleSave = async () => {
    if (!user) return;

    if (!validateBirthDate(form.data_nascimento)) {
      toast.error("A data de nascimento não pode ser uma data futura");
      return;
    }

    setIsSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        name: form.name || null,
        cidade: form.cidade || null,
        estado: form.estado || null,
        avatar_url: form.avatar_url || null,
        cpf: form.cpf.replace(/\D/g, "") || null,
        updated_at: new Date().toISOString(),
      };

      if (form.data_nascimento) {
        updateData.data_nascimento = form.data_nascimento;
      }

      const { error } = await supabase.from("profiles").update(updateData).eq("id", user.id);
      if (error) throw error;

      toast.success("Dados atualizados!");
      // Fluxo "Chamar": após salvar, segue direto pro mapa da corrida.
      if (next) {
        navigate(next);
        return;
      }
    } catch (error: any) {
      console.error("[MeusDados] erro ao salvar profile:", error);
      toast.error(error?.message || "Erro ao salvar seus dados");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Estado: autenticação ainda resolvendo (evita "piscar" formulário vazio) ─
  if (!initialized) {
    return (
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-5">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  // ── Estado: não autenticado ──────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5E62B] px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-sm"
        >
          <Card className="rounded-2xl border-border/50 shadow-lg">
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 p-1 shadow-sm">
                <img src={viaggLogo} alt="Viagg" className="h-full w-full object-cover rounded-xl" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">Faça login para ver seus dados</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Entre com o link enviado ao seu e-mail para editar suas informações pessoais.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => goToMiniLogin(navigate, "/meus-dados" + window.location.search)}
              >
                Fazer login
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ── Layout principal ──────────────────────────────────────────────────────
  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      onSearchSubmit={(val) => navigate(`/mercado?q=${encodeURIComponent(val)}`)}
      headerChildren={<MarketNavButtons />}
      blueFooter
      blueFooterLabel="👤 Meus Dados"
    >
      <main className="mx-auto max-w-lg space-y-5 px-4 pb-10 pt-5">

        {/* Título */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#FF6A00]" />
            <h1 className="text-lg font-black tracking-tight text-zinc-900">Meus Dados</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate("/minha-carteira")}
          >
            <Wallet className="h-4 w-4" />
            Carteira
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-5">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="space-y-5"
          >
            {/* Banner do fluxo "Chamar" — confirma dados antes de ir pro mapa */}
            {next && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex items-start gap-3 rounded-2xl border border-[#FF6A00]/25 bg-[#FF6A00]/10 p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/20 text-[#FF6A00]">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-zinc-900">Confirme seus dados antes de chamar</p>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    Sua cidade e estado já ajudam a definir a coleta no mapa. Salve para
                    seguir, ou avance direto se já estiver tudo certo.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(next)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#FF6A00] underline underline-offset-2"
                  >
                    Continuar para a corrida →
                  </button>
                </div>
              </motion.div>
            )}

            {/* Avatar */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <Card className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-md">
                <CardContent className="flex flex-col items-center gap-2 p-6">
                  <AvatarUpload
                    userId={user.id}
                    currentAvatarUrl={form.avatar_url}
                    userName={form.name}
                    onUploadComplete={handleAvatarUpload}
                  />
                </CardContent>
              </Card>
            </motion.div>

            {/* Informações pessoais */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05, ease: "easeOut" }}
            >
              <Card className="rounded-2xl border border-zinc-200 bg-white shadow-md">
                <CardContent className="space-y-5 p-5">
                  <div className="flex items-center gap-2 px-0.5">
                    <User className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-700">
                      Informações Pessoais
                    </h2>
                  </div>

                  {/* E-mail (read-only) */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      E-mail
                    </Label>
                    <Input id="email" value={user.email || ""} disabled className="bg-muted !text-black disabled:opacity-100" />
                  </div>

                  {/* Nome completo */}
                  <div className="space-y-2">
                    <Label htmlFor="name" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Nome Completo
                    </Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="Seu nome completo"
                      maxLength={100}
                    />
                  </div>

                  {/* CPF */}
                  <div className="space-y-2">
                    <Label htmlFor="cpf" className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      CPF
                    </Label>
                    <Input
                      id="cpf"
                      value={formatCPF(form.cpf)}
                      onChange={(e) => handleChange("cpf", e.target.value.replace(/\D/g, ""))}
                      placeholder="000.000.000-00"
                      maxLength={14}
                    />
                  </div>

                  {/* Data de nascimento */}
                  <div className="space-y-2">
                    <Label htmlFor="data_nascimento" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Data de Nascimento
                    </Label>
                    <Input
                      id="data_nascimento"
                      type="date"
                      value={form.data_nascimento}
                      onChange={(e) => handleChange("data_nascimento", e.target.value)}
                      max={new Date().toISOString().split("T")[0]}
                    />
                  </div>

                  {/* Cidade */}
                  <div className="space-y-2">
                    <Label htmlFor="cidade" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Cidade
                    </Label>
                    <Input
                      id="cidade"
                      value={form.cidade}
                      onChange={(e) => handleChange("cidade", e.target.value)}
                      placeholder="Sua cidade"
                      maxLength={100}
                    />
                  </div>

                  {/* Estado */}
                  <div className="space-y-2">
                    <Label htmlFor="estado" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Estado
                    </Label>
                    <Select value={form.estado} onValueChange={(value) => handleChange("estado", value)}>
                      <SelectTrigger id="estado" className="text-zinc-900 bg-white border-zinc-300 [&>span]:text-zinc-900">
                        <SelectValue placeholder="Selecione o estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {brazilianStates.map((state) => (
                          <SelectItem key={state.value} value={state.value}>
                            {state.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Aviso sobre endereço de coleta */}
                  <div className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-100 p-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
                    <p className="text-xs font-medium text-zinc-700">
                      Cidade e estado ajudam a identificar sua região. O endereço exato de coleta de
                      cada corrida é sempre informado no mapa, na hora de chamar o profissional.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Botão salvar */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" }}
            >
              <Button
                type="submit"
                disabled={isSaving}
                size="lg"
                className="w-full text-white shadow-md transition-transform active:scale-95"
                style={{ background: "linear-gradient(135deg, #FF6A00, #FF4500)" }}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Check className="mr-2 h-5 w-5" />
                )}
                {isSaving ? "Salvando..." : next ? "Salvar e chamar a corrida" : "Salvar"}
              </Button>
            </motion.div>
          </form>
        )}
      </main>
    </MarketLayout>
  );
}
