import { supabase } from '@/integrations/supabase/client';

/**
 * MODULE REGISTRY — acesso da IA Viagg-TX8 aos dados REAIS da plataforma.
 *
 * Segurança por construção: TODAS as consultas usam o client Supabase com a
 * sessão do usuário autenticado → o RLS do banco garante que a IA só enxerga
 * o que o próprio usuário pode ver. Nenhuma chave privilegiada, nenhum token
 * exposto, nenhuma escrita — somente leitura + sugestão de navegação.
 *
 * Extensível: para a IA "aprender" um módulo novo, basta registrar uma nova
 * entrada em REGISTRY (keywords + fetch). Nada de reprogramação do chat.
 */

export interface AIModuleContext {
  userId: string | null;
  profile: string | null;   // motoboy | mototaxi | driver | merchant | passenger...
  cidade?: string | null;
}

export interface AIModuleResult {
  modulo: string;
  dados: string;                       // resumo textual com números reais
  acao?: { label: string; path: string }; // navegação sugerida
}

interface AIModule {
  id: string;
  titulo: string;
  /** regex sobre a pergunta do usuário (case/acento-insensível via normalizar) */
  keywords: RegExp;
  requerLogin: boolean;
  fetch: (ctx: AIModuleContext) => Promise<AIModuleResult | null>;
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const brl = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

const hojeLocal = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString();
};

/* ────────────────────────────────────────────────────────────── */

