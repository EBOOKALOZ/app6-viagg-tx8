/**
 * /minha-reputacao — Dashboard de Reputação do Usuário (ORION-AI-74)
 *
 * Mostra ao usuário logado o próprio Trust Score, nível, evolução, fatores
 * que ajudam/derrubam, verificações, selos conquistados/disponíveis e
 * recomendações para melhorar. Fonte única: rep_user_dashboard() (RLS + guarda:
 * cada usuário só vê a si mesmo).
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck, Loader2, TrendingUp, BadgeCheck, CircleAlert,
  ChevronLeft, Award, Lock, ListChecks,
} from "lucide-react";

const NIVEL_META: Record<string, { label: string; cls: string; anel: string }> = {
  elite: { label: "Elite", cls: "bg-violet-100 text-violet-700", anel: "text-violet-500" },
  excelente: { label: "Excelente", cls: "bg-emerald-100 text-emerald-700", anel: "text-emerald-500" },
  confiavel: { label: "Confiável", cls: "bg-sky-100 text-sky-700", anel: "text-sky-500" },
  regular: { label: "Regular", cls: "bg-zinc-100 text-zinc-600", anel: "text-zinc-400" },
  atencao: { label: "Atenção", cls: "bg-amber-100 text-amber-700", anel: "text-amber-500" },
  alto_risco: { label: "Alto Risco", cls: "bg-red-100 text-red-700", anel: "text-red-500" },
};

const PILAR_LABEL: Record<string, string> = {
  cadastro: "Cadastro", verificacao: "Verificação", financeiro: "Financeiro",
  comprador: "Comprador", vendedor: "Vendedor", leilao: "Leilões", risco: "Risco",
};

const VERIF_LABEL: Record<string, string> = {
  email: "E-mail", telefone: "Telefone", documento: "Documento", facial: "Facial", identidade: "Identidade (IA)",
};

export default function MinhaReputacao() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["minha-reputacao"],
    queryFn: async () => {
      const { data: d, error: e } = await (supabase.rpc as any)("rep_user_dashboard");
      if (e) throw new Error(e.message);
      return d;
    },
  });

  const score = data?.score || {};
  const nivel = NIVEL_META[score.nivel] || NIVEL_META.regular;
  const fatores = (score.fatores || []) as any[];
  const historico = (data?.historico || []) as any[];
  const verificacoes = data?.verificacoes || {};
  const selos = data?.selos || { conquistados: [], disponiveis: [] };
  const recs = ((data?.recomendacoes || []) as any[]).filter((r) => r.status === "aberta"
    && ["verificacao_adicional", "destacar_perfil"].includes(r.tipo));
  const trust = Number(score.trust_score ?? 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white text-zinc-900">
      <div className="mx-auto max-w-2xl px-4 py-6">

        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm font-bold text-zinc-500 hover:text-zinc-800">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </button>

        {isLoading && <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>}
        {error && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-700">
            Faça login para ver a sua reputação.
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* SCORE HERO */}
            <div className="rounded-3xl bg-white p-6 text-center shadow-xl ring-1 ring-zinc-100">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50">
                <ShieldCheck className="h-7 w-7 text-sky-500" />
              </div>
              <h1 className="mt-2 text-xl font-black">Minha Reputação</h1>
              <p className="text-xs text-zinc-400">Trust Score Viagg-TX8 · atualizado {score.computed_at ? new Date(score.computed_at).toLocaleString("pt-BR") : "—"}</p>

              <div className="relative mx-auto mt-4 h-36 w-36">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  <circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" className="stroke-zinc-100" />
                  <circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" strokeLinecap="round"
                    className={`stroke-current ${nivel.anel}`}
                    strokeDasharray={`${(trust / 100) * 326.7} 326.7`} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-4xl font-black">{trust.toFixed(0)}</p>
                  <p className="text-[10px] font-bold text-zinc-400">de 100</p>
                </div>
              </div>
              <span className={`mt-3 inline-block rounded-full px-4 py-1 text-sm font-black uppercase ${nivel.cls}`}>{nivel.label}</span>
            </div>

            {/* EVOLUÇÃO */}
            {historico.length > 1 && (
              <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-zinc-700"><TrendingUp className="h-4 w-4 text-sky-500" /> Evolução</h3>
                <div className="flex items-end gap-1" style={{ minHeight: 70 }}>
                  {historico.slice(-30).map((h: any) => (
                    <div key={h.dia} className="flex-1" title={`${h.dia}: ${h.trust_score}`}>
                      <div className="mx-auto w-full max-w-[20px] rounded-t bg-sky-400/70" style={{ height: `${Math.max(Number(h.trust_score) * 0.7, 4)}px` }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FATORES */}
            <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
              <h3 className="mb-3 text-sm font-black text-zinc-700">O que compõe o seu score</h3>
              <div className="space-y-2">
                {fatores.map((f: any) => {
                  const presente = !!f.presente;
                  const sub = f.subscore != null ? Number(f.subscore) : null;
                  return (
                    <div key={f.pilar} className="rounded-2xl bg-zinc-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-zinc-700">{PILAR_LABEL[f.pilar] || f.pilar}</p>
                        {presente && sub != null ? (
                          <p className={`text-sm font-black ${sub >= 70 ? "text-emerald-600" : sub >= 50 ? "text-amber-600" : "text-red-600"}`}>{sub.toFixed(0)}</p>
                        ) : (
                          <span className="text-[10px] font-bold uppercase text-zinc-400">sem histórico ainda</span>
                        )}
                      </div>
                      {presente && sub != null && (
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                          <div className={`h-full rounded-full ${sub >= 70 ? "bg-emerald-500" : sub >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${sub}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* VERIFICAÇÕES */}
            <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
              <h3 className="mb-3 text-sm font-black text-zinc-700">Verificações</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(VERIF_LABEL).map(([key, label]) => {
                  const st = verificacoes?.[key]?.status || "pendente";
                  const ok = st === "verificado" || st === "informado" || st === "avaliado";
                  const indisponivel = st === "indisponivel";
                  return (
                    <div key={key} className={`rounded-2xl px-3 py-2 text-center ${indisponivel ? "bg-zinc-50 text-zinc-400" : ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {indisponivel ? <Lock className="mx-auto h-4 w-4" /> : ok ? <BadgeCheck className="mx-auto h-4 w-4" /> : <CircleAlert className="mx-auto h-4 w-4" />}
                      <p className="mt-1 text-[11px] font-bold">{label}</p>
                      <p className="text-[9px] font-semibold uppercase opacity-70">{indisponivel ? "em breve" : st}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SELOS */}
            <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-zinc-700"><Award className="h-4 w-4 text-amber-500" /> Selos e conquistas</h3>
              {(selos.conquistados || []).length === 0 && (
                <p className="mb-2 text-xs text-zinc-400">Você ainda não conquistou selos — veja abaixo como ganhar.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {(selos.conquistados || []).map((b: any) => (
                  <span key={b.badge_key} title={b.descricao} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                    <span>{b.icone}</span> {b.nome}
                  </span>
                ))}
              </div>
              {(selos.disponiveis || []).length > 0 && (
                <>
                  <p className="mb-1.5 mt-3 text-[11px] font-bold uppercase text-zinc-400">Disponíveis para conquistar</p>
                  <div className="flex flex-wrap gap-2">
                    {(selos.disponiveis || []).map((b: any) => (
                      <span key={b.badge_key} title={b.descricao} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-400 ring-1 ring-zinc-200">
                        <span className="grayscale">{b.icone}</span> {b.nome}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* COMO MELHORAR */}
            <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-zinc-700"><ListChecks className="h-4 w-4 text-sky-500" /> Como melhorar seu score</h3>
              <ul className="space-y-1.5 text-sm text-zinc-600">
                {verificacoes?.documento?.status !== "informado" && <li>• Complete seu documento (CPF/CNPJ) no perfil.</li>}
                {verificacoes?.email?.status !== "verificado" && <li>• Confirme o seu e-mail.</li>}
                {verificacoes?.telefone?.status === "pendente" && <li>• Informe um telefone/WhatsApp.</li>}
                <li>• Conclua negociações e pague em dia — pagamentos aprovados elevam o pilar financeiro.</li>
                <li>• Anúncios com foto e descrição completa elevam o pilar vendedor.</li>
                <li>• Participe de leilões e honre seus arremates.</li>
                {recs.map((r: any) => <li key={r.criado_em}>• {r.titulo}</li>)}
              </ul>
            </div>

            <p className="mt-6 pb-8 text-center text-[10px] text-zinc-400">
              Score explicável calculado só com dados reais da sua conta · Viagg-TX8 · ninguém é bloqueado automaticamente
            </p>
          </>
        )}
      </div>
    </div>
  );
}
