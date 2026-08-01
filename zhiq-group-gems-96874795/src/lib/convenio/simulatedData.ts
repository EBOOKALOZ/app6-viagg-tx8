/**
 * Comando Convênio Fase 1 — dados simulados para dashboard e telas de
 * estrutura, conforme especificado ("Todos os gráficos podem utilizar dados
 * simulados nesta fase"). Nenhum valor aqui representa movimentação
 * financeira real.
 */

export const SIMULATED_DASHBOARD_STATS = {
  totalArrecadado: "R$ 128.450,00",
  totalDestinado: "R$ 96.300,00",
  conveniosAtivos: 12,
  parceiros: 27,
  instituicoesCadastradas: 18,
  campanhasAtivas: 4,
  pessoasBeneficiadas: "3.240",
};

export const SIMULATED_MONTHLY_EVOLUTION: { month: string; arrecadado: number; destinado: number }[] = [
  { month: "Mar", arrecadado: 8200, destinado: 6100 },
  { month: "Abr", arrecadado: 10400, destinado: 7800 },
  { month: "Mai", arrecadado: 14300, destinado: 10900 },
  { month: "Jun", arrecadado: 17600, destinado: 13200 },
  { month: "Jul", arrecadado: 21100, destinado: 16400 },
  { month: "Ago", arrecadado: 24500, destinado: 18900 },
];

export const SIMULATED_INDICATORS: { label: string; value: string }[] = [
  { label: "Ticket médio de doação", value: "R$ 42,00" },
  { label: "Taxa de renovação de convênios", value: "88%" },
  { label: "Tempo médio de credenciamento", value: "6 dias" },
  { label: "Satisfação das entidades parceiras", value: "4,7/5" },
];

export const SIMULATED_CAMPAIGNS = [
  { id: "1", title: "Cestas Básicas — Inverno 2026", status: "ativa", goal: 40000, raised: 27400 },
  { id: "2", title: "MedPrev Clínicas Populares", status: "ativa", goal: 60000, raised: 31200 },
  { id: "3", title: "Campanha do Agasalho", status: "encerrada", goal: 20000, raised: 20000 },
  { id: "4", title: "Projeto Saúde Itinerante", status: "planejada", goal: 35000, raised: 0 },
];

export const SIMULATED_DONATIONS = [
  { id: "1", donor: "Anônimo", amount: "R$ 50,00", campaign: "Cestas Básicas — Inverno 2026", status: "confirmada", date: "28/07/2026" },
  { id: "2", donor: "M. Andrade", amount: "R$ 120,00", campaign: "MedPrev Clínicas Populares", status: "confirmada", date: "27/07/2026" },
  { id: "3", donor: "Anônimo", amount: "R$ 30,00", campaign: "Cestas Básicas — Inverno 2026", status: "registrada", date: "26/07/2026" },
  { id: "4", donor: "R. Ferreira", amount: "R$ 200,00", campaign: "Campanha do Agasalho", status: "confirmada", date: "20/07/2026" },
];

export const SIMULATED_ENTITIES_BY_CATEGORY: Record<string, { id: string; name: string; city: string; status: string }[]> = {
  clinica: [
    { id: "1", name: "Clínica Vida Plena", city: "Cuiabá/MT", status: "ativo" },
    { id: "2", name: "Clínica Bem Estar", city: "Várzea Grande/MT", status: "em_analise" },
  ],
  laboratorio: [
    { id: "1", name: "Lab Diagnóstico Norte", city: "Cuiabá/MT", status: "ativo" },
  ],
  farmacia: [
    { id: "1", name: "Farmácia Popular Central", city: "Cuiabá/MT", status: "ativo" },
    { id: "2", name: "Farmácia Saúde & Vida", city: "Sinop/MT", status: "suspenso" },
  ],
  hospital: [
    { id: "1", name: "Hospital Regional do Norte", city: "Sinop/MT", status: "em_analise" },
  ],
  instituicao: [
    { id: "1", name: "Instituto Mão Amiga", city: "Cuiabá/MT", status: "ativo" },
  ],
  parceiro: [
    { id: "1", name: "Comércio Parceiro ABC", city: "Cuiabá/MT", status: "ativo" },
    { id: "2", name: "Distribuidora Beneficente MT", city: "Rondonópolis/MT", status: "em_analise" },
  ],
};

export const SIMULATED_AGREEMENTS = [
  { id: "1", title: "Convênio Clínica Vida Plena", status: "ativo", entity: "Clínica Vida Plena" },
  { id: "2", title: "Convênio Farmácia Popular Central", status: "ativo", entity: "Farmácia Popular Central" },
  { id: "3", title: "Convênio Hospital Regional do Norte", status: "em_aprovacao", entity: "Hospital Regional do Norte" },
  { id: "4", title: "Convênio Instituto Mão Amiga", status: "rascunho", entity: "Instituto Mão Amiga" },
];

export const SIMULATED_ACCOUNTABILITY = [
  { id: "1", title: "Prestação de Contas — Junho/2026", status: "publicada", date: "05/07/2026" },
  { id: "2", title: "Prestação de Contas — Julho/2026", status: "rascunho", date: "—" },
];

export const SIMULATED_AUDIT_LOG = [
  { id: "1", actor: "gestor@plataforma.com", action: "Aprovou convênio: Clínica Vida Plena", date: "31/07/2026 14:22" },
  { id: "2", actor: "gestor@plataforma.com", action: "Cadastrou entidade: Distribuidora Beneficente MT", date: "30/07/2026 09:10" },
  { id: "3", actor: "sistema", action: "Campanha 'Campanha do Agasalho' encerrada automaticamente", date: "20/07/2026 00:00" },
];
