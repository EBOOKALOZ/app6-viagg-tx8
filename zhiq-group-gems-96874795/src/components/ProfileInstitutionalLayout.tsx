import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Footer } from '@/components/Footer';
import { Car, Truck } from 'lucide-react';

// Headers by profile
import { MotoboyPanelHeader } from '@/components/motoboy/MotoboyPanelHeader';
import { MerchantPanelHeader } from '@/components/merchant/MerchantPanelHeader';
import { PanelHeader } from '@/components/PanelHeader';

/**
 * ProfileInstitutionalLayout
 * 
 * Layout para páginas institucionais que renderiza o header
 * do perfil ativo do usuário, mantendo a identidade visual
 * consistente com o painel do perfil.
 * 
 * - motoboy/mototaxi → MotoboyPanelHeader
 * - merchant → MerchantPanelHeader
 * - driver/freteiro → PanelHeader (driver style)
 * - passenger/outros → PanelHeader genérico
 * 
 * Sem bottom navigation. Footer institucional fixo.
 * O botão voltar agora está integrado no header de cada perfil.
 */
export function ProfileInstitutionalLayout() {
  const { activeProfile, avatarUrl, displayName } = useAuth();

  const renderHeader = () => {
    switch (activeProfile) {
      case 'motoboy':
      case 'mototaxi':
        return (
          <MotoboyPanelHeader
            avatarUrl={avatarUrl || undefined}
            userName={displayName || 'Usuário'}
            city="—"
            state="—"
            showBackButton={true}
          />
        );

      case 'merchant':
        return (
          <MerchantPanelHeader
            storeLogoUrl={avatarUrl || undefined}
            storeName={displayName || 'Minha Loja'}
            storeCategory="Lojista"
            fullAddress="Endereço não informado"
          />
        );

      case 'driver':
        return (
          <PanelHeader
            icon={Car}
            label="Motorista"
          />
        );

      case 'freteiro':
        return (
          <PanelHeader
            icon={Truck}
            label="Freteiro"
          />
        );

      default:
        // Fallback para passageiro ou perfil não definido
        return (
          <PanelHeader
            icon={Car}
            label="Passageiro"
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header do perfil ativo - botão voltar agora está dentro de cada header */}
      {renderHeader()}

      {/* Main Content - flex-1 garante que o footer fica no final */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Institutional Footer - sempre no final */}
      <Footer />
    </div>
  );
}
