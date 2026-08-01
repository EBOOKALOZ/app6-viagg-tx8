import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Play, ArrowRight } from "lucide-react";
import { InstitutionalBlock } from "@/components/legal/InstitutionalBlock";
import { WeatherCard } from "@/components/landing/WeatherCard";
import { DollarCard } from "@/components/landing/DollarCard";
import { RealtimeExchangeCard } from "@/components/dashboard/RealtimeExchangeCard";
import { ProfileVideoModal } from "@/components/landing/ProfileVideoModal";
import { TrustSection } from "@/components/landing/TrustSection";
import { PublicFooter } from "@/components/PublicFooter";
import { ComplianceBadge } from "@/components/compliance/ComplianceBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import motoboyHero from "@/assets/motoboy-hero.png";
import comercianteHero from "@/assets/comerciante-hero.png";
import passageiroHero from "@/assets/passageiro-hero.png";
import vendaAnuncioHero from "@/assets/venda-anuncio-hero.png";
import institutionalLogo from "@/assets/viagg-institutional-logo.png";
const MOTOBOY_VIDEO_URL = "https://jifnpjnffhzosxrdhvxb.supabase.co/storage/v1/object/public/marketing-media-motoboy/LANDPAGE%20-Motoboy.mp4";
const LOJISTA_VIDEO_URL = "https://jifnpjnffhzosxrdhvxb.supabase.co/storage/v1/object/public/marketing-media-lojista/LANDPAGE%20-Lojista.mp4";
const PASSAGEIRO_VIDEO_URL = "https://jifnpjnffhzosxrdhvxb.supabase.co/storage/v1/object/public/passageiro-em-breve/LANDPAGE-BREVE%20PASSAGEIRO.mp4";

const PLAY_STORE_URL: string | null = null;
const APP_STORE_URL: string | null = null;

type CardModal = "motoboy" | "lojista" | "passageiro" | null;