export const REGISTRY: AIModule[] = [
  {
    id: 'carteira',
    titulo: 'Carteira Digital',
    keywords: /(saldo|saque|sacar|carteira|disponivel para saque|quanto tenho)/,
    requerLogin: true,
    fetch: async () => {
      const { data } = await (supabase.from('v_wallet_overview') as any).select('*').maybeSingle();
      if (!data) return { modulo: 'Carteira', dados: 'Carteira sem movimentações ainda (saldo R$ 0,00).', acao: { label: 'Abrir carteira', path: '/wallet' } };
      return {
        modulo: 'Carteira',
        dados: `Saldo disponível para saque: ${brl(data.available_balance || 0)}. Em processamento: ${brl(data.processing_balance || 0)}. Saldo total: ${brl(data.total_balance || 0)}.`,
        acao: { label: 'Abrir carteira', path: '/wallet' },
      };
    },
  },
  {
    id: 'ganhos',
    titulo: 'Financeiro / Ganhos',
    keywords: /(ganhei|ganhos|recebi|faturei|rendimento|quanto fiz)/,
    requerLogin: true,
    fetch: async () => {
      const seteDias = new Date(Date.now() - 7 * 864e5).toISOString();
      const { data } = await (supabase.from('v_wallet_statement') as any)
        .select('amount_cents, direction, created_at')
        .gte('created_at', seteDias);
      const rows = (data || []) as any[];
      const hoje = hojeLocal();
      const soma = (arr: any[]) => arr.filter(r => r.direction === 'credit').reduce((s, r) => s + Number(r.amount_cents || 0), 0);
      const semana = soma(rows);
      const doDia = soma(rows.filter(r => r.created_at >= hoje));
      return {
        modulo: 'Financeiro',
        dados: `Ganhos hoje: ${brl(doDia)}. Ganhos nos últimos 7 dias: ${brl(semana)} (${rows.filter(r => r.direction === 'credit').length} recebimentos).`,
        acao: { label: 'Ver extrato', path: '/wallet' },
      };
    },
  },
  {
    id: 'corridas',
    titulo: 'Corridas / Entregas em andamento',
    keywords: /(corrida|entrega|pedido)s? (em andamento|andamento|hoje|abert|ativ)|quantas (corridas|entregas)/,
    requerLogin: true,
    fetch: async () => {
      const { data } = await (supabase.from('service_orders') as any)
        .select('id, status, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString())
        .limit(200);
      const rows = (data || []) as any[];
      const ativas = rows.filter(r => !['delivered', 'completed', 'canceled', 'cancelled', 'finished'].includes(String(r.status)));
      const hoje = rows.filter(r => r.created_at >= hojeLocal());
      const concluidasHoje = hoje.filter(r => ['delivered', 'completed', 'finished'].includes(String(r.status)));
      return {
        modulo: 'Corridas/Entregas',
        dados: `Em andamento agora: ${ativas.length}. Criadas hoje: ${hoje.length} (${concluidasHoje.length} concluídas hoje).`,
        acao: { label: 'Abrir corridas', path: '/corridas-inicio' },
      };
    },
  },
  {
    id: 'creditos',
    titulo: 'Créditos da plataforma',
    keywords: /(credito|creditos)/,
    requerLogin: true,
    fetch: async () => {
      const { data } = await (supabase.from('merchant_credit_balances') as any)
        .select('balance_credits, saldo, credits').maybeSingle();
      const saldo = data ? (data.balance_credits ?? data.saldo ?? data.credits ?? 0) : 0;
      return {
        modulo: 'Créditos',
        dados: data
          ? `Você possui ${saldo} créditos na carteira de créditos.`
          : 'Nenhuma carteira de créditos ativa encontrada para o seu perfil.',
      };
    },
  },
  {
    id: 'grupos',
    titulo: 'Grupos (Radar/Postador)',
    keywords: /(grupo|grupos)( cadastrad| ativ| vinculad)?/,
    requerLogin: true,
    fetch: async (ctx) => {
      const { data } = await (supabase.from('whatsapp_groups') as any)
        .select('id, is_active, validation_status, valid_for_commission')
        .eq('owner_user_id', ctx.userId);
      const rows = (data || []) as any[];
      const validos = rows.filter(r => r.valid_for_commission).length;
      return {
        modulo: 'Grupos',
        dados: `Grupos cadastrados: ${rows.length}. Ativos e válidos para comissão: ${validos}.`,
        acao: { label: 'Abrir grupos', path: '/motoboy/grupos' },
      };
    },
  },
  {
    id: 'comissao',
    titulo: 'Comissão Inteligente',
    keywords: /(comissao|taxa|percentual)/,
    requerLogin: true,
    fetch: async (ctx) => {
      const { data } = await (supabase.from('profiles') as any)
        .select('percentual_comissao_atual').eq('id', ctx.userId).maybeSingle();
      const pct = data?.percentual_comissao_atual;
      return {
        modulo: 'Comissão',
        dados: pct != null
          ? `Sua comissão atual é ${pct}%. Ela diminui conforme você mantém mais grupos ativos (mínimo 6% com 5 grupos).`
          : 'Comissão ainda não calculada para o seu perfil (escala: 25% → 6% conforme grupos ativos).',
        acao: { label: 'Ver comissão', path: '/motoboy/finance' },
      };
    },
  },
  {
    id: 'divulgacoes',
    titulo: 'Divulgações / Campanhas',
    keywords: /(divulgacao|divulgacoes|campanha|campanhas|postagem|postagens|fila)/,
    requerLogin: true,
    fetch: async (ctx) => {
      const [fila, feitas] = await Promise.all([
        (supabase.from('campaign_queue') as any)
          .select('id', { count: 'exact', head: true })
          .eq('created_by_user_id', ctx.userId)
          .not('status', 'in', '(cancelled,concluida,publicada,posted,done)'),
        (supabase.from('posting_history') as any)
          .select('id', { count: 'exact', head: true })
          .eq('operator_user_id', ctx.userId),
      ]);
      return {
        modulo: 'Divulgações',
        dados: `Suas divulgações aguardando na fila: ${fila.count ?? 0}. Postagens confirmadas por você (como profissional): ${feitas.count ?? 0}.`,
        acao: { label: 'Abrir Divulgações', path: '/motoboy/impulsionar/divulgacoes' },
      };
    },
  },
  {
    id: 'notificacoes',
    titulo: 'Notificações',
    keywords: /(notificacao|notificacoes|aviso|avisos)/,
    requerLogin: true,
    fetch: async (ctx) => {
      const { count } = await (supabase.from('user_notifications') as any)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ctx.userId).eq('is_read', false);
      return {
        modulo: 'Notificações',
        dados: `Você tem ${count ?? 0} notificação(ões) não lida(s).`,
      };
    },
  },
  {
    id: 'saques',
    titulo: 'Saques',
    keywords: /(meus saques|historico de saque|saques (pendentes|realizados))/,
    requerLogin: true,
    fetch: async () => {
      const { data } = await (supabase.from('v_wallet_payout_history') as any)
        .select('amount_cents, status, created_at')
        .order('created_at', { ascending: false }).limit(5);
      const rows = (data || []) as any[];
      if (!rows.length) return { modulo: 'Saques', dados: 'Nenhum saque solicitado até agora.', acao: { label: 'Abrir carteira', path: '/wallet' } };
      const ult = rows[0];
      return {
        modulo: 'Saques',
        dados: `Últimos saques: ${rows.length} registro(s). Mais recente: ${brl(ult.amount_cents)} (${ult.status}).`,
        acao: { label: 'Ver saques', path: '/wallet' },
      };
    },
  },
  {
    id: 'vagas',
    titulo: 'Vagas para profissionais',
    keywords: /(vaga|vagas)/,
    requerLogin: false,
    fetch: async () => ({
      modulo: 'Vagas',
      dados: 'O cadastro de profissionais (motoboy, moto-táxi e motorista) é aberto e gratuito — não há limite de vagas. O cadastro é feito direto no módulo Corridas.',
      acao: { label: 'Cadastrar-se', path: '/corridas-inicio' },
    }),
  },
  {
    id: 'mercado',
    titulo: 'Marketplace',
    keywords: /(produto|produtos|anuncio|anuncios|marketplace|mercado|loja|lojas)/,
    requerLogin: false,
    fetch: async () => {
      const [adv, re, ve] = await Promise.all([
        (supabase.from('advertiser_listings') as any).select('id', { count: 'exact', head: true }).eq('listing_status', 'active'),
        (supabase.from('real_estate_listings') as any).select('id', { count: 'exact', head: true }).eq('visibility_status', 'published'),
        (supabase.from('vehicle_listings') as any).select('id', { count: 'exact', head: true }).eq('visibility_status', 'published'),
      ]);
      return {
        modulo: 'Marketplace',
        dados: `Anúncios ativos na plataforma: ${adv.count ?? 0} produtos no Mercado, ${re.count ?? 0} imóveis e ${ve.count ?? 0} veículos publicados.`,
        acao: { label: 'Abrir Mercado', path: '/mercado' },
      };
    },
  },
];

