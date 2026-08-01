/**
 * /medprev — Viagg-TX8 MedPrev (ORION-510).
 *
 * Landing page provisória: apenas estrutura visual (hero, cards, entidades
 * parceiras, como funciona, FAQ). Sem banco, RPCs, financeiro ou carteiras —
 * somente apresentação institucional do novo módulo de Convênios & Doações.
 */
import { Link } from "react-router-dom";
import {
  ChevronLeft, HeartHandshake, HandCoins, ShieldCheck, Landmark,
  Stethoscope, Hospital, ShoppingBasket, Users, HeartPulse,
} from "lucide-react";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

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
  { q: "Já existe alguma funcionalidade financeira ativa?", a: "Não. Esta é uma página provisória, somente de apresentação. Nenhum recurso de pagamento, carteira ou repasse está ativo ainda." },
  { q: "Como faço para ser um parceiro comercial?", a: "Use o botão \"Quero ser parceiro\" para registrar seu interesse. Nossa equipe entrará em contato." },
];

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
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700" />
          <div className="absolute top-0 right-0 -mt-24 -mr-24 w-[420px] h-[420px] bg-white/10 rounded-full blur-[110px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-24 -ml-24 w-[380px] h-[380px] bg-black/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 max-w-5xl mx-auto px-4 lg:px-6 py-16 md:py-24 text-center space-y-6">
            <div className="inline-flex items-center justify-center h-20 w-20 md:h-24 md:w-24 rounded-3xl overflow-hidden bg-white/10 ring-1 ring-white/30 shadow-[0_4px_10px_rgba(0,0,0,0.25)]">
              <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8 MedPrev" className="h-full w-full object-cover" />
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-none">
              Viagg-TX8 MedPrev
            </h1>
            <p className="text-white/90 text-base md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
              Transformando compras em cuidado e esperança.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                size="lg"
                className="bg-white text-emerald-700 hover:bg-white/90 font-black rounded-2xl px-8 shadow-lg"
              >
                Quero ser parceiro
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent border-2 border-white text-white hover:bg-white/10 font-black rounded-2xl px-8"
              >
                Indicar entidade
              </Button>
            </div>
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
