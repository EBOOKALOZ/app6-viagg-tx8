/**
 * @deprecated Use `GlobalFooter` diretamente. Mantido como wrapper de
 * compatibilidade para os importadores existentes — NÃO tem markup próprio,
 * apenas repassa para o rodapé global único (zero duplicação).
 */
import { GlobalFooter } from "@/components/GlobalFooter";

interface FooterNeutralProps {
  light?: boolean;
  compact?: boolean;
  label?: string;
}

export function FooterNeutral({ compact = false, label = "Mercado Local" }: FooterNeutralProps) {
  return <GlobalFooter label={label} compact={compact} />;
}

export default FooterNeutral;