/* ── Descoberta: casa a pergunta com os módulos registrados ── */
export function detectarModulos(pergunta: string): AIModule[] {
  const p = norm(pergunta);
  return REGISTRY.filter(m => m.keywords.test(p)).slice(0, 3);
}

/* ── Executa os módulos casados e monta o contexto REAL para a IA ── */
export async function consultarPlataforma(
  pergunta: string,
  ctx: AIModuleContext,
): Promise<{ contexto: string; acoes: { label: string; path: string }[] }> {
  const mods = detectarModulos(pergunta);
  if (!mods.length) return { contexto: '', acoes: [] };

  const resultados = await Promise.allSettled(
    mods.map(m => (m.requerLogin && !ctx.userId)
      ? Promise.resolve<AIModuleResult>({ modulo: m.titulo, dados: 'Usuário não está logado — peça para entrar na conta para ver este dado.' })
      : m.fetch(ctx)),
  );

  const linhas: string[] = [];
  const acoes: { label: string; path: string }[] = [];
  resultados.forEach(r => {
    if (r.status === 'fulfilled' && r.value) {
      linhas.push(`• [${r.value.modulo}] ${r.value.dados}`);
      if (r.value.acao) acoes.push(r.value.acao);
    }
  });

  if (!linhas.length) return { contexto: '', acoes: [] };

  const perfil = ctx.profile ? `Perfil ativo: ${ctx.profile}.` : 'Visitante (não logado).';
  const cidade = ctx.cidade ? ` Cidade: ${ctx.cidade}.` : '';
  return {
    contexto:
      `DADOS REAIS DA PLATAFORMA VIAGG-TX8 (consultados agora, já filtrados pelas permissões do usuário). ${perfil}${cidade}\n` +
      linhas.join('\n') +
      `\nINSTRUÇÃO: responda usando EXATAMENTE esses números reais. Nunca diga que não tem acesso. Não invente valores além dos fornecidos. Responda em português, curto e direto.`,
    acoes: acoes.slice(0, 2),
  };
}
