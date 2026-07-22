/**
 * @deprecated Padronização do rodapé global (ORION UI 07-22): a plataforma passou
 * a ter UM rodapé único (`GlobalFooter`, azul aprovado) em TODA a navegação,
 * inclusive nos painéis logados. Este componente virou um wrapper de
 * compatibilidade — mantém a assinatura `profile` para não quebrar os
 * importadores, mas renderiza SEMPRE o rodapé global.
 *
 * Os links institucionais dinâmicos que este rodapé tinha podem, no futuro, ser
 * religados via a prop `links` do GlobalFooter (já preparada) — sem recriar
 * outro rodapé.
 */
import { GlobalFooter } from "@/components/GlobalFooter";

interface FooterProfileProps {
  profile: 'motoboy' | 'merchant' | string;
}

export function FooterProfile(_props: FooterProfileProps) {
  return <GlobalFooter />;
}

export default FooterProfile;
