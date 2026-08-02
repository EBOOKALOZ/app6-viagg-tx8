/**
 * /medprev — Viagg-TX8 MedPrev (ORION-510 → Comando Convênio Fase 1).
 *
 * Página pública do módulo Doações & Convênios: transparência (arrecadado,
 * destinado, histórico, status de campanhas, prestação de contas),
 * informações institucionais e link de acesso ao Super Painel do Gestor.
 * Fase 1: dados de arrecadação/histórico são estruturais/simulados —
 * nenhuma operação financeira real está ativa (ver convenio_settings).
 *
 * REDESIGN VISUAL (2026-08-02): paleta branco + azul + verde.
 * Identidade amarela completamente removida. Sistema de som preservado
 * via MarketLayout (PremiumQuickAccessBar). Rodapé global intacto.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft, HeartHandshake, HandCoins, ShieldCheck, Landmark,
  Stethoscope, Hospital, ShoppingBasket, Users, HeartPulse, FileSpreadsheet,
  Megaphone, ExternalLink, Activity, TrendingUp, Heart, ArrowRight,
} from "lucide-react";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { PartnerLeadModal } from "@/components/convenio/PartnerLeadModal";
import { EntityReferralModal } from "@/components/convenio/EntityReferralModal";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePublicAccountability, usePublicCampaigns, usePublicDonations, usePublicMedPrevStats,
} from "@/hooks/convenio/useConvenioPublic";

/* ═══ CONSTANTES DE DADOS ═══ */

const FEATURE_CARDS: { icon: React.ElementType; label: string; color: string }[] = [
  { icon: ShieldCheck, label: "Convênios", color: "text-blue-600 bg-blue-50" },
  { icon: HandCoins, label: "Doações", color: "text-emerald-600 bg-emerald-50" },
  { icon: Landmark, label: "Transparência", color: "text-blue-600 bg-blue-50" },
  { icon: HeartHandshake, label: "Repasses Diretos", color: "text-emerald-600 bg-emerald-50" },
  { icon: Stethoscope, label: "Clínicas", color: "text-blue-600 bg-blue-50" },
  { icon: Hospital, label: "Hospitais", color: "text-emerald-600 bg-emerald-50" },
  { icon: ShoppingBasket, label: "Cestas Básicas", color: "text-blue-600 bg-blue-50" },
  { icon: Users, label: "Projetos Sociais", color: "text-emerald-600 bg-emerald-50" },
];

const PARTNER_ENTITIES: { name: string; type: string }[] = [
  { name: "Em breve", type: "Convênio de Saúde" },
  { name: "Em breve", type: "Instituição Beneficente" },
  { name: "Em breve", type: "Clínica Parceira" },
];

const HOW_IT_WORKS: { step: string; title: string; text: string }[] = [
  { step: "1", title: "Você compra ou contribui", text: "Suas compras na plataforma podem gerar apoio automático às entidades parceiras." },
  { step: "2", title: "O repasse é direcionado", text: "Uma parte é destinada a convênios, clínicas ou projetos sociais cadastrados." },
  { step: "3", title: "O impacto é acompanhado", text: "Entidades parceiras e apoiadores acompanham o resultado das doações." },
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: "O que é o Viagg-TX8 MedPrev?", a: "É o módulo de Convênios & Doações da plataforma, criado para conectar compras e apoio social a clínicas, hospitais e projetos beneficentes." },
  { q: "Como uma entidade pode se tornar parceira?", a: "Em breve será possível se cadastrar diretamente por aqui. Por enquanto, use o botão \"Indicar entidade\" para manifestar interesse." },
  { q: "Já existe alguma funcionalidade financeira ativa?", a: "Não. Os valores de arrecadação exibidos nesta página são estruturais/simulados nesta fase. Nenhum recurso de pagamento, carteira ou repasse está ativo ainda." },
  { q: "Como faço para ser um parceiro comercial?", a: "Use o botão \"Quero ser parceiro\" para registrar seu interesse. Nossa equipe entrará em contato." },
];

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  ativa: "Em andamento",
  planejada: "Planejada",
  pausada: "Pausada",
  encerrada: "Encerrada",
};

const CAMPAIGN_STATUS_CLASS: Record<string, string> = {
  ativa: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  planejada: "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
  pausada: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  encerrada: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
};

