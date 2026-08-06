/**
 * /admin/orion-local-test-lab — ORION LOCAL TEST LAB (OLT) v2.0
 *
 * Fila de execução de diagnósticos reais do Super Painel, organizada
 * em 15 categorias (Build → Auditoria Final). Cada etapa executa uma
 * verificação real e somente leitura direto do navegador da sessão
 * logada: leituras de banco, probes de RLS com client anônimo, RPCs,
 * latências medidas e conectividade Realtime. Etapas que só existem
 * na CLI (TypeScript/ESLint) aparecem marcadas como CLI com o comando
 * exato — nunca como aprovadas. Nada é simulado: o que o ambiente não
 * responder aparece como FAIL com o erro real.
 *
 * v2.0 (aditivo, sem alterar a lógica dos diagnósticos):
 * cronômetro real da homologação, tempo por categoria, filtros da fila,
 * histórico local (20 execuções) com comparador, exportações JSON/MD/PDF,
 * evidências técnicas por etapa, estatísticas, dashboard de saúde,
 * detector de gargalos, agrupamento de falhas, relatório executivo e
 * pontos de extensão da Auditoria Contínua (src/lib/qa/oltExtensions.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  supabase,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
} from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  OLT_VERSION,
  calcularGargalo,
  contarStatus,
  formatarDuracao,
  formatarSegundos,
  type DefCategoria,
  type EtapaStatus,
  type EvidenciaTecnica,
  type ExecucaoOLT,
  type ResultadoEtapa,
} from "@/lib/qa/oltTypes";
import {
  calcularEstatisticas,
  carregarHistorico,
  compararExecucoes,
  salvarExecucao,
} from "@/lib/qa/oltHistory";
import { agruparFalhas, gerarRelatorioExecutivo } from "@/lib/qa/oltReport";
import { exportarOltJson, exportarOltMarkdown, exportarOltPdf } from "@/lib/qa/oltExport";
import { oltExtensions } from "@/lib/qa/oltExtensions";
import {
  FlaskConical,
  PlayCircle,
  PauseCircle,
  StepForward,
  Ban,
  RotateCcw,
  Loader2,
  CheckCircle2,
  CheckSquare,
  Square,
  XCircle,
  MinusCircle,
  Terminal,
  ChevronDown,
  ChevronRight,
  Hammer,
  Braces,
  ClipboardList,
  Database,
  Lock,
  Plug,
  Monitor,
  Store,
  HeartHandshake,
  Gavel,
  Wallet,
  ShieldCheck,
  Gauge,
  ClipboardCheck,
  Timer,
  Activity,
  History,
  BarChart3,
  AlertTriangle,
  RefreshCw,
  FileJson,
  FileText,
  FileDown,
  Filter,
  ArrowLeftRight,
} from "lucide-react";

/* ── Tipos locais ── */

interface Etapa {
  id: string;
  nome: string;
  /** Diagnóstico real executável no navegador (somente leitura). */
  run?: () => Promise<string>;
  /** Etapa que só roda na CLI — exibe o comando, nunca aprova sozinha. */
  cli?: string;
  /** Tempo esperado (ms) — base do detector de gargalos. */
  esperadoMs?: number;
  /** Sonda RLS anônima — considerada no relatório executivo. */
  rlsProbe?: boolean;
}

interface Categoria {
  id: string;
  nome: string;
  icon: React.ElementType;
  etapas: Etapa[];
}

type EstadoFila = "idle" | "executando" | "pausada" | "concluida" | "cancelada";

type FiltroFila = "todos" | "pass" | "fail" | "cli" | "executando" | "pendente";

const FILTROS: Array<{ id: FiltroFila; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "pass", label: "PASS" },
  { id: "fail", label: "FAIL" },
  { id: "cli", label: "CLI" },
  { id: "executando", label: "Executando" },
  { id: "pendente", label: "Pendentes" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── Coletor de evidências técnicas ──
 * Preenchido apenas enquanto uma etapa está em execução (fila sequencial).
 * Fora disso, evid() é no-op — os helpers podem ser reutilizados livremente. */
let coletorEvidencias: EvidenciaTecnica[] | null = null;
const evid = (e: Omit<EvidenciaTecnica, "ts">) => {
  coletorEvidencias?.push({ ...e, ts: new Date().toISOString() });
};

/* ── Client anônimo (probes de RLS) — nunca persiste/rouba a sessão logada ── */
let _anon: SupabaseClient | null = null;
const anon = () => {
  if (!_anon) {
    _anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _anon;
};

/* ── Acesso dinâmico a tabelas/RPCs fora dos types gerados ── */
interface RespostaContagem {
  count: number | null;
  error: { message: string; code?: string } | null;
}
interface RespostaRpc {
  data: unknown;
  error: { message: string } | null;
}
const contarDinamico = (tabela: string) =>
  (
    supabase.from as unknown as (t: string) => {
      select: (c: string, o: { count: "exact"; head: boolean }) => PromiseLike<RespostaContagem>;
    }
  )(tabela).select("*", { count: "exact", head: true });
const rpcDinamica = (fn: string, args?: Record<string, unknown>) =>
  (
    supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => PromiseLike<RespostaRpc>
  )(fn, args);

/* ── Helpers de diagnóstico (todos somente leitura) ── */

const contar = async (tabela: string) => {
  const t0 = performance.now();
  const { count, error } = await contarDinamico(tabela);
  const ms = Math.round(performance.now() - t0);
  evid({
    tipo: "consulta",
    operacao: "SELECT count(*) (head) via PostgREST — sessão autenticada",
    alvo: tabela,
    resultado: error ? undefined : `${count ?? 0} registros visíveis`,
    erro: error?.message,
    ms,
  });
  if (error) throw new Error(error.message);
  return `${count ?? 0} registros visíveis para esta sessão`;
};

const probeAnon = async (tabela: string) => {
  const t0 = performance.now();
  const { data, error } = await anon().from(tabela).select("*").limit(1);
  const ms = Math.round(performance.now() - t0);
  const operacao = "SELECT * LIMIT 1 com client anônimo (sem sessão)";
  if (error) {
    evid({
      tipo: "rls",
      operacao,
      alvo: tabela,
      resultado: `Acesso negado (${error.code ?? error.message})`,
      ms,
    });
    return `Acesso anônimo negado (${error.code ?? error.message})`;
  }
  if (!data || data.length === 0) {
    evid({ tipo: "rls", operacao, alvo: tabela, resultado: "0 linhas retornadas ao anônimo", ms });
    return "0 linhas visíveis ao anônimo (RLS bloqueando ou tabela vazia)";
  }
  evid({
    tipo: "rls",
    operacao,
    alvo: tabela,
    erro: `VAZAMENTO: ${data.length} linha(s) legível(is) sem autenticação`,
    ms,
  });
  throw new Error(`VAZAMENTO: client anônimo leu ${data.length} linha(s) de ${tabela}`);
};

const latencia = async (nome: string, fn: () => Promise<void>, limiteMs: number) => {
  const t0 = performance.now();
  try {
    await fn();
  } catch (e) {
    evid({
      tipo: "latencia",
      operacao: `Medição de latência — ${nome}`,
      erro: e instanceof Error ? e.message : String(e),
      ms: Math.round(performance.now() - t0),
    });
    throw e;
  }
  const ms = Math.round(performance.now() - t0);
  evid({
    tipo: "latencia",
    operacao: `Medição de latência — ${nome}`,
    resultado: `${ms} ms (limite ${limiteMs} ms)`,
    ms,
  });
  if (ms > limiteMs) throw new Error(`${nome}: ${ms} ms excede o limite de ${limiteMs} ms`);
  return `${nome}: ${ms} ms (limite ${limiteMs} ms)`;
};

const testRealtime = () =>
  new Promise<string>((resolve, reject) => {
    const nomeCanal = `olt-diag-${crypto.randomUUID()}`;
    const ch = supabase.channel(nomeCanal);
    const t0 = performance.now();
    const registrar = (ok: boolean, msg: string) => {
      const ms = Math.round(performance.now() - t0);
      evid({
        tipo: "realtime",
        operacao: "Assinatura de canal WebSocket (supabase.channel)",
        alvo: nomeCanal,
        resultado: ok ? msg : undefined,
        erro: ok ? undefined : msg,
        ms,
      });
    };
    const timer = setTimeout(() => {
      supabase.removeChannel(ch);
      registrar(false, "Timeout de 6s ao conectar o canal Realtime");
      reject(new Error("Timeout de 6s ao conectar o canal Realtime"));
    }, 6000);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        supabase.removeChannel(ch);
        registrar(true, "SUBSCRIBED");
        resolve("Canal WebSocket conectado (SUBSCRIBED)");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        supabase.removeChannel(ch);
        registrar(false, `Status do canal: ${status}`);
        reject(new Error(`Status do canal: ${status}`));
      }
    });
  });

