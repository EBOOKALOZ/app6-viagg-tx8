/**
 * /medprev — Viagg-TX8 MedPrev (ORION-510 → Comando Convênio Fase 1).
 *
 * Página pública do módulo Doações & Convênios: transparência (arrecadado,
 * destinado, histórico, status de campanhas, prestação de contas),
 * informações institucionais e link de acesso ao Super Painel do Gestor.
 * Fase 1: dados de arrecadação/histórico são estruturais/simulados —
 * nenhuma operação financeira real está ativa (ver convenio_settings).
 */
import { Link } from "react-router-dom";
import {
  ChevronLeft, HeartHandshake, HandCoins, ShieldCheck, Landmark,
  Stethoscope, Hospital, ShoppingBasket, Users, HeartPulse, FileSpreadsheet,
  Megaphone, ExternalLink,
} from "lucide-react";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  SIMULATED_DASHBOARD_STATS, SIMULATED_CAMPAIGNS, SIMULATED_DONATIONS, SIMULATED_ACCOUNTABILITY,
} from "@/lib/convenio/simulatedData";

const FEATURE_CARDS: { icon: React.ElementType; label: string }[] = [
  { icon: ShieldCheck, label: "Convênios" },
  { icon: HandCoins, label: "Doações" },
  { icon: Landmark, label: "Transparência" },
  { icon: HeartHandshake, label: "Repasses Diretos" },
  { icon: Stethoscope, label: "Clínicas" },
  { icon: Hospital, label: "Hospitais" },
  { icon: ShoppingBasket, label: "Cestas Básicas" },
  { icon: Users, label: "Projetos Sociais" },
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
  ativa: "bg-emerald-100 text-emerald-700",
  planejada: "bg-cyan-100 text-cyan-700",
  pausada: "bg-slate-200 text-slate-600",
  encerrada: "bg-slate-200 text-slate-500",
};