/* ═══ STAT CARD ICONS ═══ */
const STAT_ICONS = [
  { icon: TrendingUp, color: "text-blue-600 bg-blue-100" },
  { icon: Heart, color: "text-emerald-600 bg-emerald-100" },
  { icon: ShieldCheck, color: "text-blue-600 bg-blue-100" },
  { icon: Users, color: "text-emerald-600 bg-emerald-100" },
];

/* ═══ COMPONENTE PRINCIPAL ═══ */

export default function MedPrevPage() {
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const statsQuery = usePublicMedPrevStats();
  const campaignsQuery = usePublicCampaigns();
  const donationsQuery = usePublicDonations();
  const accountabilityQuery = usePublicAccountability();

  return (
    <MarketLayout
      showSearch={false}
      hideTopMotoboy
      mainClassName="flex flex-col bg-white"
      blueFooter
      blueFooterLabel="❤️➕ Viagg-TX8 MedPrev"
      headerTitle={<>Viagg-TX8 <span className="text-emerald-600">MedPrev</span></>}
      headerChildren={<></>}
      minimalQuickAccess
      lockHeaderExpanded
      hideHeaderContent
      quickAccessBarClass="bg-gradient-to-r from-[#15803d] via-[#16a34a] to-[#22c55e]"
      quickAccessBarLabel={<>Viagg-TX8 <span className="text-emerald-200">MedPrev</span></>}
    >
      <div className="w-full">

        {/* ═══ CUSTOM HEADER (voltar ao mercado) ═══ */}
        <div className="w-full bg-white border-b border-slate-100">
          <div className="max-w-6xl mx-auto px-4 lg:px-6 py-4 flex items-center justify-between">
            <Link
              to="/mercado"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors group"
            >
              <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              Voltar ao Mercado
            </Link>
          </div>
        </div>

        {/* ═══ HERO ═══ */}
        <div className="relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-white via-blue-50/50 to-emerald-50/40" />
          {/* Decorative blurs */}
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-[480px] h-[480px] bg-blue-200/30 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-[400px] h-[400px] bg-emerald-200/25 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-blue-100/20 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative z-10 max-w-6xl mx-auto px-4 lg:px-6 py-16 md:py-20 text-center space-y-6">


            {/* Title */}
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none">
              <span className="text-slate-900">Viagg-TX8</span>{" "}
              <span className="bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent">MedPrev</span>
            </h1>

            {/* Subtitle */}
            <p className="text-slate-600 text-base md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
              Transformando compras em <span className="text-emerald-600 font-bold">cuidado</span> e <span className="text-blue-600 font-bold">esperança</span>.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
              <Button
                size="lg"
                onClick={() => setPartnerModalOpen(true)}
                className="bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-2xl px-8 shadow-lg shadow-blue-600/25 hover:shadow-blue-700/30 hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200"
              >
                Quero ser parceiro <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setReferralModalOpen(true)}
                className="bg-white/80 backdrop-blur-md border-2 border-emerald-400/50 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-500 font-bold rounded-2xl px-8 shadow-sm hover:shadow-emerald-500/20 hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200"
              >
                <HeartHandshake className="h-4 w-4 mr-1.5" />
                Indicar entidade
              </Button>
            </div>
          </div>
        </div>

        <PartnerLeadModal open={partnerModalOpen} onClose={() => setPartnerModalOpen(false)} />
        <EntityReferralModal open={referralModalOpen} onOpenChange={setReferralModalOpen} />

        {/* ═══ TRANSPARÊNCIA — ARRECADADO / DESTINADO ═══ */}
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-16">
          <div className="text-center mb-10 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Transparência</h2>
            <p className="text-sm text-slate-500 font-medium">Acompanhe em tempo real o impacto do MedPrev.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                label: "Total Arrecadado",
                value: `R$ ${(statsQuery.data?.totalArrecadado ?? 0).toLocaleString("pt-BR")}`,
                valueColor: "text-blue-700",
              },
              {
                label: "Total Destinado",
                value: `R$ ${(statsQuery.data?.totalDestinado ?? 0).toLocaleString("pt-BR")}`,
                valueColor: "text-emerald-700",
              },
              {
                label: "Convênios Ativos",
                value: String(statsQuery.data?.conveniosBeneficiados ?? 0),
                valueColor: "text-slate-900",
              },
              {
                label: "Doações Confirmadas",
                value: String(statsQuery.data?.doacoesConfirmadas ?? 0),
                valueColor: "text-slate-900",
              },
            ].map((stat, idx) => {
              const statIcon = STAT_ICONS[idx];
              const IconComp = statIcon.icon;
              return (
                <Card key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${statIcon.color}`}>
                        <IconComp className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{stat.label}</span>
                    </div>
                    {statsQuery.isLoading ? (
                      <Skeleton className="h-7 w-24" />
                    ) : (
                      <p className={`text-2xl font-black ${stat.valueColor}`}>{stat.value}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="mt-5 text-center text-xs text-slate-400 font-medium">
            Fase 1 — sem repasses financeiros ativos. Valores refletem doações e campanhas já cadastradas.
          </p>
        </div>

        {/* ═══ STATUS DAS CAMPANHAS ═══ */}
        <div className="bg-slate-50/60">
          <div className="max-w-6xl mx-auto px-4 lg:px-6 py-16">
            <div className="text-center mb-10 space-y-2">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                  <Megaphone className="h-4 w-4 text-blue-600" />
                </div>
                Status da Campanha
              </h2>
              <p className="text-sm text-slate-500 font-medium">Campanhas de doação em andamento e encerradas.</p>
            </div>
            {campaignsQuery.isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Skeleton className="h-32 rounded-2xl" />
                <Skeleton className="h-32 rounded-2xl" />
              </div>
            ) : (campaignsQuery.data ?? []).length === 0 ? (
              <p className="text-center text-sm text-slate-400 font-medium">Nenhuma campanha publicada ainda.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {(campaignsQuery.data ?? []).map((c) => {
                  const goal = Number(c.goal_amount ?? 0);
                  const raised = Number(c.raised_amount);
                  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
                  return (
                    <Card key={c.id} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                      <CardContent className="p-5 space-y-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">{c.title}</span>
                          <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full ${CAMPAIGN_STATUS_CLASS[c.status]}`}>
                            {CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-700 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                            <span>R$ {raised.toLocaleString("pt-BR")} arrecadado</span>
                            <span className="text-blue-600 font-bold">{pct}%</span>
                            <span>Meta: R$ {goal.toLocaleString("pt-BR")}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══ HISTÓRICO DE DOAÇÕES ═══ */}
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-16">
          <div className="text-center mb-10 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Histórico de Doações</h2>
          </div>
          <Card className="rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm">
            {donationsQuery.isLoading ? (
              <div className="p-5 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (donationsQuery.data ?? []).length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400 font-medium">Nenhuma doação confirmada ainda.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {(donationsQuery.data ?? []).map((d, idx) => (
                  <div
                    key={d.id}
                    className={`flex items-center justify-between gap-3 px-5 py-4 hover:bg-blue-50/40 transition-colors duration-200 ${
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 shrink-0">
                        <Heart className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{d.is_anonymous ? "Doador anônimo" : d.donor_name ?? "—"}</p>
                        <p className="text-xs text-slate-500">{new Date(d.created_at).toLocaleDateString("pt-BR")}</p>
                      </div>
                    </div>
                    <span className="font-black text-emerald-700 text-sm whitespace-nowrap">
                      R$ {Number(d.amount).toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ═══ PRESTAÇÃO DE CONTAS ═══ */}
        <div className="bg-slate-50/60">
          <div className="max-w-6xl mx-auto px-4 lg:px-6 py-16">
            <div className="text-center mb-10 space-y-2">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                  <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                </div>
                Prestação de Contas
              </h2>
              <p className="text-sm text-slate-500 font-medium">Relatórios publicados sobre o uso dos recursos.</p>
            </div>
            {accountabilityQuery.isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Skeleton className="h-20 rounded-2xl" />
                <Skeleton className="h-20 rounded-2xl" />
              </div>
            ) : (accountabilityQuery.data ?? []).length === 0 ? (
              <p className="text-center text-sm text-slate-400 font-medium">Nenhum relatório publicado ainda.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {(accountabilityQuery.data ?? []).map((a) => (
                  <Card key={a.id} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                    <CardContent className="p-5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 shrink-0">
                          <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{a.title}</p>
                          <p className="text-xs text-slate-500">
                            {a.published_at ? `Publicado em ${new Date(a.published_at).toLocaleDateString("pt-BR")}` : "Ainda não publicado"}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="gap-1.5 rounded-xl flex-shrink-0 border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700" disabled>
                        <ExternalLink className="h-3.5 w-3.5" /> Ver
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ FEATURE CARDS ═══ */}
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-16">
          <div className="text-center mb-10 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Áreas de Atuação</h2>
            <p className="text-sm text-slate-500 font-medium">Áreas cobertas pelo programa MedPrev.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
            {FEATURE_CARDS.map(({ icon: Icon, label, color }) => {
              const [textColor, bgColor] = color.split(" ");
              return (
                <Card
                  key={label}
                  className="border border-slate-200/80 rounded-2xl bg-white shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-blue-200 transition-all duration-300 group cursor-default"
                >
                  <CardContent className="p-5 sm:p-6 flex flex-col items-center text-center gap-3">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${bgColor} group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className={`h-6 w-6 ${textColor}`} />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-slate-800">{label}</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* ═══ ENTIDADES PARCEIRAS ═══ */}
        <div className="bg-slate-50/60">
          <div className="max-w-6xl mx-auto px-4 lg:px-6 py-16">
            <div className="text-center mb-10 space-y-2">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Entidades Parceiras</h2>
              <p className="text-sm text-slate-500 font-medium">Convênios e instituições que estarão conectadas ao MedPrev.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {PARTNER_ENTITIES.map((entity, i) => (
                <Card key={i} className="rounded-2xl border-2 border-dashed border-blue-200 bg-white hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                  <CardContent className="p-7 flex flex-col items-center text-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                      <HeartPulse className="h-7 w-7 text-blue-500" />
                    </div>
                    <span className="font-bold text-slate-800">{entity.name}</span>
                    <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{entity.type}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-10 text-center">
              <Button
                variant="outline"
                className="gap-2 rounded-2xl border-2 border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 font-bold hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200"
                disabled
              >
                <ShieldCheck className="h-4 w-4" /> Informações dos Convênios
              </Button>
            </div>
          </div>
        </div>

        {/* ═══ COMO FUNCIONA ═══ */}
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-16">
          <div className="text-center mb-10 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Como funciona</h2>
            <p className="text-sm text-slate-500 font-medium">Entenda como sua participação gera impacto social.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((item) => (
              <Card key={item.step} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
                {/* Decorative top accent */}
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-emerald-500 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
                <CardContent className="p-6 space-y-4 pt-7">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white font-black text-sm shadow-lg shadow-blue-600/20">
                    {item.step}
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ═══ INFORMAÇÕES INSTITUCIONAIS ═══ */}
        <div className="bg-slate-50/60">
          <div className="max-w-4xl mx-auto px-4 lg:px-6 py-16">
            <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
              <div className="flex">
                {/* Accent bar */}
                <div className="w-1.5 bg-gradient-to-b from-blue-500 to-emerald-500 shrink-0" />
                <CardContent className="p-7 sm:p-8 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                      <Landmark className="h-4 w-4 text-blue-600" />
                    </div>
                    <h2 className="text-lg font-black text-slate-900">Sobre o MedPrev</h2>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    O Viagg-TX8 MedPrev é o módulo institucional de Doações & Convênios da plataforma Viagg-TX8,
                    dedicado a conectar apoiadores, entidades de saúde e projetos beneficentes com total
                    transparência sobre arrecadação e destinação de recursos.
                  </p>
                </CardContent>
              </div>
            </Card>
          </div>
        </div>

        {/* ═══ PERGUNTAS FREQUENTES ═══ */}
        <div className="max-w-4xl mx-auto px-4 lg:px-6 py-16 pb-20">
          <div className="text-center mb-8 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Perguntas Frequentes</h2>
            <p className="text-sm text-slate-500 font-medium">Tire suas dúvidas sobre o módulo MedPrev.</p>
          </div>
          <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <CardContent className="p-3 sm:p-5">
              <Accordion type="single" collapsible>
                {FAQ_ITEMS.map((item, i) => (
                  <AccordionItem key={i} value={`item-${i}`} className="px-3 border-b border-slate-100 last:border-0">
                    <AccordionTrigger className="text-left font-bold text-slate-900 hover:text-blue-600 hover:no-underline transition-colors duration-200">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-slate-600 leading-relaxed pb-4">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>

        {/* ═══ RODAPÉ INTERNO (banner) ═══ */}
        <div className="w-full bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 py-7">
          <div className="max-w-6xl mx-auto px-4 lg:px-6 text-center space-y-2">
            <p className="text-white/90 text-sm font-bold tracking-wide">
              🏥 Em breve novos convênios e parcerias
            </p>
            <p className="text-white/50 text-xs font-medium uppercase tracking-widest">
              Viagg-TX8 MedPrev • Doações & Convênios
            </p>
          </div>
        </div>
      </div>
    </MarketLayout>
  );
}
