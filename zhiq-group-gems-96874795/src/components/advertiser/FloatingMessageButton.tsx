import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import viaggLogo from "@/assets/logo.png";

export function FloatingMessageButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [show, setShow] = useState(false);
  const [targetPath, setTargetPath] = useState('');

  useEffect(() => {
    const path = location.pathname;
    let isAdvertiser = path.startsWith('/anunciante') || path.startsWith('/loja');
    let isMerchant = path.startsWith('/merchant');

    if (isAdvertiser) {
      setShow(true);
      // Detectar módulo específico para direcionar à página de mensagens correta
      if (path.startsWith('/anunciante/viagens')) {
        setTargetPath('/anunciante/viagens/mensagens');
      } else if (path.startsWith('/anunciante/imoveis')) {
        setTargetPath('/anunciante/imoveis/mensagens');
      } else if (path.startsWith('/anunciante/veiculos')) {
        setTargetPath('/anunciante/veiculos/mensagens');
      } else if (path.startsWith('/anunciante/servicos')) {
        setTargetPath('/anunciante/servicos/mensagens');
      } else if (path.startsWith('/anunciante/fretes')) {
        setTargetPath('/anunciante/fretes/mensagens');
      } else {
        setTargetPath('/anunciante/mensagens');
      }
    } else if (isMerchant) {
      setShow(true);
      setTargetPath('/merchant/mensagens');
    } else {
      setShow(false);
    }
  }, [location.pathname]);

  if (!show) return null;

  return (
    <Button
      onClick={() => navigate(targetPath)}
      size="icon"
      className="fixed bottom-24 right-6 z-50 h-14 w-14 rounded-full bg-[#FF6A00] hover:bg-[#FF7A1A] text-white shadow-lg shadow-[#FF6A00]/40 animate-pulse"
      title="Ir para Mensagens"
    >
      <MessageSquare className="h-6 w-6" />
    </Button>
  );
}
