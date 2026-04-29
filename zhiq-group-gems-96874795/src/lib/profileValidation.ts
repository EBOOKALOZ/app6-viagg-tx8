import { supabase } from '@/integrations/supabase/client';

// Verifica se o cadastro do perfil está completo para ativação
export async function isProfileRegistrationComplete(
  userId: string, 
  profileId: string
): Promise<{ complete: boolean; missingFields: string[] }> {
  const missingFields: string[] = [];

  // Passageiro e Comerciante não exigem cadastro de veículo
  if (profileId === 'passenger') {
    return { complete: true, missingFields: [] };
  }

  if (profileId === 'merchant') {
    // Merchant é self-managed: sempre entra no painel, mesmo com loja vazia
    return { complete: true, missingFields: [] };
  }

  if (profileId === 'driver') {
    // Motorista precisa ter carro cadastrado
    const { data: driver } = await supabase
      .from('driver_profiles')
      .select('veiculo_modelo, veiculo_placa, veiculo_ano, veiculo_cor')
      .eq('user_id', userId)
      .maybeSingle();

    if (!driver?.veiculo_modelo) missingFields.push('Modelo do veículo');
    if (!driver?.veiculo_placa) missingFields.push('Placa do veículo');
    if (!driver?.veiculo_ano) missingFields.push('Ano do veículo');
    if (!driver?.veiculo_cor) missingFields.push('Cor do veículo');

    return { complete: missingFields.length === 0, missingFields };
  }

  if (profileId === 'motoboy') {
    // Motoboy precisa ter moto + capacidade de carga
    const { data: motoboy } = await supabase
      .from('motoboy_profiles')
      .select('veiculo_modelo, veiculo_placa, veiculo_ano, veiculo_cor, capacidade_bag')
      .eq('user_id', userId)
      .maybeSingle();

    if (!motoboy?.veiculo_modelo) missingFields.push('Modelo da moto');
    if (!motoboy?.veiculo_placa) missingFields.push('Placa da moto');
    if (!motoboy?.veiculo_ano) missingFields.push('Ano da moto');
    if (!motoboy?.veiculo_cor) missingFields.push('Cor da moto');
    if (!motoboy?.capacidade_bag) missingFields.push('Capacidade de bagageiro');

    return { complete: missingFields.length === 0, missingFields };
  }

  if (profileId === 'mototaxi') {
    // Moto-Táxi precisa ter moto cadastrada (sem capacidade de carga)
    const { data: motoboy } = await supabase
      .from('motoboy_profiles')
      .select('veiculo_modelo, veiculo_placa, veiculo_ano, veiculo_cor')
      .eq('user_id', userId)
      .maybeSingle();

    if (!motoboy?.veiculo_modelo) missingFields.push('Modelo da moto');
    if (!motoboy?.veiculo_placa) missingFields.push('Placa da moto');
    if (!motoboy?.veiculo_ano) missingFields.push('Ano da moto');
    if (!motoboy?.veiculo_cor) missingFields.push('Cor da moto');

    return { complete: missingFields.length === 0, missingFields };
  }

  return { complete: true, missingFields: [] };
}

// Retorna a rota de cadastro para cada perfil
export function getProfileSetupRoute(profileId: string): string {
  switch (profileId) {
    case 'driver':
      return '/profile'; // Página de perfil com dados do veículo
    case 'motoboy':
      return '/motoboy/profile'; // Mesmo layout do perfil completo
    case 'mototaxi':
      return '/mototaxi/profile'; // Mesmo layout do perfil completo
    case 'merchant':
      return '/merchant/settings'; // Configurações do comerciante
    default:
      return '/profile';
  }
}
