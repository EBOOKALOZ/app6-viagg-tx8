/**
 * AuthGateProvider — modal GLOBAL de "faça login para continuar" + retomada da ação.
 *
 * Montado uma vez (App.tsx). Escuta o evento OPEN_LOGIN_EVENT (disparado por
 * useRequireAuth quando um deslogado tenta uma ação pessoal) e mostra um modal
 * elegante do design system. Quando o usuário autentica (aqui ou pelo magic-link
 * que reabre o app), relê a ação pendente e a RE-EXECUTA registrando o handler
 * pela `kind` — sem o usuário reclicar. Sem sessão → nada é gravado (backend
 * também barra por RLS/auth.uid — isto é só a camada de UX).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { LogIn, UserPlus, X, ShieldCheck } from "lucide-react";
import viaggLogo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import {
  OPEN_LOGIN_EVENT, readPendingAction, clearPendingAction, type PendingAction,
} from "@/lib/auth/requireAuth";

// Registro de handlers de retomada por `kind`. Componentes registram o seu para
// que a ação pendente possa rodar após o login sem estarem montados no momento.
type ResumeHandler = (payload: Record<string, unknown> | undefined) => void;
const resumeHandlers = new Map<string, ResumeHandler>();
export function registerResumeHandler(kind: string, fn: ResumeHandler) {
  resumeHandlers.set(kind, fn);
  return () => { if (resumeHandlers.get(kind) === fn) resumeHandlers.delete(kind); };
}

export function AuthGateProvider() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [portalReady, setPortalReady] = useState(false);
  const lastUserRef = useRef<string | null>(null);

  useEffect(() => setPortalReady(true), []);

  // Abrir modal quando uma ação protegida for tentada por deslogado
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { reason?: string } | undefined;
      setReason(detail?.reason);
      setOpen(true);
    };
    window.addEventListener(OPEN_LOGIN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LOGIN_EVENT, onOpen);
  }, []);

  // Ao autenticar (login aqui OU via magic-link que reabriu o app), retoma a ação
  const resumePending = useCallback((pending: PendingAction) => {
    const handler = resumeHandlers.get(pending.kind);
    if (handler) {
      handler(pending.payload);
      clearPendingAction();
    }
    // se não há handler registrado ainda (página não montada), mantém pendente:
    // o próprio componente, ao montar, pode consumir readPendingAction().
  }, []);

  useEffect(() => {
    const uid = user?.id ?? null;
    // transição deslogado → logado
    if (uid && lastUserRef.current !== uid) {
      lastUserRef.current = uid;
      setOpen(false);
      const pending = readPendingAction();
      if (pending) {
        // volta à página de origem (se saímos dela) e retoma
        if (pending.returnTo && window.location.pathname + window.location.search !== pending.returnTo) {
          navigate(pending.returnTo, { replace: true });
        }
        // pequeno atraso para a página de origem montar e registrar o handler
        setTimeout(() => resumePending(pending), 350);
      }
    }
    if (!uid) lastUserRef.current = null;
  }, [user?.id, navigate, resumePending]);

  const goLogin = (signup?: boolean) => {
    setOpen(false);
    // Reusa o trilho nativo de retorno do Auth (?redirect → viagg_pending_redirect),
    // que já sobrevive a OAuth/magic-link. A ação pendente fica no localStorage e é
    // retomada pelo efeito de transição de login acima.
    const pending = readPendingAction();
    const rt = pending?.returnTo || window.location.pathname + window.location.search;
    navigate(`/auth?redirect=${encodeURIComponent(rt)}${signup ? "&signup=1" : ""}`);
  };

  if (!portalReady || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setOpen(false)} />

      {/* card */}
      <div className="relative w-full max-w-sm rounded-3xl bg-[#1A1F24] border border-[#323A45] shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-6 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-[#8E98A3] hover:bg-white/10 hover:text-white transition-all"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {/* cabeçalho oficial */}
        <div className="flex flex-col items-center text-center">
          <img src={viaggLogo} alt="Viagg-TX8" className="h-12 w-12 rounded-2xl object-contain ring-1 ring-[#FF7A00]/30 shadow-[0_0_18px_rgba(255,122,0,0.25)]" />
          <h2 className="mt-3 text-lg font-black text-white uppercase tracking-tight">Entre para continuar</h2>
          <p className="mt-1 text-sm text-[#B8C2CC] leading-snug">
            {reason
              ? <>Faça login ou crie uma conta para <span className="font-bold text-white">{reason}</span>.</>
              : "Faça login ou crie uma conta para utilizar esta funcionalidade."}
          </p>
        </div>

        {/* ações destacadas */}
        <div className="mt-6 space-y-2.5">
          <button
            onClick={goLogin}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl bg-[#FF7A00] hover:bg-[#FF8E1F] text-white font-black uppercase text-sm tracking-wider shadow-[0_6px_18px_rgba(255,122,0,0.30)] active:scale-[0.98] transition-all"
          >
            <LogIn className="h-4.5 w-4.5" /> Entrar
          </button>
          <button
            onClick={() => goLogin(true)}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl bg-white/5 border border-[#323A45] text-white font-bold uppercase text-sm tracking-wider hover:bg-white/10 active:scale-[0.98] transition-all"
          >
            <UserPlus className="h-4.5 w-4.5 text-[#00C58E]" /> Criar Conta
          </button>
        </div>

        {/* rodapé oficial */}
        <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] font-bold text-[#8E98A3] uppercase tracking-wider">
          <ShieldCheck className="h-3.5 w-3.5 text-[#00C58E]" /> Seus dados protegidos · Viagg-TX8
        </p>
      </div>
    </div>,
    document.body
  );
}

export default AuthGateProvider;