/* ── Dashboard de Saúde — verificações reais e leves ── */

type EstadoSaude = "desconhecido" | "verificando" | "verde" | "amarelo" | "vermelho";

interface ResultadoSaude {
  estado: "verde" | "amarelo" | "vermelho";
  detalhe: string;
  ms?: number;
}

interface IndicadorSaude {
  id: string;
  nome: string;
  estado: EstadoSaude;
  detalhe?: string;
  ms?: number;
}

const nivelLatencia = (ms: number, verdeAteMs: number): "verde" | "amarelo" =>
  ms <= verdeAteMs ? "verde" : "amarelo";

const CHECKS_SAUDE: Array<{ id: string; nome: string; run: () => Promise<ResultadoSaude> }> = [
  {
    id: "banco",
    nome: "Banco",
    run: async () => {
      const t0 = performance.now();
      const { error } = await supabase.from("profiles").select("id", { count: "exact", head: true });
      const ms = Math.round(performance.now() - t0);
      if (error) return { estado: "vermelho", detalhe: error.message, ms };
      return { estado: nivelLatencia(ms, 1200), detalhe: `SELECT head em profiles — ${ms} ms`, ms };
    },
  },
  {
    id: "api",
    nome: "API",
    run: async () => {
      const t0 = performance.now();
      const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      const ms = Math.round(performance.now() - t0);
      if (!res.ok) return { estado: "vermelho", detalhe: `HTTP ${res.status} em /auth/v1/health`, ms };
      return { estado: nivelLatencia(ms, 1500), detalhe: `/auth/v1/health HTTP ${res.status} — ${ms} ms`, ms };
    },
  },
  {
    id: "realtime",
    nome: "Realtime",
    run: () =>
      new Promise<ResultadoSaude>((resolve) => {
        const ch = supabase.channel(`olt-saude-${crypto.randomUUID()}`);
        const t0 = performance.now();
        const timer = setTimeout(() => {
          supabase.removeChannel(ch);
          resolve({ estado: "vermelho", detalhe: "Timeout de 6s ao conectar o canal" });
        }, 6000);
        ch.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timer);
            supabase.removeChannel(ch);
            const ms = Math.round(performance.now() - t0);
            resolve({
              estado: ms <= 3000 ? "verde" : "amarelo",
              detalhe: `SUBSCRIBED — ${ms} ms`,
              ms,
            });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timer);
            supabase.removeChannel(ch);
            resolve({ estado: "vermelho", detalhe: `Status do canal: ${status}` });
          }
        });
      }),
  },
  {
    id: "storage",
    nome: "Storage",
    run: async () => {
      const t0 = performance.now();
      const { data, error } = await supabase.storage.listBuckets();
      const ms = Math.round(performance.now() - t0);
      if (error) {
        const falhaRede = /fetch|network|conex/i.test(error.message);
        return { estado: falhaRede ? "vermelho" : "amarelo", detalhe: `listBuckets: ${error.message}`, ms };
      }
      return {
        estado: nivelLatencia(ms, 1500),
        detalhe: `Storage API respondeu — ${data?.length ?? 0} bucket(s) visível(is), ${ms} ms`,
        ms,
      };
    },
  },
  {
    id: "rpc",
    nome: "RPC",
    run: async () => {
      const t0 = performance.now();
      const { error } = await rpcDinamica("is_admin");
      const ms = Math.round(performance.now() - t0);
      if (error) return { estado: "vermelho", detalhe: `is_admin: ${error.message}`, ms };
      return { estado: nivelLatencia(ms, 1500), detalhe: `RPC is_admin — ${ms} ms`, ms };
    },
  },
  {
    id: "auth",
    nome: "Auth",
    run: async () => {
      const t0 = performance.now();
      const { data, error } = await supabase.auth.getUser();
      const ms = Math.round(performance.now() - t0);
      if (error) return { estado: "vermelho", detalhe: error.message, ms };
      if (!data.user) return { estado: "vermelho", detalhe: "Servidor não reconheceu o token", ms };
      return { estado: nivelLatencia(ms, 1500), detalhe: `Token validado no servidor — ${ms} ms`, ms };
    },
  },
  {
    id: "rls",
    nome: "RLS",
    run: async () => {
      const t0 = performance.now();
      const { data, error } = await anon().from("user_roles").select("*").limit(1);
      const ms = Math.round(performance.now() - t0);
      if (error)
        return {
          estado: "verde",
          detalhe: `Anônimo negado em user_roles (${error.code ?? error.message})`,
          ms,
        };
      if (!data || data.length === 0)
        return { estado: "verde", detalhe: "0 linhas ao anônimo em user_roles", ms };
      return {
        estado: "vermelho",
        detalhe: `VAZAMENTO: anônimo leu ${data.length} linha(s) de user_roles`,
        ms,
      };
    },
  },
];

const SAUDE_DOT: Record<EstadoSaude, string> = {
  desconhecido: "bg-zinc-300",
  verificando: "bg-sky-500 animate-pulse",
  verde: "bg-emerald-500",
  amarelo: "bg-amber-500",
  vermelho: "bg-red-500",
};

/* ── UI de status ── */

const ETAPA_UI: Record<EtapaStatus, { icon: React.ElementType; cls: string; label: string }> = {
  pendente: { icon: Square, cls: "text-zinc-400", label: "Pendente" },
  executando: { icon: Loader2, cls: "text-sky-500 animate-spin", label: "Executando" },
  pass: { icon: CheckCircle2, cls: "text-emerald-600", label: "PASS" },
  fail: { icon: XCircle, cls: "text-red-600", label: "FAIL" },
  cli: { icon: Terminal, cls: "text-amber-600", label: "CLI" },
};

const EVIDENCIA_TIPO_LABEL: Record<EvidenciaTecnica["tipo"], string> = {
  consulta: "Consulta SQL",
  rls: "Sonda RLS",
  rpc: "RPC",
  http: "HTTP",
  auth: "Auth",
  realtime: "Realtime",
  browser: "Navegador",
  latencia: "Latência",
  cli: "CLI",
  consolidacao: "Consolidação",
};

