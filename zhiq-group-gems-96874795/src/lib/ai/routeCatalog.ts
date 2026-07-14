/**
 * ROUTE CATALOG — navegação inteligente da IA Viagg-TX8.
 *
 * Catálogo de páginas REAIS da plataforma (todas as rotas existem nos
 * arquivos de src/routes/). A IA usa este catálogo para:
 *  1. sugerir até 5 páginas relevantes por resposta (cards "Acessar");
 *  2. receber no contexto a descrição do que o usuário encontra em cada uma;
 *  3. NUNCA linkar área sem permissão — cada entrada declara quem pode ver.
 *
 * Extensível: nova página = nova entrada aqui. Nada muda no chat.
 */

export interface NavCtx {
  isLogged: boolean;
  role?: string | null;                 // 'admin' | ...
  activeProfile?: string | null;        // motoboy | mototaxi | driver | merchant | advertiser...
  availableProfiles?: string[];
}

export interface NavSugestao {
  icone: string;
  titulo: string;
  descricao: string;
  path: string;
}

interface CatalogEntry extends Omit<NavSugestao, 'path'> {
  id: string;
  keywords: RegExp;                     // testado sobre a pergunta normalizada
  path: string | ((ctx: NavCtx) => string);
  /** default: disponível para todos (público) */
  disponivel?: (ctx: NavCtx) => boolean;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ── helpers de permissão ── */
const logado = (ctx: NavCtx) => ctx.isLogged;
const deslogado = (ctx: NavCtx) => !ctx.isLogged;
const admin = (ctx: NavCtx) => ctx.role === 'admin';
const tem = (ctx: NavCtx, ...perfis: string[]) =>
  perfis.some(p => ctx.activeProfile === p || (ctx.availableProfiles || []).includes(p));
const ehPro = (ctx: NavCtx) => tem(ctx, 'motoboy', 'mototaxi', 'driver');

/** perfil profissional preferencial (url atual > ativo > disponível) */
const perfilPro = (ctx: NavCtx): 'motoboy' | 'mototaxi' | 'driver' => {
  if (typeof window !== 'undefined') {
    if (window.location.pathname.startsWith('/driver')) return 'driver';
    if (window.location.pathname.startsWith('/mototaxi')) return 'mototaxi';
    if (window.location.pathname.startsWith('/motoboy')) return 'motoboy';
  }
  const ordem: Array<'motoboy' | 'mototaxi' | 'driver'> = ['motoboy', 'mototaxi', 'driver'];
  if (ordem.includes(ctx.activeProfile as any)) return ctx.activeProfile as any;
  return ordem.find(p => (ctx.availableProfiles || []).includes(p)) || 'motoboy';
};

const pathCarteira = (ctx: NavCtx) => {
  if (ehPro(ctx)) return '/wallet';
  if (tem(ctx, 'merchant')) return '/merchant/financeiro';
  if (tem(ctx, 'advertiser')) return '/anunciante/carteira';
  return '/minha-carteira';
};

/* ────────────────────────── CATÁLOGO ────────────────────────── */

export const ROUTE_CATALOG: CatalogEntry[] = [
  /* ── Compras / módulos públicos ── */
  {
    id: 'mercado', icone: '🛍️', titulo: 'Mercado Local',
    descricao: 'Produtos das lojas da sua região, ofertas e categorias.',
    keywords: /(comprar|produt|mercado|ofert|categoria|carrinho|cesta|loja)/,
    path: '/mercado',
  },
  {
    id: 'busca', icone: '🔎', titulo: 'Buscar na plataforma',
    descricao: 'Pesquise produtos, imóveis, veículos, serviços, fretes e viagens.',
    keywords: /(buscar|busca\b|procur|pesquis|encontrar)/,
    path: '/mercado',
  },
  {
    id: 'imoveis', icone: '🏠', titulo: 'Imóveis',
    descricao: 'Casas, apartamentos e terrenos anunciados perto de você.',
    keywords: /(imove|casa para|apartamento|terreno|alugar|aluguel)/,
    path: '/imoveis',
  },
  {
    id: 'veiculos', icone: '🚗', titulo: 'Veículos',
    descricao: 'Carros e motos à venda na sua região.',
    keywords: /(veiculo|carro|automove|comprar moto)/,
    path: '/automoveis',
  },
  {
    id: 'servicos', icone: '🛠️', titulo: 'Serviços',
    descricao: 'Profissionais e serviços locais para o que você precisar.',
    keywords: /(servico|prestador|eletricista|encanador|pedreiro|diarista)/,
    path: '/servicos',
  },
  {
    id: 'fretes', icone: '🚚', titulo: 'Fretes & Mudanças',
    descricao: 'Fretes, carretos e mudanças com transportadores da região.',
    keywords: /(frete|mudanca|carreto|transporte de carga)/,
    path: '/fretes',
  },
  {
    id: 'viagens', icone: '✈️', titulo: 'Viagens & Turismo',
    descricao: 'Pacotes, passeios e excursões anunciados na plataforma.',
    keywords: /(viagem|viagens|passeio|turismo|excursao|pacote de viagem)/,
    path: '/viagens',
  },
  {
    id: 'leiloes', icone: '🔨', titulo: 'Leilões',
    descricao: 'Acompanhe leilões ativos e dê seus lances.',
    keywords: /(leilao|leiloes|lance|arremat)/,
    path: '/leiloes',
  },
  {
    id: 'corridas', icone: '🏍️', titulo: 'Corridas & Entregas',
    descricao: 'Peça entregas e corridas ou cadastre-se como profissional.',
    keywords: /(corrida|entrega|motoboy|moto.?taxi|motorista|trabalhar|vaga)/,
    path: '/corridas-inicio',
  },
  {
    id: 'chamar-motoboy', icone: '📦', titulo: 'Chamar um Motoboy',
    descricao: 'Solicite uma entrega rápida agora mesmo.',
    keywords: /(chamar.*motoboy|pedir entrega|enviar.*(pacote|encomenda)|entregar)/,
    path: '/chamar-motoboy',
  },
  {
    id: 'solicitar-corrida', icone: '🛵', titulo: 'Solicitar Corrida',
    descricao: 'Peça uma corrida de moto-táxi ou carro.',
    keywords: /(solicitar corrida|pedir corrida|preciso de.*corrida|me buscar)/,
    path: '/solicitar-corrida',
  },
  {
    id: 'quero-vender', icone: '🏪', titulo: 'Quero Vender',
    descricao: 'Cadastre sua loja ou empresa e anuncie na plataforma.',
    keywords: /(vender|anunciar|criar.*loja|cadastrar.*(produto|loja|empresa|servico))/,
    path: '/mercado/quero-vender',
  },

  /* ── Conta (qualquer usuário logado) ── */
  {
    id: 'minha-conta', icone: '👤', titulo: 'Minha Conta',
    descricao: 'Seus dados, perfis, acessos e configurações.',
    keywords: /(minha conta|meu perfil|meus dados|configurac|meu cadastro)/,
    path: '/minha-conta', disponivel: logado,
  },
  {
    id: 'meus-dados', icone: '📇', titulo: 'Meus Dados',
    descricao: 'Atualize nome, telefone, endereço e documentos.',
    keywords: /(meus dados|dados pessoais|endereco|telefone|atualizar cadastro)/,
    path: '/meus-dados', disponivel: logado,
  },
  {
    id: 'carteira', icone: '💰', titulo: 'Carteira',
    descricao: 'Saldo, extrato, PIX, valores pendentes e saques.',
    keywords: /(carteira|saldo|extrato|saque|sacar|pix|dinheiro|receber|transferencia)/,
    path: pathCarteira, disponivel: logado,
  },
  {
    id: 'suporte', icone: '🆘', titulo: 'Suporte',
    descricao: 'Abra um chamado e fale com a equipe Viagg-TX8.',
    keywords: /(suporte|ajuda|problema|reclama|atendimento|falar com|contato|duvida|erro)/,
    path: '/suporte', disponivel: logado,
  },
  {
    id: 'indicacoes', icone: '🎁', titulo: 'Indique Amigos',
    descricao: 'Convide amigos para a plataforma e ganhe benefícios.',
    keywords: /(indicar|indicac|convite|convidar|amigo|parceiro)/,
    path: '/refer-friends', disponivel: logado,
  },

  /* ── Visitante (não logado) ── */
  {
    id: 'login', icone: '🔑', titulo: 'Entrar ou Criar Conta',
    descricao: 'Acesse sua conta ou cadastre-se gratuitamente.',
    keywords: /(entrar|login|logar|cadastr|criar conta|minha conta|senha)/,
    path: '/auth', disponivel: deslogado,
  },
  {
    id: 'senha', icone: '🔒', titulo: 'Recuperar Senha',
    descricao: 'Redefina sua senha de acesso em poucos passos.',
    keywords: /(esqueci|recuperar senha|redefinir senha|perdi a senha)/,
    path: '/reset-password', disponivel: deslogado,
  },

  /* ── Profissionais (motoboy / moto-táxi / motorista) ── */
  {
    id: 'painel-motoboy', icone: '🏍️', titulo: 'Painel do Motoboy',
    descricao: 'Corridas disponíveis, ganhos e ferramentas de trabalho.',
    keywords: /(painel.*motoboy|area do motoboy|minhas entregas)/,
    path: '/motoboy', disponivel: (c) => tem(c, 'motoboy'),
  },
  {
    id: 'painel-motorista', icone: '🚘', titulo: 'Painel do Motorista',
    descricao: 'Chamadas, histórico e carteira do motorista.',
    keywords: /(painel.*motorista|area do motorista)/,
    path: '/driver', disponivel: (c) => tem(c, 'driver'),
  },
  {
    id: 'painel-mototaxi', icone: '🛵', titulo: 'Painel Moto-Táxi',
    descricao: 'Corridas de passageiros, histórico e carteira.',
    keywords: /(painel.*moto.?taxi|area do moto.?taxi)/,
    path: '/mototaxi', disponivel: (c) => tem(c, 'mototaxi'),
  },
  {
    id: 'ganhos-pro', icone: '📈', titulo: 'Ganhos & Comissão',
    descricao: 'Acompanhe ganhos e taxas de comissão para motoboy, moto-táxi e motorista.',
    keywords: /(ganho|ganhei|comissao|faturamento|rendimento|financeiro|taxa.*comissao)/,
    path: (c) => {
      if (c.activeProfile === 'merchant') return '/merchant/creditos';
      const pro = perfilPro(c);
      if (pro === 'driver') return '/driver/comissao';
      if (pro === 'mototaxi') return '/mototaxi/comissao';
      return '/motoboy/finance';
    },
  },
  {
    id: 'historico-pro', icone: '🗂️', titulo: 'Histórico de Corridas',
    descricao: 'Todas as suas corridas e entregas já realizadas.',
    keywords: /(historico|minhas corridas|corridas (antigas|anteriores|realizadas))/,
    path: (c) => ({ motoboy: '/motoboy/historico', mototaxi: '/mototaxi/history', driver: '/driver/history' }[perfilPro(c)]),
    disponivel: ehPro,
  },
  {
    id: 'grupos-pro', icone: '👥', titulo: 'Grupos & Engajamento',
    descricao: 'Cadastre grupos válidos, acompanhe seu engajamento e reduza sua comissão até 6%.',
    keywords: /(grupo|grupos|radar|engajamento|reduzir.*comissao)/,
    path: (c) => `/${perfilPro(c)}/grupos`,
    disponivel: ehPro,
  },
  {
    id: 'divulgacoes-pro', icone: '📣', titulo: 'Divulgações',
    descricao: 'Central de divulgações: poste anúncios e acompanhe resultados.',
    keywords: /(divulga|postagem|postar|impulsionar|campanha)/,
    path: (c) => `/${perfilPro(c)}/impulsionar/divulgacoes`,
    disponivel: ehPro,
  },
  {
    id: 'notificacoes-pro', icone: '🔔', titulo: 'Notificações',
    descricao: 'Avisos e eventos importantes da sua operação.',
    keywords: /(notificac|aviso|alerta)/,
    path: (c) => `/${perfilPro(c)}/impulsionar/notificacoes`,
    disponivel: ehPro,
  },
  {
    id: 'meu-veiculo', icone: '🏍', titulo: 'Meu Veículo',
    descricao: 'Cadastre e gerencie os dados do seu veículo de trabalho.',
    keywords: /(meu veiculo|cadastrar veiculo|documento.*(moto|carro))/,
    path: (c) => (tem(c, 'driver') ? '/driver/meu-veiculo' : '/mototaxi/meu-veiculo'),
    disponivel: (c) => tem(c, 'driver', 'mototaxi'),
  },

  /* ── Lojista (merchant) ── */
  {
    id: 'painel-lojista', icone: '🏬', titulo: 'Painel do Lojista',
    descricao: 'Visão geral da sua loja: vendas, entregas e ferramentas.',
    keywords: /(painel.*lojista|minha loja|gerenciar loja)/,
    path: '/merchant/dashboard', disponivel: (c) => tem(c, 'merchant'),
  },
  {
    id: 'pedidos-lojista', icone: '🧾', titulo: 'Pedidos da Loja',
    descricao: 'Acompanhe e gerencie os pedidos dos seus clientes.',
    keywords: /(pedido|pedidos|venda|vendas)/,
    path: '/merchant/pedidos', disponivel: (c) => tem(c, 'merchant'),
  },
  {
    id: 'creditos-lojista', icone: '💎', titulo: 'Créditos',
    descricao: 'Saldo de créditos e pacotes para impulsionar sua loja.',
    keywords: /(credito|creditos|pacote)/,
    path: '/merchant/creditos', disponivel: (c) => tem(c, 'merchant'),
  },
  {
    id: 'campanhas-lojista', icone: '📣', titulo: 'Central de Divulgações',
    descricao: 'Divulgue sua loja: 1 divulgação grátis por dia + pacotes.',
    keywords: /(divulga|campanha|promover|impulsionar|promocao)/,
    path: '/merchant/campanhas', disponivel: (c) => tem(c, 'merchant'),
  },

  /* ── Anunciante ── */
  {
    id: 'painel-anunciante', icone: '📢', titulo: 'Painel do Anunciante',
    descricao: 'Gerencie seus anúncios de imóveis, veículos e serviços.',
    keywords: /(anunciante|meus anuncios|meu anuncio)/,
    path: '/anunciante/painel', disponivel: (c) => tem(c, 'advertiser'),
  },

  /* ── Admin ── */
  {
    id: 'admin', icone: '🛡️', titulo: 'Painel Administrativo',
    descricao: 'Gestão completa da plataforma.',
    keywords: /(painel admin|administrativo|administracao|gestao da plataforma)/,
    path: '/admin', disponivel: admin,
  },
  {
    id: 'admin-financeiro', icone: '🏦', titulo: 'Financeiro (Admin)',
    descricao: 'Relatórios, carteiras e movimentações da plataforma.',
    keywords: /(financeiro|relatorio|ledger|tesouraria)/,
    path: '/admin/financeiro', disponivel: admin,
  },
];

/* ────────────────────── MOTOR DE SUGESTÃO ────────────────────── */

/**
 * Sugere até 5 páginas relevantes para a pergunta, respeitando permissões.
 * `extras` (ações vindas do Module Registry) entram primeiro e são
 * enriquecidas com ícone/descrição do catálogo quando o path coincidir.
 */
export function sugerirPaginas(
  pergunta: string,
  ctx: NavCtx,
  extras: { label: string; path: string }[] = [],
): NavSugestao[] {
  const p = norm(pergunta);
  const out: NavSugestao[] = [];
  const usados = new Set<string>();

  const resolver = (e: CatalogEntry): string =>
    typeof e.path === 'function' ? e.path(ctx) : e.path;

  for (const ex of extras) {
    if (usados.has(ex.path)) continue;
    const match = ROUTE_CATALOG.find(e => (e.disponivel?.(ctx) ?? true) && resolver(e) === ex.path);
    out.push(match
      ? { icone: match.icone, titulo: match.titulo, descricao: match.descricao, path: ex.path }
      : { icone: '➡️', titulo: ex.label, descricao: 'Abrir esta área da plataforma.', path: ex.path });
    usados.add(ex.path);
  }

  for (const e of ROUTE_CATALOG) {
    if (out.length >= 5) break;
    if (!(e.disponivel?.(ctx) ?? true)) continue;
    if (!e.keywords.test(p)) continue;
    const path = resolver(e);
    if (!path || usados.has(path)) continue;
    out.push({ icone: e.icone, titulo: e.titulo, descricao: e.descricao, path });
    usados.add(path);
  }

  return out.slice(0, 5);
}

/** Bloco de contexto para a IA explicar as páginas com naturalidade. */
export function paginasParaContexto(sugestoes: NavSugestao[]): string {
  if (!sugestoes.length) return '';
  return (
    'PÁGINAS INTERNAS RELEVANTES DO PERFIL DO USUÁRIO:\n' +
    sugestoes.map(s => `- ${s.titulo}: ${s.descricao} -> Para abrir esta tela para o usuário use a tag: [NAVIGATE:${s.path}]`).join('\n') +
    '\nINSTRUÇÃO: ao responder, mencione com naturalidade o que o usuário encontra na(s) página(s) mais importante(s) e convide-o a tocar em Acessar ou use a tag [NAVIGATE:/caminho] correspondente se ele pediu para abrir.'
  );
}
