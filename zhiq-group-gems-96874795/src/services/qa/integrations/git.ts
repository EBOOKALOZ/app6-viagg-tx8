/**
 * ORION-QA Fase 3 — integração Git.
 *
 * Associa problemas a commit, branch, pull request, autor e data sem
 * alterar o schema de qa_issues: o commit vai para a coluna nativa
 * commit_hash e o restante para metadata.git (JSONB). A atualização dispara
 * o trigger server-side que emite issue.updated no Event Bus.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { QaGitRef } from "../events/types";
import { qaIntegrations } from "./registry";

qaIntegrations.register({
  source: "git",
  label: "Git (commit/branch/PR)",
  version: "1.0",
  status: "ativa",
  captures: [
    "Commit associado ao problema",
    "Branch e pull request",
    "Autor e data",
  ],
});

export interface QaGitLink extends QaGitRef {
  committedAt?: string;
}

/** Metadado serializável gravado em qa_issues.metadata.git. */
export function buildGitMetadata(git: QaGitLink): Record<string, Json> {
  return {
    commit_hash: git.commitHash ?? null,
    branch: git.branch ?? null,
    pull_request: git.pullRequest ?? null,
    author: git.author ?? null,
    committed_at: git.committedAt ?? null,
  };
}

/**
 * Associa um problema da Central a referências Git. Preserva o metadata
 * existente (merge raso em metadata.git).
 */
export async function linkIssueToGit(issueId: string, git: QaGitLink): Promise<void> {
  const { data, error } = await supabase
    .from("qa_issues")
    .select("metadata")
    .eq("id", issueId)
    .single();
  if (error) throw error;

  const current =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? data.metadata
      : {};

  const { error: updateError } = await supabase
    .from("qa_issues")
    .update({
      commit_hash: git.commitHash ?? null,
      metadata: { ...current, git: buildGitMetadata(git) },
    })
    .eq("id", issueId);
  if (updateError) throw updateError;
}
