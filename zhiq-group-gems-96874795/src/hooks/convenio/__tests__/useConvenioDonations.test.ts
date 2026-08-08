/**
 * Cobertura da fatia Doações (Comando Convênio) — invalidação de cache.
 * Sem @testing-library/react no projeto (nenhum hook é testado via
 * renderHook hoje); QueryClient é puro JS, então testamos a função de
 * invalidação diretamente, que é a lógica não-trivial do hook.
 */
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { KEY, invalidateDonationDependents } from "../useConvenioDonations";

function seedQuery(queryClient: QueryClient, key: unknown[]) {
  queryClient.setQueryData(key, { seeded: true });
}

describe("invalidateDonationDependents", () => {
  it("invalida donations, campaigns, dashboard-stats e public juntos", () => {
    const queryClient = new QueryClient();
    const dependentKeys = [
      KEY,
      ["convenio", "campaigns"],
      ["convenio", "dashboard-stats"],
      ["convenio", "public"],
    ];
    dependentKeys.forEach((key) => seedQuery(queryClient, key));

    invalidateDonationDependents(queryClient);

    dependentKeys.forEach((key) => {
      const state = queryClient.getQueryState(key);
      expect(state?.isInvalidated).toBe(true);
    });
  });

  it("não invalida queries de outros domínios não relacionados", () => {
    const queryClient = new QueryClient();
    seedQuery(queryClient, ["convenio", "entities"]);

    invalidateDonationDependents(queryClient);

    const state = queryClient.getQueryState(["convenio", "entities"]);
    expect(state?.isInvalidated ?? false).toBe(false);
  });
});
