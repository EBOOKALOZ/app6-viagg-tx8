import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  User,
  MapPin,
  Calendar,
  ShieldCheck,
  Bike,
  Car,
  Award,
  CreditCard,
  FileText,
  Phone,
  Mail,
  Edit2,
  Save,
  Image as ImageIcon,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ProfileFinancialDashboard, OperationalProfileType } from "@/components/admin/ProfileFinancialDashboard";

const fmtDate = (dateStr?: string) => {
  if (!dateStr) return "N/D";
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR");
  } catch {
    return dateStr;
  }
};

const DEFAULT_AVATARS: Record<OperationalProfileType, string> = {
  mototaxi: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=250&auto=format&fit=crop&q=80",
  ride: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=250&auto=format&fit=crop&q=80",
  delivery: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=250&auto=format&fit=crop&q=80",
};

const PRESET_AVATARS = [
  { label: "Foto 1 (Mototaxista)", url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=250&auto=format&fit=crop&q=80" },
  { label: "Foto 2 (Motorista)", url: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=250&auto=format&fit=crop&q=80" },
  { label: "Foto 3 (Entregador)", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=250&auto=format&fit=crop&q=80" },
  { label: "Foto 4 (Profissional)", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=250&auto=format&fit=crop&q=80" },
];

export function AdminProfessionalIndividualPage() {
  const { profileSlug, id } = useParams<{ profileSlug: string; id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Modal de edição de todos os dados do autônomo (contato, endereço, avatar, veículo)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editCidade, setEditCidade] = useState("");
  const [editEstado, setEditEstado] = useState("");
  const [editVehicleModel, setEditVehicleModel] = useState("");
  const [editVehiclePlate, setEditVehiclePlate] = useState("");
  const [editVehicleColor, setEditVehicleColor] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const location = useLocation();
  const stateProf = location.state?.prof;

  // Determinação rigorosa da categoria operacional do profissional
  const resolveProfileType = (): OperationalProfileType => {
    if (stateProf?.profileType === "delivery" || stateProf?.profileType === "mototaxi" || stateProf?.profileType === "ride") {
      return stateProf.profileType;
    }
    const avail = String(stateProf?.available_profiles || "").toLowerCase();
    if (avail.includes("motoboy") || avail.includes("delivery") || avail.includes("entregador")) return "delivery";
    if (avail.includes("mototaxi") || avail.includes("moto-taxi")) return "mototaxi";
    if (avail.includes("motorista") || avail.includes("driver") || avail.includes("ride")) return "ride";

    if (profileSlug === "moto-taxi" || profileSlug === "mototaxi") return "mototaxi";
    if (profileSlug === "motorista" || profileSlug === "ride") return "ride";
    return "delivery";
  };

  const profileType: OperationalProfileType = resolveProfileType();

  const config =
    profileType === "delivery"
      ? {
          title: "Análise Financeira — Motoboy (Entregas)",
          subtitle: "Auditoria individual de ganhos, comissões retidas e histórico de entregas do motoboy.",
          accentColor: "#f59e0b",
          label: "Motoboy",
          icon: Bike,
        }
      : profileType === "mototaxi"
      ? {
          title: "Análise Financeira — Moto Táxi",
          subtitle: "Auditoria individual de corridas de passageiro, repasses e taxas da vertical Moto Táxi.",
          accentColor: "#3b82f6",
          label: "Moto Táxi",
          icon: Bike,
        }
      : {
          title: "Análise Financeira — Motorista",
          subtitle: "Auditoria individual de viagens urbanas, repasses bancários e comissões do motorista.",
          accentColor: "#10b981",
          label: "Motorista",
          icon: Car,
        };

  // ── Consulta completa do Cadastro do Autônomo e Veículo ──
  const { data: profileData, isLoading, refetch } = useQuery({
    queryKey: ["admin-professional-profile-detail", id],
    queryFn: async () => {
      if (!id) return null;
      const { data: prof, error } = await (supabase.from("profiles") as any)
        .select("id, name, email, cidade, estado, cpf, avatar_url, created_at, phone, available_profiles")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.warn("Erro buscando perfil do autônomo:", error);
      }

      // Busca veículo em driver_vehicles
      let vData: any = null;
      try {
        const { data: dvList } = await (supabase.from("driver_vehicles") as any)
          .select("brand, model, plate, color, manufacture_year, active")
          .eq("driver_id", id)
          .order("active", { ascending: false })
          .limit(1);
        if (dvList && dvList.length > 0) {
          vData = dvList[0];
        }
      } catch {
        // Ignora erro
      }

      // Busca nos perfis operacionais (motoboy_profiles, moto_taxi_profiles, driver_profiles)
      let opData: any = null;
      try {
        if (profileType === "delivery") {
          const { data } = await (supabase.from("motoboy_profiles") as any).select("*").eq("user_id", id).maybeSingle();
          opData = data;
        } else if (profileType === "mototaxi") {
          const { data } = await (supabase.from("moto_taxi_profiles") as any).select("*").eq("user_id", id).maybeSingle();
          if (!data) {
            const { data: fallbackMoto } = await (supabase.from("motoboy_profiles") as any).select("*").eq("user_id", id).maybeSingle();
            opData = fallbackMoto;
          } else {
            opData = data;
          }
        } else {
          const { data } = await (supabase.from("driver_profiles") as any).select("*").eq("user_id", id).maybeSingle();
          opData = data;
        }
      } catch {
        // Ignora erro
      }

      let vehicleInfo = {
        model:
          profileType === "mototaxi" || profileType === "delivery"
            ? "Veículo Padrão (Moto)"
            : "Veículo Padrão (Carro)",
        plate: "Não informada",
        color: "Não informada",
        year: "2024",
      };

      if (vData) {
        vehicleInfo = {
          model: `${vData.brand || ""} ${vData.model || ""}`.trim() || vehicleInfo.model,
          plate: vData.plate || vehicleInfo.plate,
          color: vData.color || vehicleInfo.color,
          year: String(vData.manufacture_year || vehicleInfo.year),
        };
      } else if (opData && (opData.veiculo_modelo || opData.veiculo_placa || opData.modelo || opData.placa)) {
        vehicleInfo = {
          model: opData.veiculo_modelo || opData.modelo || vehicleInfo.model,
          plate: opData.veiculo_placa || opData.placa || vehicleInfo.plate,
          color: opData.veiculo_cor || opData.cor || vehicleInfo.color,
          year: String(opData.veiculo_ano || opData.ano || vehicleInfo.year),
        };
      }

      const realName =
        prof?.name && prof?.name.trim() !== ""
          ? prof.name
          : opData?.nome
          ? `${opData.nome} ${opData.sobrenome || ""}`.trim()
          : stateProf?.name && stateProf?.name.trim() !== ""
          ? stateProf.name
          : `Profissional #${id.slice(0, 8)}`;
      const realPhone = prof?.phone || opData?.whatsapp || opData?.telefone || stateProf?.phone || "Não informado";
      const realEmail = prof?.email || opData?.email || stateProf?.email || "Não informado";
      const realCidade = prof?.cidade || opData?.cidade || stateProf?.cidade || "Não informada";
      const realEstado = prof?.estado || opData?.estado || stateProf?.estado || "BR";
      const realCpf = prof?.cpf || opData?.cpf || opData?.cpf_cnpj || stateProf?.cpf || "Não informado";
      const realAvatar = prof?.avatar_url || opData?.foto || opData?.foto_url || stateProf?.avatar_url || DEFAULT_AVATARS[profileType];

      return {
        id: prof?.id || stateProf?.id || id,
        name: realName,
        email: realEmail,
        cidade: realCidade,
        estado: realEstado,
        cpf: realCpf,
        avatar_url: realAvatar,
        created_at: prof?.created_at || stateProf?.created_at || new Date().toISOString(),
        phone: realPhone,
        available_profiles: prof?.available_profiles || stateProf?.available_profiles,
        vehicle: vehicleInfo,
      };
    },
    enabled: !!id,
    initialData: stateProf
      ? {
          id: stateProf.id || id,
          name: stateProf.name || `Profissional #${(id || "").slice(0, 8)}`,
          email: stateProf.email || "Não informado",
          cidade: stateProf.cidade || "Não informada",
          estado: stateProf.estado || "BR",
          cpf: stateProf.cpf || "Não informado",
          avatar_url: stateProf.avatar_url || DEFAULT_AVATARS[profileType],
          created_at: stateProf.created_at || new Date().toISOString(),
          phone: stateProf.phone || "Não informado",
          vehicle: {
            model:
              profileType === "mototaxi" || profileType === "delivery"
                ? "Veículo Padrão (Moto)"
                : "Veículo Padrão (Carro)",
            plate: "Não informada",
            color: "Não informada",
            year: "2024",
          },
        }
      : undefined,
  });

  const openEditModal = () => {
    if (!profileData) return;
    setEditName(profileData.name);
    setEditPhone(profileData.phone);
    setEditEmail(profileData.email);
    setEditAvatarUrl(profileData.avatar_url);
    setEditCidade(profileData.cidade);
    setEditEstado(profileData.estado);
    setEditVehicleModel(profileData.vehicle?.model || "");
    setEditVehiclePlate(profileData.vehicle?.plate || "");
    setEditVehicleColor(profileData.vehicle?.color || "");
    setIsEditModalOpen(true);
  };

  const handleSaveContactAndAvatar = async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      await (supabase.from("profiles") as any)
        .update({
          name: editName,
          phone: editPhone,
          email: editEmail,
          avatar_url: editAvatarUrl,
          cidade: editCidade,
          estado: editEstado,
        })
        .eq("id", id);

      const opPayload = {
        whatsapp: editPhone,
        telefone: editPhone,
        email: editEmail,
        cidade: editCidade,
        estado: editEstado,
        foto: editAvatarUrl,
        foto_url: editAvatarUrl,
        veiculo_modelo: editVehicleModel,
        veiculo_placa: editVehiclePlate,
        veiculo_cor: editVehicleColor,
      };

      if (profileType === "delivery") {
        await (supabase.from("motoboy_profiles") as any).update(opPayload).eq("user_id", id);
      } else if (profileType === "mototaxi") {
        await (supabase.from("moto_taxi_profiles") as any).update(opPayload).eq("user_id", id);
        await (supabase.from("motoboy_profiles") as any).update(opPayload).eq("user_id", id);
      } else {
        await (supabase.from("driver_profiles") as any).update(opPayload).eq("user_id", id);
      }

      try {
        const { data: existingV } = await (supabase.from("driver_vehicles") as any)
          .select("id")
          .eq("driver_id", id)
          .limit(1);

        if (existingV && existingV.length > 0) {
          await (supabase.from("driver_vehicles") as any)
            .update({
              model: editVehicleModel,
              plate: editVehiclePlate,
              color: editVehicleColor,
            })
            .eq("id", existingV[0].id);
        } else if (editVehicleModel || editVehiclePlate) {
          await (supabase.from("driver_vehicles") as any)
            .insert([{
              driver_id: id,
              brand: "",
              model: editVehicleModel,
              plate: editVehiclePlate,
              color: editVehicleColor,
              active: true,
              vehicle_type: profileType === "ride" ? "car" : "motorcycle",
            }]);
        }
      } catch (errV) {
        console.warn("Aviso ao atualizar driver_vehicles:", errV);
      }

      toast({
        title: "Dados atualizados com sucesso!",
        description: "Os dados do autônomo (contato, endereço, avatar e veículo) foram aplicados em tempo real.",
      });

      setIsEditModalOpen(false);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["admin-professionals-hub-list"] });
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro ao atualizar",
        description: "Verifique os dados e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const IconComp = config.icon;

  return (
    <div className="w-full space-y-6 pb-12">
      {/* ── Botão de Retorno e Navegação ── */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/admin/profissionais-hub")}
          className="h-9 px-3.5 text-xs font-bold text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4 mr-2 text-primary" />
          Voltar para Lista de Profissionais
        </Button>

        <div className="flex items-center gap-2">
          {profileData && (
            <Button
              variant="outline"
              size="sm"
              onClick={openEditModal}
              className="h-9 px-3.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
            >
              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
              Atualizar Dados do Autônomo
            </Button>
          )}

          <Badge variant="outline" className="font-bold text-black dark:text-white border-slate-300">
            Auditoria Operacional • Profissional #{id?.slice(0, 8)}
          </Badge>
        </div>
      </div>

      {/* ── Banner/Card Completo com Informações de Cadastro e Veículo ── */}
      {isLoading ? (
        <Card className="p-6 space-y-4">
          <Skeleton className="h-16 w-full" />
        </Card>
      ) : profileData ? (
        <Card className="border-border/80 shadow-md bg-card overflow-hidden">
          <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-border/60">
            {/* Foto + Dados Pessoais */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-primary/40 shadow-md">
                <AvatarImage src={profileData.avatar_url} className="object-cover" />
                <AvatarFallback className="bg-primary/15 text-primary font-black text-lg">
                  {profileData.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">
                    {profileData.name}
                  </h2>
                  <Badge
                    className="font-bold text-xs"
                    style={{ backgroundColor: `${config.accentColor}20`, color: config.accentColor }}
                  >
                    <IconComp className="w-3.5 h-3.5 mr-1" />
                    {config.label}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openEditModal}
                    className="h-7 px-2.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/10 ml-1"
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1" />
                    Editar Dados
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-1.5">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    {profileData.cidade} - {profileData.estado}
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    CPF: {profileData.cpf}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    Desde {fmtDate(profileData.created_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* Dados do Veículo + Avaliação */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t lg:border-t-0 pt-4 lg:pt-0">
              <div className="p-3 rounded-xl bg-muted/50 border border-border/60 relative group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Veículo</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={openEditModal}
                    className="h-5 w-5 text-emerald-600 hover:text-emerald-700"
                    title="Atualizar veículo"
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="text-xs font-black text-slate-900 dark:text-white truncate mt-0.5">
                  {profileData.vehicle.model}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  Placa: {profileData.vehicle.plate} • {profileData.vehicle.color}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/50 border border-border/60 relative group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Contato Atual</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={openEditModal}
                    className="h-5 w-5 text-emerald-600 hover:text-emerald-700"
                    title="Atualizar contato e avatar"
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">
                  {profileData.phone}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">{profileData.email}</div>
              </div>

              <div className="p-3 rounded-xl bg-muted/50 border border-border/60 col-span-2 sm:col-span-1">
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Reputação</div>
                <div className="text-sm font-black text-amber-500 mt-0.5">⭐ 4.9 / 5.0</div>
                <div className="text-[10px] text-muted-foreground">Profissional Verificado</div>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ── Modal Interativo para Atualizar Todos os Dados do Autônomo ── */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md bg-card border border-border shadow-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-primary" />
              Atualizar Dados do Autônomo
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Altere os dados pessoais, contato, endereço e veículo do autônomo. As mudanças refletem em tempo real no painel e na plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Pré-visualização e URL do Avatar */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-900 dark:text-white">Foto de Avatar (URL da Imagem)</Label>
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 border border-border">
                  <AvatarImage src={editAvatarUrl} className="object-cover" />
                  <AvatarFallback className="bg-primary/20 text-primary font-bold">FA</AvatarFallback>
                </Avatar>
                <Input
                  value={editAvatarUrl}
                  onChange={(e) => setEditAvatarUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="text-xs font-mono"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_AVATARS.map((preset, idx) => (
                  <Button
                    key={idx}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditAvatarUrl(preset.url)}
                    className="text-[10px] h-6 px-2 py-0"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Nome Completo */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-900 dark:text-white">Nome do Profissional</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome do profissional"
                className="text-xs font-medium"
              />
            </div>

            {/* Telefone / WhatsApp */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-900 dark:text-white">Telefone / WhatsApp</Label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-900 dark:text-white">E-mail</Label>
                <Input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="email@profissional.com"
                  className="text-xs font-mono"
                />
              </div>
            </div>

            {/* Cidade e Estado */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-bold text-slate-900 dark:text-white">Cidade</Label>
                <Input
                  value={editCidade}
                  onChange={(e) => setEditCidade(e.target.value)}
                  placeholder="Ex.: São Paulo"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-900 dark:text-white">UF</Label>
                <Input
                  value={editEstado}
                  onChange={(e) => setEditEstado(e.target.value)}
                  placeholder="SP"
                  maxLength={2}
                  className="text-xs uppercase font-mono"
                />
              </div>
            </div>

            {/* Veículo (Modelo, Placa e Cor) */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <Label className="text-xs font-bold text-slate-900 dark:text-white">Veículo (Modelo, Placa e Cor)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Modelo</span>
                  <Input
                    value={editVehicleModel}
                    onChange={(e) => setEditVehicleModel(e.target.value)}
                    placeholder="Ex.: Honda CG 160"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Placa</span>
                  <Input
                    value={editVehiclePlate}
                    onChange={(e) => setEditVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="Ex.: ABC1D23"
                    className="text-xs font-mono uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Cor</span>
                  <Input
                    value={editVehicleColor}
                    onChange={(e) => setEditVehicleColor(e.target.value)}
                    placeholder="Ex.: Vermelha"
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(false)}
              className="text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={isSaving}
              onClick={handleSaveContactAndAvatar}
              className="text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSaving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dashboard Financeiro Analítico Exclusivo do Profissional ── */}
      <ProfileFinancialDashboard
        profileType={profileType}
        title={`${config.title} — ${profileData?.name || "Profissional"}`}
        subtitle={`Auditoria individual de receitas, comissões, taxas e histórico de operações para ${profileData?.name || "este profissional"}.`}
        accentColor={config.accentColor}
        professionalId={id}
        professionalName={profileData?.name}
      />
    </div>
  );
}

export default AdminProfessionalIndividualPage;
