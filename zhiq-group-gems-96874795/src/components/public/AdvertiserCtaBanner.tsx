import { useNavigate } from "react-router-dom";

/**
 * AdvertiserCtaBanner — bloco institucional "vire anunciante", pensado para
 * ficar NO FINAL das vitrines públicas (padrão marketplace: primeiro o usuário
 * vê os anúncios, só depois encontra a opção de anunciar).
 *
 * Extraído do bloco inline repetido em cada vitrine (PublicTravelHome/Freight/
 * Services/Vehicles/RealEstate/Mercado) para reuso e consistência. Aponta
 * sempre para /auth?entry=advertiser.
 */
export function AdvertiserCtaBanner({
  eyebrow = "Para agências e anunciantes",
  title,
  subtitle,
  buttonLabel,
  to = "/auth?entry=advertiser",
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
  to?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="w-full px-4 lg:px-6 py-8">
      <div className="max-w-4xl mx-auto bg-[#68c7f2] rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="text-white space-y-1 text-center sm:text-left">
          <p className="text-xs font-black uppercase tracking-widest text-sky-100/90">{eyebrow}</p>
          <h3 className="text-xl sm:text-2xl font-black leading-tight">{title}</h3>
          <p className="text-sm text-sky-50">{subtitle}</p>
        </div>
        <button
          onClick={() => navigate(to)}
          className="shrink-0 bg-[#F5E62B] hover:brightness-95 text-zinc-900 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-all whitespace-nowrap"
        >
          {buttonLabel} →
        </button>
      </div>
    </div>
  );
}

export default AdvertiserCtaBanner;