export default function AdminOrionLocalTestLab() {
  const { user, isAdmin } = useAuth();
  const [resultados, setResultados] = useState<Record<string, ResultadoEtapa>>({});
  const [estado, setEstado] = useState<EstadoFila>("idle");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [evidenciasAbertas, setEvidenciasAbertas] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<FiltroFila>("todos");
  const [historico, setHistorico] = useState<ExecucaoOLT[]>([]);
  const [execucaoAtual, setExecucaoAtual] = useState<ExecucaoOLT | null>(null);
  const [histAbertas, setHistAbertas] = useState<Set<string>>(new Set());
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [versaoSistema, setVersaoSistema] = useState<string>("carregando…");
  const [inicioExec, setInicioExec] = useState<number | null>(null);
  const [cronometroMs, setCronometroMs] = useState<number | null>(null);
  const [saude, setSaude] = useState<Record<string, IndicadorSaude>>(() =>
    Object.fromEntries(
      CHECKS_SAUDE.map((c) => [c.id, { id: c.id, nome: c.nome, estado: "desconhecido" as EstadoSaude }])
    )
  );
  const [saudeTs, setSaudeTs] = useState<string | null>(null);
  const [saudeVerificando, setSaudeVerificando] = useState(false);
  const [gateAviso, setGateAviso] = useState<string | null>(null);
  const resultadosRef = useRef<Record<string, ResultadoEtapa>>({});
  const controlRef = useRef({ pause: false, cancel: false });
  const saudeRodandoRef = useRef(false);
  const versaoRef = useRef("carregando…");

  const setRes = (id: string, r: ResultadoEtapa) => {
    resultadosRef.current = { ...resultadosRef.current, [id]: r };
    setResultados(resultadosRef.current);
  };

  /* ── Definição da fila: 15 categorias (diagnósticos inalterados) ── */
  const categorias: Categoria[] = useMemo(
    () => [
      {
        id: "build",
        nome: "Build",
        icon: Hammer,
        etapas: [
          {
            id: "build-1",
            nome: "Bundle ativo no navegador",
            esperadoMs: 250,
            run: async () => {
              if (!import.meta.env) throw new Error("import.meta.env indisponível");
              evid({
                tipo: "browser",
                operacao: "Leitura de import.meta.env no bundle em execução",
                resultado: `MODE=${import.meta.env.MODE}`,
              });
              return `Bundle em execução — modo ${import.meta.env.MODE}`;
            },
          },
          {
            id: "build-2",
            nome: "Servidor de assets responde",
            esperadoMs: 1500,
            run: async () => {
              const t0 = performance.now();
              const res = await fetch(window.location.origin + "/", { method: "HEAD", cache: "no-store" });
              evid({
                tipo: "http",
                operacao: "HEAD na origem que serve o bundle",
                alvo: window.location.origin + "/",
                httpStatus: res.status,
                ms: Math.round(performance.now() - t0),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status} ao consultar a origem`);
              return `Origem ${window.location.origin} respondeu HTTP ${res.status}`;
            },
          },
          {
            id: "build-3",
            nome: "Resolução de módulo compilado",
            esperadoMs: 500,
            run: async () => {
              const mod = await import("@/lib/utils");
              if (typeof mod.cn !== "function") throw new Error("Módulo carregou sem export esperado");
              evid({
                tipo: "browser",
                operacao: "import() dinâmico de @/lib/utils",
                resultado: "export cn presente e é função",
              });
              return "import() dinâmico de @/lib/utils resolveu";
            },
          },
          {
            id: "build-4",
            nome: "Registry público de módulos",
            esperadoMs: 1500,
            run: async () => {
              const t0 = performance.now();
              const res = await fetch("/api/modules.json", { cache: "no-store" });
              const ms = Math.round(performance.now() - t0);
              if (!res.ok) {
                evid({ tipo: "http", operacao: "GET /api/modules.json", alvo: "/api/modules.json", httpStatus: res.status, ms });
                throw new Error(`HTTP ${res.status} em /api/modules.json`);
              }
              const json = await res.json();
              const qtd = Array.isArray(json) ? json.length : Object.keys(json ?? {}).length;
              evid({
                tipo: "http",
                operacao: "GET /api/modules.json",
                alvo: "/api/modules.json",
                httpStatus: res.status,
                resultado: `${qtd} entradas no registry`,
                ms,
              });
              return `/api/modules.json servido (${qtd} entradas)`;
            },
          },
        ],
      },
      {
        id: "typescript",
        nome: "TypeScript",
        icon: Braces,
        etapas: [
          { id: "ts-1", nome: "Typecheck completo (somente CLI)", cli: "npx tsc --noEmit" },
        ],
      },
      {
        id: "eslint",
        nome: "ESLint",
        icon: ClipboardList,
        etapas: [{ id: "lint-1", nome: "Lint completo (somente CLI)", cli: "npx eslint src" }],
      },
      {
        id: "banco",
        nome: "Banco",
        icon: Database,
        etapas: [
          {
            id: "db-1",
            nome: "Sessão Supabase ativa",
            esperadoMs: 1000,
            run: async () => {
              const { data, error } = await supabase.auth.getSession();
              if (error) throw new Error(error.message);
              if (!data.session) throw new Error("Nenhuma sessão ativa");
              evid({
                tipo: "auth",
                operacao: "supabase.auth.getSession()",
                resultado: `Sessão de ${data.session.user.email ?? data.session.user.id}`,
              });
              return `Sessão de ${data.session.user.email ?? data.session.user.id}`;
            },
          },
          { id: "db-2", nome: "Leitura profiles", esperadoMs: 1500, run: () => contar("profiles") },
          { id: "db-3", nome: "Leitura user_roles", esperadoMs: 1500, run: () => contar("user_roles") },
          { id: "db-4", nome: "Leitura feature_flags", esperadoMs: 1500, run: () => contar("feature_flags") },
        ],
      },
      {
        id: "rls",
        nome: "RLS",
        icon: Lock,
        etapas: [
          {
            id: "rls-1",
            nome: "RBAC — is_admin() no banco",
            esperadoMs: 2000,
            run: async () => {
              const t0 = performance.now();
              const { data, error } = await rpcDinamica("is_admin");
              evid({
                tipo: "rpc",
                operacao: "RPC is_admin()",
                alvo: "is_admin",
                resultado: error ? undefined : `retornou ${String(data)}`,
                erro: error?.message,
                ms: Math.round(performance.now() - t0),
              });
              if (error) throw new Error(error.message);
              if (data !== true) throw new Error("is_admin() retornou false para esta sessão");
              return "Banco confirma privilégio de administrador";
            },
          },
          { id: "rls-2", nome: "Anônimo bloqueado: convenio_partner_leads", esperadoMs: 1500, rlsProbe: true, run: () => probeAnon("convenio_partner_leads") },
          { id: "rls-3", nome: "Anônimo bloqueado: user_roles", esperadoMs: 1500, rlsProbe: true, run: () => probeAnon("user_roles") },
          { id: "rls-4", nome: "Anônimo bloqueado: pay_ledger_entries", esperadoMs: 1500, rlsProbe: true, run: () => probeAnon("pay_ledger_entries") },
          { id: "rls-5", nome: "Anônimo bloqueado: wallets", esperadoMs: 1500, rlsProbe: true, run: () => probeAnon("wallets") },
        ],
      },
      {
        id: "apis",
        nome: "APIs",
        icon: Plug,
        etapas: [
          {
            id: "api-1",
            nome: "Auth API (validação do token no servidor)",
            esperadoMs: 2000,
            run: async () => {
              const t0 = performance.now();
              const { data, error } = await supabase.auth.getUser();
              evid({
                tipo: "auth",
                operacao: "supabase.auth.getUser() — validação do JWT no servidor",
                resultado: error ? undefined : `usuário ${data?.user?.email ?? data?.user?.id ?? "?"}`,
                erro: error?.message,
                ms: Math.round(performance.now() - t0),
              });
              if (error) throw new Error(error.message);
              if (!data.user) throw new Error("Servidor não reconheceu o token");
              return `Token validado no servidor para ${data.user.email ?? data.user.id}`;
            },
          },
          {
            id: "api-2",
            nome: "RPC health_report",
            esperadoMs: 2000,
            run: async () => {
              const t0 = performance.now();
              const { data, error } = await rpcDinamica("health_report");
              const score = (data as { score?: { health_score?: number | string } } | null)?.score
                ?.health_score;
              evid({
                tipo: "rpc",
                operacao: "RPC health_report()",
                alvo: "health_report",
                resultado: error ? undefined : score != null ? `Health Score ${score}` : "resposta sem score",
                erro: error?.message,
                ms: Math.round(performance.now() - t0),
              });
              if (error) throw new Error(error.message);
              return score != null ? `health_report OK — Health Score ${score}` : "health_report respondeu";
            },
          },
          {
            id: "api-3",
            nome: "RPC health_events",
            esperadoMs: 2000,
            run: async () => {
              const t0 = performance.now();
              const { data, error } = await rpcDinamica("health_events", {
                p_filtro: null,
                p_limite: 1,
              });
              evid({
                tipo: "rpc",
                operacao: "RPC health_events(p_filtro: null, p_limite: 1)",
                alvo: "health_events",
                resultado: error ? undefined : `${Array.isArray(data) ? data.length : 0} evento na amostra`,
                erro: error?.message,
                ms: Math.round(performance.now() - t0),
              });
              if (error) throw new Error(error.message);
              return `health_events OK (${Array.isArray(data) ? data.length : 0} evento na amostra)`;
            },
          },
        ],
      },
      {
        id: "frontend",
        nome: "Frontend",
        icon: Monitor,
        etapas: [
          {
            id: "fe-1",
            nome: "Elemento raiz montado",
            esperadoMs: 250,
            run: async () => {
              if (!document.getElementById("root")) throw new Error("#root não encontrado no DOM");
              evid({ tipo: "browser", operacao: "document.getElementById('root')", resultado: "#root presente no DOM" });
              return "#root presente e renderizando esta página";
            },
          },
          {
            id: "fe-2",
            nome: "History API (SPA)",
            esperadoMs: 250,
            run: async () => {
              if (typeof window.history?.pushState !== "function")
                throw new Error("History API indisponível");
              evid({ tipo: "browser", operacao: "typeof window.history.pushState", resultado: "function" });
              return "history.pushState disponível para navegação SPA";
            },
          },
          {
            id: "fe-3",
            nome: "localStorage funcional",
            esperadoMs: 250,
            run: async () => {
              const k = "olt-probe";
              localStorage.setItem(k, "1");
              const ok = localStorage.getItem(k) === "1";
              localStorage.removeItem(k);
              evid({
                tipo: "browser",
                operacao: "setItem/getItem/removeItem em chave própria (olt-probe)",
                resultado: ok ? "leitura idêntica à escrita" : "leitura divergente",
              });
              if (!ok) throw new Error("Leitura divergente no localStorage");
              return "Escrita/leitura/remoção OK em chave própria";
            },
          },
          {
            id: "fe-4",
            nome: "Chunk de UI resolve",
            esperadoMs: 500,
            run: async () => {
              const mod = await import("@/components/ui/card");
              if (!mod.Card) throw new Error("Chunk carregou sem export Card");
              evid({ tipo: "browser", operacao: "import() dinâmico de @/components/ui/card", resultado: "export Card presente" });
              return "import() dinâmico de @/components/ui/card resolveu";
            },
          },
        ],
      },
      {
        id: "marketplace",
        nome: "Marketplace",
        icon: Store,
        etapas: [
          { id: "mkt-1", nome: "Leitura products", esperadoMs: 1500, run: () => contar("products") },
          { id: "mkt-2", nome: "Leitura merchant_stores", esperadoMs: 1500, run: () => contar("merchant_stores") },
          { id: "mkt-3", nome: "Leitura product_categories", esperadoMs: 1500, run: () => contar("product_categories") },
          { id: "mkt-4", nome: "View public_product_listings", esperadoMs: 1500, run: () => contar("public_product_listings") },
        ],
      },
      {
        id: "convenios",
        nome: "Convênios",
        icon: HeartHandshake,
        etapas: [
          { id: "cnv-1", nome: "Leitura convenio_entities", esperadoMs: 1500, run: () => contar("convenio_entities") },
          { id: "cnv-2", nome: "Leitura convenio_agreements", esperadoMs: 1500, run: () => contar("convenio_agreements") },
          { id: "cnv-3", nome: "Leitura convenio_donations", esperadoMs: 1500, run: () => contar("convenio_donations") },
          { id: "cnv-4", nome: "Leitura convenio_campaigns", esperadoMs: 1500, run: () => contar("convenio_campaigns") },
          { id: "cnv-5", nome: "Auditoria convenio_audit_log", esperadoMs: 1500, run: () => contar("convenio_audit_log") },
        ],
      },
      {
        id: "leiloes",
        nome: "Leilões",
        icon: Gavel,
        etapas: [
          { id: "lei-1", nome: "Leitura auction_listings", esperadoMs: 1500, run: () => contar("auction_listings") },
          { id: "lei-2", nome: "Leitura auction_bids", esperadoMs: 1500, run: () => contar("auction_bids") },
          { id: "lei-3", nome: "Leitura auction_events", esperadoMs: 1500, run: () => contar("auction_events") },
          { id: "lei-4", nome: "Regras auction_financial_rules", esperadoMs: 1500, run: () => contar("auction_financial_rules") },
        ],
      },
      {
        id: "financeiro",
        nome: "Financeiro",
        icon: Wallet,
        etapas: [
          { id: "fin-1", nome: "Leitura pay_financial_accounts", esperadoMs: 1500, run: () => contar("pay_financial_accounts") },
          { id: "fin-2", nome: "Leitura pay_ledger_entries", esperadoMs: 1500, run: () => contar("pay_ledger_entries") },
          { id: "fin-3", nome: "Leitura wallets", esperadoMs: 1500, run: () => contar("wallets") },
          { id: "fin-4", nome: "Leitura credit_transactions", esperadoMs: 1500, run: () => contar("credit_transactions") },
        ],
      },
      {
        id: "seguranca",
        nome: "Segurança",
        icon: ShieldCheck,
        etapas: [
          {
            id: "sec-1",
            nome: "Token JWT com expiração válida",
            esperadoMs: 1000,
            run: async () => {
              const { data } = await supabase.auth.getSession();
              const exp = data.session?.expires_at;
              if (!exp) throw new Error("Sessão sem expiração definida");
              const min = Math.round((exp * 1000 - Date.now()) / 60000);
              evid({
                tipo: "auth",
                operacao: "Leitura de expires_at do JWT da sessão",
                resultado: `expira em ~${min} min`,
              });
              if (min <= 0) throw new Error("Token expirado");
              return `Token expira em ~${min} min`;
            },
          },
          { id: "sec-2", nome: "Anônimo bloqueado: platform_financial_dashboard", esperadoMs: 1500, rlsProbe: true, run: () => probeAnon("platform_financial_dashboard") },
          { id: "sec-3", nome: "Anônimo bloqueado: v_pay_admin_platform_summary", esperadoMs: 1500, rlsProbe: true, run: () => probeAnon("v_pay_admin_platform_summary") },
          { id: "sec-4", nome: "Anônimo bloqueado: motoboy_bank_data (PII)", esperadoMs: 1500, rlsProbe: true, run: () => probeAnon("motoboy_bank_data") },
          {
            id: "sec-5",
            nome: "HTTPS em produção",
            esperadoMs: 250,
            run: async () => {
              evid({
                tipo: "browser",
                operacao: "Inspeção de window.location.protocol",
                resultado: `${window.location.protocol} (PROD=${String(import.meta.env.PROD)})`,
              });
              if (import.meta.env.PROD && window.location.protocol !== "https:")
                throw new Error(`Produção servida via ${window.location.protocol}`);
              return import.meta.env.PROD
                ? "Produção servida via HTTPS"
                : "Ambiente dev — HTTP local permitido";
            },
          },
        ],
      },
      {
        id: "performance",
        nome: "Performance",
        icon: Gauge,
        etapas: [
          {
            id: "perf-1",
            nome: "Latência REST (< 2000 ms)",
            esperadoMs: 2000,
            run: () =>
              latencia(
                "SELECT em profiles",
                async () => {
                  const { error } = await supabase.from("profiles").select("id").limit(1);
                  if (error) throw new Error(error.message);
                },
                2000
              ),
          },
          {
            id: "perf-2",
            nome: "Latência RPC (< 2000 ms)",
            esperadoMs: 2000,
            run: () =>
              latencia(
                "RPC is_admin",
                async () => {
                  const { error } = await rpcDinamica("is_admin");
                  if (error) throw new Error(error.message);
                },
                2000
              ),
          },
          {
            id: "perf-3",
            nome: "Latência Auth (< 2000 ms)",
            esperadoMs: 2000,
            run: () =>
              latencia(
                "auth.getUser",
                async () => {
                  const { error } = await supabase.auth.getUser();
                  if (error) throw new Error(error.message);
                },
                2000
              ),
          },
          { id: "perf-4", nome: "Realtime conecta (< 6000 ms)", esperadoMs: 6000, run: testRealtime },
        ],
      },
      {
        id: "shc",
        nome: "SHC",
        icon: CheckSquare,
        etapas: [
          {
            id: "shc-1",
            nome: "Módulos SHC registrados",
            esperadoMs: 1500,
            run: async () => {
              const t0 = performance.now();
              const { count, error } = await supabase
                .from("shc_modules")
                .select("*", { count: "exact", head: true });
              evid({
                tipo: "consulta",
                operacao: "SELECT count(*) (head) via PostgREST — sessão autenticada",
                alvo: "shc_modules",
                resultado: error ? undefined : `${count ?? 0} módulos registrados`,
                erro: error?.message,
                ms: Math.round(performance.now() - t0),
              });
              if (error) throw new Error(error.message);
              if (!count) throw new Error("Nenhum módulo SHC registrado no banco");
              return `${count} módulos SHC registrados`;
            },
          },
          { id: "shc-2", nome: "Leitura shc_runs", esperadoMs: 1500, run: () => contar("shc_runs") },
          { id: "shc-3", nome: "Leitura shc_tests", esperadoMs: 1500, run: () => contar("shc_tests") },
          { id: "shc-4", nome: "Leitura shc_certificates", esperadoMs: 1500, run: () => contar("shc_certificates") },
        ],
      },
      {
        id: "auditoria",
        nome: "Auditoria Final",
        icon: ClipboardCheck,
        etapas: [
          { id: "audit-1", nome: "Central QA — qa_issues", esperadoMs: 1500, run: () => contar("qa_issues") },
          { id: "audit-2", nome: "Central QA — qa_audit_log", esperadoMs: 1500, run: () => contar("qa_audit_log") },
          {
            id: "audit-3",
            nome: "Consolidação da execução",
            esperadoMs: 250,
            run: async () => {
              const r = resultadosRef.current;
              const ids = categorias
                .flatMap((c) => c.etapas.map((e) => e.id))
                .filter((id) => id !== "audit-3");
              const pass = ids.filter((id) => r[id]?.status === "pass").length;
              const fail = ids.filter((id) => r[id]?.status === "fail").length;
              const cli = ids.filter((id) => r[id]?.status === "cli").length;
              const naoExec = ids.length - pass - fail - cli;
              const resumo = `${pass} PASS · ${fail} FAIL · ${cli} CLI · ${naoExec} não executadas`;
              evid({
                tipo: "consolidacao",
                operacao: `Consolidação sobre os resultados reais das ${ids.length} etapas anteriores`,
                resultado: resumo,
              });
              if (fail > 0) throw new Error(`Reprovado — ${resumo}`);
              if (naoExec > 0) throw new Error(`Incompleto — ${resumo}`);
              return `Aprovado — ${resumo}`;
            },
          },
        ],
      },
    ],
    []
  );

  const todasEtapas = useMemo(() => categorias.flatMap((c) => c.etapas), [categorias]);
  const totalEtapas = todasEtapas.length;

  /** Definição serializável — usada por histórico, relatório e exportações. */
  const definicao: DefCategoria[] = useMemo(
    () =>
      categorias.map((c) => ({
        id: c.id,
        nome: c.nome,
        etapas: c.etapas.map((e) => ({
          id: e.id,
          nome: e.nome,
          cli: e.cli,
          esperadoMs: e.esperadoMs,
          rlsProbe: e.rlsProbe,
        })),
      })),
    [categorias]
  );

  const mapaEtapas = useMemo(() => {
    const m = new Map<string, { nome: string; categoria: string }>();
    for (const c of definicao)
      for (const e of c.etapas) m.set(e.id, { nome: e.nome, categoria: c.nome });
    return m;
  }, [definicao]);

  /* ── Restaura histórico persistido (migra o snapshot v1 automaticamente) ── */
  useEffect(() => {
    const hist = carregarHistorico(totalEtapas);
    setHistorico(hist);
    const ultima = hist[0];
    if (ultima) {
      resultadosRef.current = ultima.resultados;
      setResultados(ultima.resultados);
      setExecucaoAtual(ultima);
      setCronometroMs(ultima.duracaoMs);
      setEstado("concluida");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Versão real do sistema (registry público /api/modules.json) ── */
  useEffect(() => {
    fetch("/api/modules.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const v = j?.versao
          ? `${j.plataforma ?? "Sistema"} v${j.versao}${j.atualizado_em ? ` (${j.atualizado_em})` : ""}`
          : "indisponível";
        setVersaoSistema(v);
      })
      .catch(() => setVersaoSistema("indisponível"));
  }, []);

  const versaoCompleta = `${versaoSistema} · OLT v${OLT_VERSION} · modo ${import.meta.env.MODE}`;
  useEffect(() => {
    versaoRef.current = versaoCompleta;
  }, [versaoCompleta]);

  /* ── Cronômetro em tempo real (tempo de parede da execução) ── */
  const rodando = estado === "executando" || estado === "pausada";
  useEffect(() => {
    if (!rodando || inicioExec == null) return;
    const t = window.setInterval(() => setCronometroMs(Date.now() - inicioExec), 500);
    return () => window.clearInterval(t);
  }, [rodando, inicioExec]);

  /* ── Dashboard de Saúde — verificação real, repetida a cada 60s fora de execução ── */
  const verificarSaude = useCallback(async () => {
    if (saudeRodandoRef.current) return;
    saudeRodandoRef.current = true;
    setSaudeVerificando(true);
    setSaude((prev) =>
      Object.fromEntries(
        CHECKS_SAUDE.map((c) => [c.id, { ...prev[c.id], id: c.id, nome: c.nome, estado: "verificando" as EstadoSaude }])
      )
    );
    await Promise.all(
      CHECKS_SAUDE.map(async (c) => {
        try {
          const r = await c.run();
          setSaude((p) => ({ ...p, [c.id]: { id: c.id, nome: c.nome, ...r } }));
        } catch (e) {
          setSaude((p) => ({
            ...p,
            [c.id]: {
              id: c.id,
              nome: c.nome,
              estado: "vermelho",
              detalhe: e instanceof Error ? e.message : String(e),
            },
          }));
        }
      })
    );
    setSaudeTs(new Date().toISOString());
    setSaudeVerificando(false);
    saudeRodandoRef.current = false;
  }, []);

  useEffect(() => {
    if (rodando) return;
    void verificarSaude();
    const t = window.setInterval(() => void verificarSaude(), 60_000);
    return () => window.clearInterval(t);
  }, [rodando, verificarSaude]);

  /* ── Motor da fila (lógica de diagnóstico inalterada; v2 adiciona medição,
   *    evidências, histórico e o ponto de extensão do gate) ── */
  const executarEtapas = async (somenteIds: Set<string> | null) => {
    controlRef.current = { pause: false, cancel: false };
    const fila = todasEtapas.filter((e) => !somenteIds || somenteIds.has(e.id));
    if (fila.length === 0) return;

    if (!somenteIds) {
      resultadosRef.current = {};
      setResultados({});
    } else {
      fila.forEach((e) => setRes(e.id, { status: "pendente" }));
    }
    setGateAviso(null);
    const inicio = Date.now();
    setInicioExec(inicio);
    setCronometroMs(0);
    setEstado("executando");

    for (const etapa of fila) {
      if (controlRef.current.cancel) break;
      while (controlRef.current.pause && !controlRef.current.cancel) {
        await sleep(200);
      }
      if (controlRef.current.cancel) break;

      const catId = categorias.find((c) => c.etapas.some((e) => e.id === etapa.id))?.id;
      if (catId) setExpandidas(new Set([catId]));

      if (etapa.cli) {
        setRes(etapa.id, {
          status: "cli",
          detalhe: `Execute na CLI: ${etapa.cli}`,
          evidencias: [
            {
              tipo: "cli",
              operacao: `Comando indicado: ${etapa.cli}`,
              resultado: "Etapa não executável no navegador — nunca aprovada automaticamente",
              ts: new Date().toISOString(),
            },
          ],
        });
        continue;
      }
      coletorEvidencias = [];
      setRes(etapa.id, { status: "executando" });
      const t0 = performance.now();
      try {
        const detalhe = await etapa.run!();
        setRes(etapa.id, {
          status: "pass",
          detalhe,
          ms: Math.round(performance.now() - t0),
          esperadoMs: etapa.esperadoMs,
          evidencias: coletorEvidencias,
        });
      } catch (e: unknown) {
        setRes(etapa.id, {
          status: "fail",
          detalhe: e instanceof Error ? e.message : String(e),
          ms: Math.round(performance.now() - t0),
          esperadoMs: etapa.esperadoMs,
          evidencias: coletorEvidencias,
        });
      } finally {
        coletorEvidencias = null;
      }
    }

    const cancelado = controlRef.current.cancel;
    const fim = Date.now();
    const duracaoMs = fim - inicio;
    setCronometroMs(duracaoMs);
    setInicioExec(null);
    setEstado(cancelado ? "cancelada" : "concluida");

    const r = resultadosRef.current;
    const ids = todasEtapas.map((e) => e.id);
    const { pass, fail, cli, executadas } = contarStatus(r, ids);
    const execucao: ExecucaoOLT = {
      id: crypto.randomUUID(),
      inicioTs: new Date(inicio).toISOString(),
      fimTs: new Date(fim).toISOString(),
      duracaoMs,
      estadoFinal: cancelado ? "cancelada" : "concluida",
      parcial: !!somenteIds,
      total: totalEtapas,
      pass,
      fail,
      cli,
      naoExec: totalEtapas - executadas,
      percentualPass: totalEtapas ? Math.round((pass / totalEtapas) * 100) : 0,
      versao: versaoRef.current,
      resultados: r,
    };
    setExecucaoAtual(execucao);
    setHistorico(salvarExecucao(execucao));

    // Ponto de extensão: gate de homologação (null por padrão → sem efeito).
    const gate = oltExtensions.gate;
    if (gate) {
      try {
        const g = gate.avaliar(execucao, agruparFalhas(definicao, r));
        if (g.bloqueado)
          setGateAviso(g.motivo ?? "Homologação bloqueada pelo gate de falhas críticas.");
      } catch {
        /* extensão com erro não pode derrubar o painel */
      }
    }

    const comFalha = categorias
      .filter((c) => c.etapas.some((e) => resultadosRef.current[e.id]?.status === "fail"))
      .map((c) => c.id);
    if (comFalha.length > 0) setExpandidas(new Set(comFalha));
  };

  const iniciar = () => executarEtapas(null);
  const pausar = () => {
    controlRef.current.pause = true;
    setEstado("pausada");
  };
  const continuar = () => {
    controlRef.current.pause = false;
    setEstado("executando");
  };
  const cancelar = () => {
    controlRef.current.cancel = true;
    controlRef.current.pause = false;
  };
  const executarFalhas = () => {
    const falhasIds = new Set(
      todasEtapas.filter((e) => resultados[e.id]?.status === "fail").map((e) => e.id)
    );
    if (falhasIds.size > 0) void executarEtapas(falhasIds);
  };

  /* ── Derivados de progresso ── */
  const concluidas = todasEtapas.filter((e) =>
    ["pass", "fail", "cli"].includes(resultados[e.id]?.status ?? "")
  ).length;
  const falhas = todasEtapas.filter((e) => resultados[e.id]?.status === "fail").length;
  const pct = totalEtapas ? Math.round((concluidas / totalEtapas) * 100) : 0;

  const statusDe = (id: string): EtapaStatus => resultados[id]?.status ?? "pendente";
  const contagemFiltro = (f: FiltroFila) =>
    f === "todos" ? totalEtapas : todasEtapas.filter((e) => statusDe(e.id) === f).length;

  const statusCategoria = (cat: Categoria): EtapaStatus | "parcial" => {
    const st = cat.etapas.map((e) => resultados[e.id]?.status ?? "pendente");
    if (st.includes("executando")) return "executando";
    if (st.includes("fail")) return "fail";
    if (st.every((s) => s === "pass" || s === "cli")) return "pass";
    if (st.some((s) => s !== "pendente")) return "parcial";
    return "pendente";
  };

  const toggleCategoria = (id: string) =>
    setExpandidas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleEvidencias = (id: string) =>
    setEvidenciasAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleHist = (id: string) =>
    setHistAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleSelecao = (id: string) =>
    setSelecionadas((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );

  const comparacao = useMemo(() => {
    if (selecionadas.length !== 2) return null;
    const a = historico.find((h) => h.id === selecionadas[0]);
    const b = historico.find((h) => h.id === selecionadas[1]);
    return a && b ? compararExecucoes(a, b) : null;
  }, [selecionadas, historico]);

  const estatisticas = useMemo(() => calcularEstatisticas(historico), [historico]);

  const temResultado = Object.keys(resultados).length > 0;
  const posExecucao = (estado === "concluida" || estado === "cancelada") && temResultado;
  const grupos = useMemo(
    () => (posExecucao ? agruparFalhas(definicao, resultados) : null),
    [posExecucao, definicao, resultados]
  );
  const relatorioExecutivo = useMemo(
    () => (posExecucao && execucaoAtual ? gerarRelatorioExecutivo(definicao, execucaoAtual) : null),
    [posExecucao, execucaoAtual, definicao]
  );

  const podeExportar = !!execucaoAtual && !rodando;

  const tempoExibido = rodando ? cronometroMs : execucaoAtual?.duracaoMs ?? cronometroMs;
  const executadasAtual = execucaoAtual ? execucaoAtual.pass + execucaoAtual.fail + execucaoAtual.cli : 0;
  const legendaTempo = rodando
    ? estado === "pausada"
      ? "Fila pausada — o cronômetro segue o tempo real de parede"
      : "Cronômetro em tempo real — execução em andamento"
    : execucaoAtual
    ? execucaoAtual.duracaoMs != null
      ? `Tempo definitivo gravado com o snapshot de ${new Date(execucaoAtual.fimTs).toLocaleString("pt-BR")}`
      : "Execução migrada do snapshot v1 — duração não foi medida na época"
    : "Nenhuma execução registrada neste navegador";

  const nomeEtapa = (id: string) => mapaEtapas.get(id)?.nome ?? id;

  /* ── Render ── */
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-white shrink-0">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              ORION LOCAL TEST LAB
              <Badge variant="secondary" className="uppercase tracking-wider">OLT v{OLT_VERSION}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Fila de diagnósticos reais — {totalEtapas} etapas em {categorias.length} categorias, todas somente leitura
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>
            {user?.email ?? "—"} · Admin: <b>{isAdmin ? "SIM" : "NÃO"}</b> · modo {import.meta.env.MODE}
          </div>
          <div>Versão do sistema: {versaoSistema}</div>
          <div>
            Última execução:{" "}
            {execucaoAtual ? new Date(execucaoAtual.fimTs).toLocaleString("pt-BR") : "nenhuma"}
          </div>
        </div>
      </div>

      {gateAviso && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {gateAviso}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        {/* ── Coluna principal ── */}
        <div className="space-y-6 min-w-0">
          {/* Tempo Total */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Timer className="h-4 w-4 text-violet-600" /> Tempo Total
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-3xl font-mono font-bold tabular-nums">
                {formatarDuracao(tempoExibido)}
              </div>
              <p className="text-xs text-muted-foreground">{legendaTempo}</p>
              {!rodando && execucaoAtual?.duracaoMs != null && executadasAtual > 0 && (
                <p className="text-xs text-muted-foreground font-mono">
                  média por etapa executada:{" "}
                  {formatarSegundos(execucaoAtual.duracaoMs / executadasAtual)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Progresso Geral + Controles + Exportações */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Progresso Geral</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">
                  {concluidas} / {totalEtapas} etapas
                </span>
                <span className="flex items-center gap-3">
                  {falhas > 0 && (
                    <span className="text-red-600 font-semibold text-xs">{falhas} FAIL</span>
                  )}
                  <span className="font-mono text-xs">{pct}%</span>
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    falhas > 0 ? "bg-red-500" : "bg-violet-600"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={iniciar} disabled={rodando} className="gap-1.5">
                  <PlayCircle className="h-4 w-4" /> Iniciar
                </Button>
                <Button
                  onClick={pausar}
                  disabled={estado !== "executando"}
                  variant="secondary"
                  className="gap-1.5"
                >
                  <PauseCircle className="h-4 w-4" /> Pausar
                </Button>
                <Button
                  onClick={continuar}
                  disabled={estado !== "pausada"}
                  variant="secondary"
                  className="gap-1.5"
                >
                  <StepForward className="h-4 w-4" /> Continuar
                </Button>
                <Button onClick={cancelar} disabled={!rodando} variant="destructive" className="gap-1.5">
                  <Ban className="h-4 w-4" /> Cancelar
                </Button>
                <Button
                  onClick={executarFalhas}
                  disabled={rodando || falhas === 0}
                  variant="outline"
                  className="gap-1.5"
                >
                  <RotateCcw className="h-4 w-4" /> Executar somente falhas
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!podeExportar}
                  onClick={() => execucaoAtual && exportarOltJson(definicao, execucaoAtual)}
                  className="gap-1.5"
                >
                  <FileJson className="h-4 w-4" /> Exportar JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!podeExportar}
                  onClick={() => execucaoAtual && exportarOltMarkdown(definicao, execucaoAtual)}
                  className="gap-1.5"
                >
                  <FileText className="h-4 w-4" /> Exportar Markdown
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!podeExportar}
                  onClick={() => execucaoAtual && exportarOltPdf(definicao, execucaoAtual)}
                  className="gap-1.5"
                >
                  <FileDown className="h-4 w-4" /> Exportar PDF
                </Button>
              </div>
              {estado === "pausada" && (
                <p className="text-xs text-amber-600 font-medium">
                  Fila pausada — a etapa em andamento termina antes da pausa valer.
                </p>
              )}
              {estado === "cancelada" && (
                <p className="text-xs text-red-600 font-medium">
                  Execução cancelada — etapas restantes permanecem pendentes.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Filtros Inteligentes */}
          <Card>
            <CardContent className="py-3 flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFiltro(f.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filtro === f.id
                      ? "bg-violet-600 text-white border-violet-600"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                >
                  {f.label}{" "}
                  <span className={cn("font-mono", filtro === f.id ? "text-violet-100" : "")}>
                    {contagemFiltro(f.id)}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Fila de Execução */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Fila de Execução</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {categorias.map((cat) => {
                const etapasVisiveis =
                  filtro === "todos"
                    ? cat.etapas
                    : cat.etapas.filter((e) => statusDe(e.id) === filtro);
                if (filtro !== "todos" && etapasVisiveis.length === 0) return null;

                const st = statusCategoria(cat);
                const aberta = filtro !== "todos" || expandidas.has(cat.id);
                const done = cat.etapas.filter((e) =>
                  ["pass", "fail", "cli"].includes(resultados[e.id]?.status ?? "")
                ).length;
                const msCat = cat.etapas.reduce(
                  (acc, e) => acc + (typeof resultados[e.id]?.ms === "number" ? resultados[e.id]!.ms! : 0),
                  0
                );
                const medidas = cat.etapas.filter(
                  (e) => typeof resultados[e.id]?.ms === "number"
                ).length;
                const gargalosCat = cat.etapas.filter((e) =>
                  calcularGargalo(resultados[e.id])
                ).length;
                const CatStatusIcon =
                  st === "executando"
                    ? Loader2
                    : st === "pass"
                    ? CheckSquare
                    : st === "fail"
                    ? XCircle
                    : st === "parcial"
                    ? MinusCircle
                    : Square;
                return (
                  <div key={cat.id} className="rounded-lg border">
                    <button
                      onClick={() => toggleCategoria(cat.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    >
                      <CatStatusIcon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          st === "executando" && "text-sky-500 animate-spin",
                          st === "pass" && "text-emerald-600",
                          st === "fail" && "text-red-600",
                          st === "parcial" && "text-amber-500",
                          st === "pendente" && "text-zinc-400"
                        )}
                      />
                      <cat.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium">{cat.nome}</span>
                        {medidas > 0 && (
                          <span className="ml-2 text-[11px] text-muted-foreground font-mono">
                            {cat.etapas.length} etapas · {formatarSegundos(msCat)} · média{" "}
                            {formatarSegundos(msCat / medidas)}
                          </span>
                        )}
                      </span>
                      {gargalosCat > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" /> {gargalosCat}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {done}/{cat.etapas.length}
                      </span>
                      {aberta ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    {aberta && (
                      <div className="border-t px-3 py-2 space-y-1.5 bg-muted/20">
                        {etapasVisiveis.map((e) => {
                          const r = resultados[e.id] ?? { status: "pendente" as EtapaStatus };
                          const ui = ETAPA_UI[r.status];
                          const StIcon = ui.icon;
                          const gargalo = calcularGargalo(r);
                          const evidencias = r.evidencias ?? [];
                          const evAberta = evidenciasAbertas.has(e.id);
                          return (
                            <div key={e.id} className="flex items-start gap-2.5 py-1">
                              <StIcon className={cn("h-4 w-4 mt-0.5 shrink-0", ui.cls)} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium">{e.nome}</span>
                                  {typeof r.ms === "number" && (
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      {r.ms} ms
                                    </span>
                                  )}
                                </div>
                                {r.detalhe && (
                                  <p
                                    className={cn(
                                      "text-[11px] font-mono break-words",
                                      r.status === "fail"
                                        ? "text-red-600"
                                        : r.status === "cli"
                                        ? "text-amber-700"
                                        : "text-emerald-700"
                                    )}
                                  >
                                    {r.detalhe}
                                  </p>
                                )}
                                {gargalo && (
                                  <div className="mt-1 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-[11px] text-amber-700">
                                    ⚠ Gargalo detectado — esperado {gargalo.esperadoMs} ms ·
                                    encontrado {gargalo.encontradoMs} ms · diferença +
                                    {gargalo.diferencaMs} ms
                                  </div>
                                )}
                                {evidencias.length > 0 && (
                                  <div className="mt-1">
                                    <button
                                      onClick={() => toggleEvidencias(e.id)}
                                      className="text-[11px] text-violet-600 underline underline-offset-2 hover:text-violet-800"
                                    >
                                      {evAberta
                                        ? "Ocultar evidências"
                                        : `Ver evidências (${evidencias.length})`}
                                    </button>
                                    {evAberta && (
                                      <div className="mt-1.5 space-y-1.5">
                                        {evidencias.map((ev, i) => (
                                          <div
                                            key={i}
                                            className="rounded border bg-background px-2 py-1.5 font-mono text-[11px] space-y-0.5"
                                          >
                                            <div className="flex items-center gap-1.5">
                                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                                {EVIDENCIA_TIPO_LABEL[ev.tipo]}
                                              </Badge>
                                              <span className="break-words">{ev.operacao}</span>
                                            </div>
                                            {ev.alvo && <div>Alvo: {ev.alvo}</div>}
                                            {ev.resultado && <div>Resultado: {ev.resultado}</div>}
                                            {ev.httpStatus != null && <div>HTTP: {ev.httpStatus}</div>}
                                            {typeof ev.ms === "number" && <div>Latência: {ev.ms} ms</div>}
                                            {ev.erro && (
                                              <div className="text-red-600">Erro: {ev.erro}</div>
                                            )}
                                            <div className="text-muted-foreground">
                                              {new Date(ev.ts).toLocaleTimeString("pt-BR")}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <span className={cn("text-[10px] font-bold shrink-0", ui.cls)}>
                                {ui.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Agrupamento de Falhas */}
          {grupos && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-violet-600" /> Agrupamento de Falhas
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { titulo: "Falhas Críticas", itens: grupos.criticas, cls: "text-red-600 border-red-300", vazio: "Nenhuma falha crítica." },
                    { titulo: "Falhas Médias", itens: grupos.medias, cls: "text-orange-600 border-orange-300", vazio: "Nenhuma falha média." },
                    { titulo: "Avisos (gargalos)", itens: grupos.avisos, cls: "text-amber-600 border-amber-300", vazio: "Nenhum gargalo detectado." },
                    { titulo: "CLI", itens: grupos.cli, cls: "text-amber-700 border-amber-300", vazio: "Nenhuma etapa CLI." },
                  ] as const
                ).map((g) => (
                  <div key={g.titulo} className={cn("rounded-lg border p-3 space-y-1.5", g.cls)}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wide">{g.titulo}</span>
                      <span className="text-xs font-mono">{g.itens.length}</span>
                    </div>
                    {g.itens.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">{g.vazio}</p>
                    ) : (
                      g.itens.map((i) => (
                        <div key={i.etapaId} className="text-[11px] leading-snug">
                          <span className="font-medium">
                            {i.categoriaNome} · {i.etapaNome}
                          </span>
                          {i.diferencaMs != null && (
                            <span className="font-mono"> (+{i.diferencaMs} ms acima do esperado)</span>
                          )}
                          {i.detalhe && (
                            <p className="font-mono break-words text-muted-foreground">{i.detalhe}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Relatório Executivo */}
          {relatorioExecutivo && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-violet-600" /> Relatório Executivo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {relatorioExecutivo.map((linha, i) => (
                  <p
                    key={i}
                    className={cn(
                      "text-sm",
                      i === 0 && "font-semibold",
                      linha.startsWith("⚠") && "text-red-600 font-medium"
                    )}
                  >
                    {linha}
                  </p>
                ))}
                <p className="text-[11px] text-muted-foreground pt-1">
                  Gerado exclusivamente a partir dos resultados reais desta execução.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Histórico das Execuções + Comparador */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4 text-violet-600" /> Histórico das Execuções
                <span className="text-[11px] font-normal text-muted-foreground">
                  (últimas 20 — armazenadas apenas neste navegador)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {historico.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma execução registrada ainda.</p>
              )}

              {comparacao && (
                <div className="rounded-lg border border-violet-300 bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-2">
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <ArrowLeftRight className="h-3.5 w-3.5" /> Comparador de Execuções
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    {[comparacao.antiga, comparacao.recente].map((e, i) => (
                      <div key={e.id} className="rounded border bg-background p-2 space-y-0.5">
                        <div className="font-bold">
                          {i === 0 ? "A (mais antiga)" : "B (mais recente)"}
                        </div>
                        <div>{new Date(e.fimTs).toLocaleString("pt-BR")}</div>
                        <div>Duração: {formatarDuracao(e.duracaoMs)}</div>
                        <div>
                          {e.pass} PASS · {e.fail} FAIL · {e.cli} CLI · {e.percentualPass}%
                        </div>
                      </div>
                    ))}
                  </div>
                  <ul className="text-xs space-y-0.5">
                    <li className={comparacao.deltaPass >= 0 ? "text-emerald-700" : "text-red-600"}>
                      {comparacao.deltaPass > 0
                        ? `PASS aumentou (+${comparacao.deltaPass})`
                        : comparacao.deltaPass < 0
                        ? `PASS diminuiu (${comparacao.deltaPass})`
                        : "PASS estável"}
                    </li>
                    <li className={comparacao.deltaFail <= 0 ? "text-emerald-700" : "text-red-600"}>
                      {comparacao.deltaFail < 0
                        ? `FAIL diminuiu (${comparacao.deltaFail})`
                        : comparacao.deltaFail > 0
                        ? `FAIL aumentou (+${comparacao.deltaFail})`
                        : "FAIL estável"}
                    </li>
                    <li
                      className={
                        (comparacao.deltaTempoMs ?? 0) <= 0 ? "text-emerald-700" : "text-amber-700"
                      }
                    >
                      {comparacao.deltaTempoMs == null
                        ? "Tempo: sem medição comparável (execução sem duração registrada)"
                        : comparacao.deltaTempoMs < 0
                        ? `Tempo melhorou (−${formatarSegundos(-comparacao.deltaTempoMs)})`
                        : comparacao.deltaTempoMs > 0
                        ? `Tempo piorou (+${formatarSegundos(comparacao.deltaTempoMs)})`
                        : "Tempo estável"}
                    </li>
                  </ul>
                  <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
                    <div>
                      <div className="font-bold text-red-600">
                        Novas falhas ({comparacao.novasFalhas.length})
                      </div>
                      {comparacao.novasFalhas.length === 0 ? (
                        <p className="text-muted-foreground">Nenhuma nova falha.</p>
                      ) : (
                        comparacao.novasFalhas.map((id) => <p key={id}>{nomeEtapa(id)}</p>)
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-emerald-700">
                        Falhas corrigidas ({comparacao.falhasCorrigidas.length})
                      </div>
                      {comparacao.falhasCorrigidas.length === 0 ? (
                        <p className="text-muted-foreground">Nenhuma falha corrigida.</p>
                      ) : (
                        comparacao.falhasCorrigidas.map((id) => <p key={id}>{nomeEtapa(id)}</p>)
                      )}
                    </div>
                  </div>
                </div>
              )}
              {selecionadas.length === 1 && (
                <p className="text-[11px] text-violet-600">
                  Selecione a segunda execução para comparar.
                </p>
              )}

              {historico.map((h) => {
                const abertaHist = histAbertas.has(h.id);
                const selecionada = selecionadas.includes(h.id);
                return (
                  <div key={h.id} className={cn("rounded-lg border", selecionada && "border-violet-500")}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        onClick={() => toggleHist(h.id)}
                        className="flex flex-1 items-center gap-2 text-left min-w-0"
                      >
                        {abertaHist ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-xs font-medium whitespace-nowrap">
                          {new Date(h.fimTs).toLocaleString("pt-BR")}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                          {formatarDuracao(h.duracaoMs)}
                        </span>
                        <span className="text-[11px] font-mono whitespace-nowrap">
                          <span className="text-emerald-600">{h.pass}P</span> ·{" "}
                          <span className={h.fail > 0 ? "text-red-600" : ""}>{h.fail}F</span> ·{" "}
                          <span className="text-amber-600">{h.cli}C</span> · {h.percentualPass}%
                        </span>
                        {h.parcial && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">parcial</Badge>
                        )}
                        {h.estadoFinal === "cancelada" && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-red-600">
                            cancelada
                          </Badge>
                        )}
                        <span
                          className="text-[10px] text-muted-foreground truncate hidden md:inline"
                          title={h.versao}
                        >
                          {h.versao}
                        </span>
                      </button>
                      <Button
                        variant={selecionada ? "default" : "outline"}
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => toggleSelecao(h.id)}
                      >
                        <ArrowLeftRight className="h-3 w-3" /> Comparar
                      </Button>
                    </div>
                    {abertaHist && (
                      <div className="border-t px-3 py-2 space-y-2 bg-muted/20">
                        <div className="flex flex-wrap gap-1.5">
                          {definicao.map((cat) => {
                            const idsCat = cat.etapas.map((e) => e.id);
                            const c = contarStatus(h.resultados, idsCat);
                            return (
                              <span
                                key={cat.id}
                                className={cn(
                                  "rounded border px-1.5 py-0.5 text-[10px] font-mono",
                                  c.fail > 0 && "border-red-300 text-red-600"
                                )}
                              >
                                {cat.nome} {c.pass}/{idsCat.length}
                                {c.fail > 0 && ` · ${c.fail}F`}
                              </span>
                            );
                          })}
                        </div>
                        {Object.entries(h.resultados).filter(([, r]) => r.status === "fail").length >
                          0 && (
                          <div className="space-y-1">
                            <div className="text-[11px] font-bold text-red-600">Falhas desta execução</div>
                            {Object.entries(h.resultados)
                              .filter(([, r]) => r.status === "fail")
                              .map(([id, r]) => (
                                <p key={id} className="text-[11px] font-mono break-words">
                                  <span className="font-semibold">{nomeEtapa(id)}</span>
                                  {r.detalhe ? ` — ${r.detalhe}` : ""}
                                </p>
                              ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1"
                            onClick={() => exportarOltJson(definicao, h)}
                          >
                            <FileJson className="h-3 w-3" /> JSON
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1"
                            onClick={() => exportarOltMarkdown(definicao, h)}
                          >
                            <FileText className="h-3 w-3" /> Markdown
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1"
                            onClick={() => exportarOltPdf(definicao, h)}
                          >
                            <FileDown className="h-3 w-3" /> PDF
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <p className="text-[11px] text-muted-foreground">
            Todas as etapas são somente leitura contra o ambiente real. Etapas marcadas CLI
            (TypeScript/ESLint) não executam no navegador — rode o comando indicado e confira o
            resultado localmente. O histórico das últimas 20 execuções fica apenas neste navegador.
          </p>
        </div>

        {/* ── Painel lateral ── */}
        <div className="space-y-6">
          {/* Dashboard de Saúde */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-violet-600" /> Saúde em Tempo Real
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => void verificarSaude()}
                  disabled={saudeVerificando}
                >
                  <RefreshCw className={cn("h-3 w-3", saudeVerificando && "animate-spin")} />
                  Verificar agora
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {CHECKS_SAUDE.map((c) => {
                const ind = saude[c.id];
                return (
                  <div key={c.id}>
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", SAUDE_DOT[ind.estado])} />
                      <span className="text-xs font-medium flex-1">{ind.nome}</span>
                      {typeof ind.ms === "number" && (
                        <span className="text-[10px] font-mono text-muted-foreground">{ind.ms} ms</span>
                      )}
                    </div>
                    {ind.detalhe && (
                      <p className="pl-4.5 ml-4 text-[10px] font-mono text-muted-foreground break-words">
                        {ind.detalhe}
                      </p>
                    )}
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground border-t pt-2">
                Verificações reais executadas deste navegador a cada 60s (pausadas durante a
                homologação).{" "}
                {saudeTs ? `Última: ${new Date(saudeTs).toLocaleTimeString("pt-BR")}` : ""}
              </p>
            </CardContent>
          </Card>

          {/* Estatísticas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-violet-600" /> Estatísticas
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs divide-y">
              {(
                [
                  ["Homologações registradas", String(estatisticas.quantidade)],
                  [
                    "Última homologação",
                    estatisticas.ultimaTs
                      ? new Date(estatisticas.ultimaTs).toLocaleString("pt-BR")
                      : "—",
                  ],
                  ["Tempo médio", formatarDuracao(estatisticas.tempoMedioMs)],
                  ["Maior tempo", formatarDuracao(estatisticas.maiorMs)],
                  ["Menor tempo", formatarDuracao(estatisticas.menorMs)],
                  [
                    "Média de PASS",
                    estatisticas.mediaPass != null
                      ? estatisticas.mediaPass.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
                      : "—",
                  ],
                  [
                    "Média de FAIL",
                    estatisticas.mediaFail != null
                      ? estatisticas.mediaFail.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
                      : "—",
                  ],
                  ["Versão atual", versaoSistema],
                ] as const
              ).map(([label, valor]) => (
                <div key={label} className="flex items-start justify-between gap-2 py-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono text-right break-words">{valor}</span>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground pt-2">
                Calculadas sobre o histórico real deste navegador. Tempos consideram apenas
                execuções com duração medida.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