export default function MedPrevPage() {
  return (
    <MarketLayout
      showSearch={false}
      hideTopMotoboy
      mainClassName="flex flex-col bg-institutional-yellow"
      blueFooter
      blueFooterLabel="❤️➕ Viagg-TX8 MedPrev"
    >
      <div className="w-full">
        <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-6">
          <Link
            to="/mercado"
            className="inline-flex items-center gap-1 text-sm font-bold text-slate-700 hover:text-slate-950 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar ao Mercado
          </Link>
        </div>

        {/* ═══ HERO ═══ */}
        <div className="relative overflow-hidden mt-6">
          <div className="absolute inset-0 bg-white" />
          <div className="absolute top-0 right-0 -mt-24 -mr-24 w-[420px] h-[420px] bg-emerald-100/60 rounded-full blur-[110px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-24 -ml-24 w-[380px] h-[380px] bg-teal-100/50 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 max-w-5xl mx-auto px-4 lg:px-6 py-16 md:py-24 text-center space-y-6">
            <div className="inline-flex items-center justify-center h-20 w-20 md:h-24 md:w-24 rounded-3xl overflow-hidden bg-emerald-50 ring-1 ring-emerald-200 shadow-[0_4px_10px_rgba(0,0,0,0.08)]">
              <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8 MedPrev" className="h-full w-full object-cover" />
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none">
              <span className="text-gray-900">Viagg-TX8</span>{" "}
              <span className="text-emerald-600">MedPrev</span>
            </h1>
            <p className="text-gray-600 text-base md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
              Transformando compras em cuidado e esperança.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                size="lg"
                className="bg-emerald-600 text-white hover:bg-emerald-700 font-black rounded-2xl px-8 shadow-lg"
              >
                Quero ser parceiro
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-black rounded-2xl px-8"
              >
                Indicar entidade
              </Button>
            </div>
          </div>
        </div>

        {/* ═══ TRANSPARÊNCIA — ARRECADADO / DESTINADO ═══ */}
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-14">
          <div className="text-center mb-8 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Transparência</h2>
            <p className="text-sm text-slate-600 font-medium">Acompanhe em tempo real o impacto do MedPrev.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="rounded-2xl border-2 border-emerald-600/10">
              <CardContent className="p-5 space-y-1">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wide">Total Arrecadado</span>
                <p className="text-2xl font-black text-emerald-700">{SIMULATED_DASHBOARD_STATS.totalArrecadado}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-2 border-emerald-600/10">
              <CardContent className="p-5 space-y-1">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wide">Total Destinado</span>
                <p className="text-2xl font-black text-teal-700">{SIMULATED_DASHBOARD_STATS.totalDestinado}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-2 border-emerald-600/10">
              <CardContent className="p-5 space-y-1">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wide">Convênios Ativos</span>
                <p className="text-2xl font-black text-slate-900">{SIMULATED_DASHBOARD_STATS.conveniosAtivos}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-2 border-emerald-600/10">
              <CardContent className="p-5 space-y-1">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wide">Pessoas Beneficiadas</span>
                <p className="text-2xl font-black text-slate-900">{SIMULATED_DASHBOARD_STATS.pessoasBeneficiadas}</p>
              </CardContent>
            </Card>
          </div>
          <p className="mt-4 text-center text-xs text-slate-500 font-medium">
            Fase 1 — valores estruturais/simulados. Nenhuma operação financeira real está ativa.
          </p>
        </div>

        {/* ═══ STATUS DAS CAMPANHAS ═══ */}
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-10">
          <div className="text-center mb-8 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-2">
              <Megaphone className="h-6 w-6 text-emerald-600" /> Status da Campanha
            </h2>
            <p className="text-sm text-slate-600 font-medium">Campanhas de doação em andamento e encerradas.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SIMULATED_CAMPAIGNS.map((c) => {
              const pct = c.goal > 0 ? Math.min(100, Math.round((c.raised / c.goal) * 100)) : 0;
              return (
                <Card key={c.id} className="rounded-2xl">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-slate-900">{c.title}</span>
                      <span className={`text-[11px] font-bold uppercase px-2 py-1 rounded-full ${CAMPAIGN_STATUS_CLASS[c.status]}`}>
                        {CAMPAIGN_STATUS_LABEL[c.status]}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                      <span>R$ {c.raised.toLocaleString("pt-BR")} arrecadado</span>
                      <span>Meta: R$ {c.goal.toLocaleString("pt-BR")}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* ═══ HISTÓRICO DE DOAÇÕES ═══ */}
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-10">
          <div className="text-center mb-8 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Histórico de Doações</h2>
          </div>
          <Card className="rounded-2xl overflow-hidden">
            <div className="divide-y divide-slate-100">
              {SIMULATED_DONATIONS.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{d.donor}</p>
                    <p className="text-xs text-slate-500">{d.campaign} · {d.date}</p>
                  </div>
                  <span className="font-black text-emerald-700 text-sm whitespace-nowrap">{d.amount}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ═══ PRESTAÇÃO DE CONTAS ═══ */}
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-10">
          <div className="text-center mb-8 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-emerald-600" /> Prestação de Contas
            </h2>
            <p className="text-sm text-slate-600 font-medium">Relatórios publicados sobre o uso dos recursos.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SIMULATED_ACCOUNTABILITY.map((a) => (
              <Card key={a.id} className="rounded-2xl">
                <CardContent className="p-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{a.title}</p>
                    <p className="text-xs text-slate-500">
                      {a.status === "publicada" ? `Publicado em ${a.date}` : "Ainda não publicado"}
                    </p>
                  </div>
                  {a.status === "publicada" ? (
                    <Button size="sm" variant="outline" className="gap-1.5 rounded-xl flex-shrink-0" disabled>
                      <ExternalLink className="h-3.5 w-3.5" /> Ver
                    </Button>
                  ) : (
                    <span className="text-[11px] font-bold uppercase px-2 py-1 rounded-full bg-slate-200 text-slate-500 flex-shrink-0">
                      Em preparação
                    </span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ═══ FEATURE CARDS ═══ */}
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-14">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {FEATURE_CARDS.map(({ icon: Icon, label }) => (
              <Card
                key={label}
                className="border-2 border-emerald-600/10 rounded-2xl hover:border-emerald-600/30 hover:-translate-y-0.5 transition-all duration-200"
              >
                <CardContent className="p-4 sm:p-5 flex flex-col items-center text-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/10">
                    <Icon className="h-5 w-5 text-emerald-700" />
                  </div>
                  <span className="text-xs sm:text-sm font-black text-slate-900">✓ {label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ═══ ENTIDADES PARCEIRAS ═══ */}
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-10">
          <div className="text-center mb-8 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Entidades Parceiras</h2>
            <p className="text-sm text-slate-600 font-medium">Convênios e instituições que estarão conectadas ao MedPrev.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PARTNER_ENTITIES.map((entity, i) => (
              <Card key={i} className="rounded-2xl border-dashed border-2 border-emerald-600/20 bg-emerald-50/30">
                <CardContent className="p-6 flex flex-col items-center text-center gap-2">
                  <HeartPulse className="h-8 w-8 text-emerald-600/60" />
                  <span className="font-black text-slate-800">{entity.name}</span>
                  <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{entity.type}</span>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button
              variant="outline"
              className="gap-2 rounded-2xl border-2 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 font-black"
              disabled
            >
              <ShieldCheck className="h-4 w-4" /> Informações dos Convênios
            </Button>
          </div>
        </div>

        {/* ═══ COMO FUNCIONA ═══ */}
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-10">
          <div className="text-center mb-8 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Como funciona</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {HOW_IT_WORKS.map((item) => (
              <Card key={item.step} className="rounded-2xl">
                <CardContent className="p-6 space-y-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white font-black text-sm">
                    {item.step}
                  </div>
                  <h3 className="font-black text-slate-900">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ═══ INFORMAÇÕES INSTITUCIONAIS ═══ */}
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-10">
          <Card className="rounded-2xl">
            <CardContent className="p-6 space-y-2 text-center">
              <h2 className="text-lg font-black text-slate-900">Sobre o MedPrev</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                O Viagg-TX8 MedPrev é o módulo institucional de Doações & Convênios da plataforma Viagg-TX8,
                dedicado a conectar apoiadores, entidades de saúde e projetos beneficentes com total
                transparência sobre arrecadação e destinação de recursos.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ═══ PERGUNTAS FREQUENTES ═══ */}
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-10 pb-16">
          <div className="text-center mb-6 space-y-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Perguntas Frequentes</h2>
          </div>
          <Card className="rounded-2xl">
            <CardContent className="p-2 sm:p-4">
              <Accordion type="single" collapsible>
                {FAQ_ITEMS.map((item, i) => (
                  <AccordionItem key={i} value={`item-${i}`} className="px-3">
                    <AccordionTrigger className="text-left font-bold text-slate-900 hover:no-underline">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-slate-600 leading-relaxed">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>

        {/* ═══ RODAPÉ (mensagem) ═══ */}
        <div className="w-full bg-slate-900 py-6">
          <p className="text-center text-white/60 text-xs font-bold uppercase tracking-widest">
            Em breve novos convênios.
          </p>
        </div>
      </div>
    </MarketLayout>
  );
}
