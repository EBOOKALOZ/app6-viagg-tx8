import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileCheck, Info, Shield } from "lucide-react";

type LegalDoc = {
  id: string;
  code: string;
  version: number;
  title: string;
  content: string;
  is_active: boolean;
  created_at?: string;
  effective_at?: string;
};

type PendingRow = {
  document_id: string;
};

export default function AceitePage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [docsById, setDocsById] = useState<Record<string, LegalDoc>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const [expanded, setExpanded] = useState(false);
  const [canAccept, setCanAccept] = useState(false);

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);

  const total = pendingIds.length;
  const currentId = pendingIds[currentIndex];
  const currentDoc = currentId ? docsById[currentId] : null;

  const progressPct = useMemo(() => {
    if (!total) return 0;
    return Math.round(((currentIndex + 1) / total) * 100);
  }, [currentIndex, total]);

  // 1) Carrega pendências (backend-driven)
  async function loadPending() {
    setLoading(true);
    setExpanded(false);
    setCanAccept(false);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      // Sem auth -> manda pro login (ajuste a rota conforme seu projeto)
      navigate("/login");
      return;
    }

    const { data, error } = await supabase.rpc("check_pending_documents");
    if (error) {
      console.error("check_pending_documents error:", error);
      // Se o RPC falhar, não dá pra liberar o app com segurança:
      // Força permanecer aqui e mostrar erro.
      setPendingIds([]);
      setLoading(false);
      return;
    }

    const rows = (data || []) as PendingRow[];
    const ids = rows.map((r) => r.document_id);

    // Sem pendências -> libera app
    if (ids.length === 0) {
      navigate("/");
      return;
    }

    setPendingIds(ids);
    setCurrentIndex(0);

    // 2) Buscar docs pendentes (de uma vez)
    const { data: docs, error: docsErr } = await supabase
      .from("legal_documents")
      .select("id, code, version, title, content, is_active, created_at, effective_at")
      .in("id", ids);

    if (docsErr) {
      console.error("Fetch legal_documents error:", docsErr);
      setLoading(false);
      return;
    }

    const map: Record<string, LegalDoc> = {};
    (docs || []).forEach((d: any) => (map[d.id] = d));
    setDocsById(map);

    setLoading(false);
  }

  useEffect(() => {
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset de gating quando muda documento
  useEffect(() => {
    setExpanded(false);
    setCanAccept(false);

    // scroll para o topo da caixa
    if (scrollBoxRef.current) {
      scrollBoxRef.current.scrollTop = 0;
    }
  }, [currentId]);

  // 3) Scroll obrigatório até o fim OU expandir documento completo
  function handleScroll() {
    const el = scrollBoxRef.current;
    if (!el) return;

    // "chegou no fim" com folga
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (nearBottom) setCanAccept(true);
  }

  function handleExpand() {
    setExpanded(true);
    // regra do ACEITO: expandir habilita o botão (alternativa ao scroll)
    setCanAccept(true);
  }

  // 4) Registrar aceite (mínimo seguro: user_id + document_id)
  async function handleAccept() {
    if (!currentDoc || submitting) return;

    setSubmitting(true);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      navigate("/login");
      return;
    }

    const user_id = authData.user.id;

    // Aceite mínimo (evita erro se seu schema ainda não tiver colunas extras)
    const payload: any = {
      user_id,
      document_id: currentDoc.id,
    };

    // Se você já criou as colunas extras, pode ativar isto depois:
    // payload.user_agent = navigator.userAgent;
    // payload.acceptance_method = expanded ? "expanded" : "scroll";
    // payload.accepted_timezone = "America/Sao_Paulo";

    const { error: insErr } = await supabase.from("user_legal_acceptances").insert(payload);

    if (insErr) {
      // Se for duplicado (já aceitou), segue em frente sem travar o usuário
      // Postgres unique violation = 23505 (às vezes vem como string dentro)
      const msg = String(insErr.message || "");
      if (!msg.includes("duplicate") && !msg.includes("23505")) {
        console.error("Insert acceptance error:", insErr);
        setSubmitting(false);
        return;
      }
    }

    // Recarrega pendências do backend para garantir estado real
    const { data: after, error: afterErr } = await supabase.rpc("check_pending_documents");
    if (afterErr) {
      console.error("Recheck pending error:", afterErr);
      // Mesmo assim tenta avançar localmente (não ideal, mas não trava total)
      if (currentIndex + 1 < total) setCurrentIndex((i) => i + 1);
      else navigate("/");
      setSubmitting(false);
      return;
    }

    const rows = (after || []) as PendingRow[];
    const ids = rows.map((r) => r.document_id);

    if (ids.length === 0) {
      navigate("/");
      setSubmitting(false);
      return;
    }

    setPendingIds(ids);

    // Mantém o próximo, se existir
    const nextIndex = Math.min(currentIndex, ids.length - 1);
    setCurrentIndex(nextIndex);

    // Atualiza docs se tiver alguma mudança
    const missing = ids.filter((id) => !docsById[id]);
    if (missing.length > 0) {
      const { data: newDocs } = await supabase
        .from("legal_documents")
        .select("id, code, version, title, content, is_active, created_at, effective_at")
        .in("id", missing);

      const updated = { ...docsById };
      (newDocs || []).forEach((d: any) => (updated[d.id] = d));
      setDocsById(updated);
    }

    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <div className="text-sm text-muted-foreground">Carregando documentos pendentes…</div>
      </div>
    );
  }

  // Se deu algum problema e ficou sem doc carregado
  if (!currentDoc) {
    return (
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">
              Conteúdo não disponível. Verifique se existem documentos ativos em <code>legal_documents</code> e se o RPC{" "}
              <code>check_pending_documents()</code> está retornando IDs válidos.
            </div>
            <div className="mt-4">
              <Button onClick={loadPending}>Tentar novamente</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <FileCheck className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Aceite de Termos</h1>
          <p className="text-sm text-muted-foreground">
            Documento {currentIndex + 1} de {total} • {progressPct}%
          </p>
        </div>
      </div>

      {/* Progresso */}
      <div className="mb-6">
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div className="h-2 bg-primary" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Card da regra */}
      <Card className="border-primary/20 bg-primary/5 mb-6">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-foreground mb-2">Regra Fundamental</h2>
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">
                  Você só prossegue após o aceite consciente do documento vigente.
                </strong>
              </p>
              <ul className="mt-3 text-sm text-muted-foreground space-y-1">
                <li>• Sem aceite, sem acesso</li>
                <li>• Sem aceite, sem execução de serviço</li>
                <li>• Aceite registrado digitalmente</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documento */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3">
            <div className="text-lg font-semibold text-foreground">{currentDoc.title}</div>
            <div className="text-xs text-muted-foreground">
              Código: <span className="font-mono">{currentDoc.code}</span> • Versão:{" "}
              <span className="font-mono">{currentDoc.version}</span>
            </div>
          </div>

          {/* Caixa de leitura (scroll obrigatório) */}
          <div
            ref={scrollBoxRef}
            onScroll={handleScroll}
            className={[
              "border rounded-lg p-4 bg-background",
              expanded ? "max-h-[70vh] overflow-auto" : "max-h-[320px] overflow-auto",
            ].join(" ")}
          >
            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">{currentDoc.content}</div>
          </div>

          {/* Ações do documento */}
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex gap-2 flex-wrap">
              <Button type="button" variant="secondary" onClick={handleExpand} disabled={expanded}>
                {expanded ? "Documento expandido" : "Expandir documento completo"}
              </Button>

              <Button type="button" onClick={handleAccept} disabled={!canAccept || submitting}>
                {submitting ? "Registrando aceite…" : "ACEITO"}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Para habilitar o botão, role até o final do documento <strong>ou</strong> clique em “Expandir documento
              completo”.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nota informativa */}
      <Card className="bg-muted/50 mt-6">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Este fluxo é versionado. Se houver nova versão de qualquer documento, você será solicitado a aceitar
              novamente.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
        <p>Se tiver dúvidas, contate o suporte.</p>
      </div>
    </div>
  );
}