export default function PublicHome() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [showAppModal, setShowAppModal] = useState(false);
  const [activeCard, setActiveCard] = useState<CardModal>(null);

  // Auto-redirect authenticated users
  /* 
  useEffect(() => {
    if (isLoading) return;
    if (user) {
      navigate("/redirect-by-profile", { replace: true });
    }
  }, [user, isLoading, navigate]);
  */

  const handleDownloadApp = () => {
    if (!PLAY_STORE_URL && !APP_STORE_URL) {
      setShowAppModal(true);
      return;
    }
    const ua = navigator.userAgent;
    const isAndroid = /android/i.test(ua);
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    if (isIOS && APP_STORE_URL) window.open(APP_STORE_URL, "_blank");
    else if (PLAY_STORE_URL) window.open(PLAY_STORE_URL, "_blank");
    else setShowAppModal(true);
  };

  return (
    <div className="flex flex-col bg-black">
      {/* Header */}
      <header className="absolute top-0 left-0 w-full z-20 px-8 py-6 flex items-center justify-between bg-transparent">
        <img src={institutionalLogo} alt="Viagg-TX8" className="h-12 w-auto object-contain" />
        <Button
          size="default"
          variant="outline"
          className="rounded-full border-white/60 text-white bg-white/10 hover:bg-white/20 font-semibold px-6 backdrop-blur-sm"
          onClick={() => navigate("/select-profile")}
        >
          Entrar
        </Button>
      </header>

      {/* Hero */}
      <section className="pt-24 pb-16 text-center relative bg-black">
        <div className="container max-w-3xl mx-auto px-6 space-y-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-white">
            Mobilidade inteligente para sua cidade
          </h1>
          <p className="text-white/90 text-lg leading-relaxed">
            Conectamos motoboys e comerciantes em uma plataforma que
            fortalece economias locais.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button
              size="lg"
              className="text-white font-semibold shadow-md transition-all duration-200 hover:shadow-lg"
              style={{ backgroundColor: "#FF7A00" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#E56E00")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#FF7A00")}
              onClick={() => navigate("/select-profile")}
            >
              Entrar na plataforma
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white text-white bg-transparent hover:bg-white/10 transition-all duration-200"
              onClick={handleDownloadApp}
            >
              Baixar o App
            </Button>
          </div>
          <p className="text-xs text-white/80 mt-2 tracking-wide">
            Disponível em breve para iOS e Android
          </p>
        </div>
      </section>

      {/* Info cards — weather + tempo real (cotações) + USD/BRL */}
      <section className="py-8 px-4 bg-black">
        <div className="container max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <WeatherCard />
          <RealtimeExchangeCard />
          <DollarCard />
        </div>
      </section>

      {/* City image */}
      <section className="relative h-[60vh] w-full overflow-visible">
        <img
          src="/images/cidade-sunset.jpg"
          alt="Cidade urbana moderna"
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-black/40" />
      </section>

      {/* Profile Cards */}
      <div className="relative z-40 -mt-64 px-4 pb-0 bg-transparent">
        <div className="container max-w-5xl mx-auto flex flex-col gap-12">
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {/* Motoboy */}
            <button
              type="button"
              onClick={() => setActiveCard("motoboy")}
              className="flex flex-col rounded-xl bg-white/80 backdrop-blur-md shadow-xl shadow-black/10 border border-white/30 overflow-hidden transition-all duration-200 hover:shadow-2xl hover:-translate-y-1 hover:ring-2 hover:ring-orange-400/50 cursor-pointer text-left"
            >
              <div className="relative overflow-hidden rounded-t-xl h-[220px] shrink-0">
                <img src={motoboyHero} alt="Motoboy na plataforma Viagg" className="w-full h-full object-cover object-top" loading="lazy" width={400} height={300} />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <Play className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
              </div>
              <div className="p-5 space-y-1 text-center flex-1 flex flex-col justify-center">
                <h3 className="text-lg font-semibold text-foreground">Motoboy</h3>
                <p className="text-sm text-muted-foreground">Entregas rápidas com comissão justa</p>
                <p className="text-xs text-orange-600 font-medium mt-1 flex items-center justify-center gap-1">
                  <Play className="h-3 w-3" /> Clique para ver
                </p>
              </div>
            </button>

            {/* Lojista */}
            <button
              type="button"
              onClick={() => setActiveCard("lojista")}
              className="flex flex-col rounded-xl bg-white/80 backdrop-blur-md shadow-xl shadow-black/10 border border-white/30 overflow-hidden transition-all duration-200 hover:shadow-2xl hover:-translate-y-1 hover:ring-2 hover:ring-orange-400/50 cursor-pointer text-left"
            >
              <div className="relative overflow-hidden rounded-t-xl h-[220px] shrink-0">
                <img src={comercianteHero} alt="Lojista na plataforma Viagg" className="w-full h-full object-cover object-top" loading="lazy" width={400} height={300} />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <Play className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
              </div>
              <div className="p-5 space-y-1 text-center flex-1 flex flex-col justify-center">
                <h3 className="text-lg font-semibold text-foreground">Lojista</h3>
                <p className="text-sm text-muted-foreground">Delivery integrado para sua loja</p>
                <p className="text-xs text-orange-600 font-medium mt-1 flex items-center justify-center gap-1">
                  <Play className="h-3 w-3" /> Clique para ver
                </p>
              </div>
            </button>

            {/* Passageiro — EM BREVE */}
            <button
              type="button"
              onClick={() => setActiveCard("passageiro")}
              className="relative flex flex-col rounded-xl bg-white/80 backdrop-blur-md shadow-xl shadow-black/10 border border-white/30 overflow-hidden opacity-90 cursor-pointer transition-all duration-200 hover:opacity-100 hover:shadow-2xl text-left"
            >
              <span
                className="absolute top-3 right-3 z-20 px-3 py-0.5 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: "#F97316" }}
              >
                EM BREVE
              </span>
              <div className="relative overflow-hidden rounded-t-xl h-[220px] shrink-0">
                <img src={passageiroHero} alt="Passageiro na plataforma Viagg" className="w-full h-full object-cover object-top" loading="lazy" width={400} height={300} />
              </div>
              <div className="p-5 space-y-1 text-center flex-1 flex flex-col justify-center">
                <h3 className="text-lg font-semibold text-foreground">Passageiro</h3>
                <p className="text-sm text-muted-foreground">Viagens seguras e acessíveis</p>
              </div>
            </button>

            {/* Quero Vender — OCULTO TEMPORARIAMENTE */}
            {/* <button
              type="button"
              onClick={() => navigate("/mercado/quero-vender")}
              className="group relative flex flex-col rounded-xl bg-black border border-white/5 overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_10px_40px_rgba(123,63,228,0.15)] hover:scale-[1.02] text-left h-full"
            >
              <div className="relative overflow-hidden rounded-t-xl h-[220px] shrink-0">
                <img src={vendaAnuncioHero} alt="Quero Vender na plataforma Viagg" className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-110" loading="lazy" width={400} height={300} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              </div>
              <div className="p-6 space-y-3 text-center flex-1 flex flex-col justify-center bg-[#0A0A0A]">
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-[#B06CFF] tracking-tight">Quero Vender</h3>
                  <p className="text-xs text-white/85 leading-relaxed px-2 font-medium">Anuncie seus produtos ou imóveis na plataforma</p>
                </div>
                <div className="pt-2">
                   <div 
                     className="inline-block text-white text-[10px] font-bold uppercase tracking-[0.2em] py-2.5 px-6 rounded-full shadow-lg transition-all duration-300 group-hover:scale-105 active:scale-95"
                     style={{ background: 'linear-gradient(135deg, #7B3FE4, #B06CFF)' }}
                   >
                      ANUNCIANTE
                   </div>
                </div>
              </div>
            </button> */}

          </section>
        </div>
      </div>

      {/* Trust & payments */}
      <TrustSection />

      {/* Institutional content */}
      <div
        className="relative bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/cidade-institucional.png')" }}
      >
        <div className="absolute inset-0 bg-[#0B3D2E]/70" />
        <div className="relative z-10 py-4 px-4">
          <div className="container max-w-4xl mx-auto">
            <InstitutionalBlock />
            <div className="mt-3 flex justify-center">
              <ComplianceBadge variant="dark" size="sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Video Modals */}
      <ProfileVideoModal
        open={activeCard === "motoboy"}
        onOpenChange={(v) => !v && setActiveCard(null)}
        title="Motoboy Viagg"
        videoSrc={MOTOBOY_VIDEO_URL}
        ctaLabel="Entrar como Motoboy"
        ctaAction={() => navigate("/select-profile")}
        videoFit="contain"
      />
      <ProfileVideoModal
        open={activeCard === "lojista"}
        onOpenChange={(v) => !v && setActiveCard(null)}
        title="Lojista Viagg"
        videoSrc={LOJISTA_VIDEO_URL}
        ctaLabel="Entrar como Lojista"
        ctaAction={() => navigate("/select-profile")}
        videoFit="contain"
      />
      <ProfileVideoModal
        open={activeCard === "passageiro"}
        onOpenChange={(v) => !v && setActiveCard(null)}
        title="Passageiro — Em breve"
        videoSrc={PASSAGEIRO_VIDEO_URL}
        ctaLabel="Fechar"
        ctaAction={() => setActiveCard(null)}
        comingSoon
      />

      {/* Download modal */}
      <Dialog open={showAppModal} onOpenChange={setShowAppModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Baixar o App</DialogTitle>
            <DialogDescription className="pt-2 leading-relaxed">
              O Viagg-TX8 estará disponível em breve na App Store e Google Play.
              Cadastre-se para ser avisado no lançamento oficial.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowAppModal(false)}>Fechar</Button>
            <Button
              className="text-white font-semibold"
              style={{ backgroundColor: "#F97316" }}
              onClick={() => setShowAppModal(false)}
            >
              Quero ser avisado
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer institucional */}
      <PublicFooter />
    </div>
  );
}
