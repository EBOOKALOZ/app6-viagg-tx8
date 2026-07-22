/**
 * @deprecated Padronização do rodapé global (ORION UI 07-22): a plataforma passou
 * a ter UM rodapé único (`GlobalFooter`, azul aprovado) em TODA a navegação.
 * Este componente virou wrapper de compatibilidade — mantém o nome/assinatura
 * usados por `MotoboyLayout`, mas renderiza SEMPRE o rodapé global.
 *
 * Os links institucionais dinâmicos do motoboy podem, no futuro, ser religados
 * via a prop `links` do GlobalFooter (já preparada) — sem recriar outro rodapé.
 */
import { GlobalFooter } from "@/components/GlobalFooter";

export function MotoboyFooter() {
  return <GlobalFooter label="Motoboy" />;
}

export default MotoboyFooter;
