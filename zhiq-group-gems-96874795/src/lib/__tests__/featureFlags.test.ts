/**
 * Feature flags — validação das flags de controle.
 * Garante que Doações e Ofertas estão com ações desativadas
 * e que a mensagem padrão está definida.
 */
import { describe, expect, it } from "vitest";
import {
  DONATIONS_ACTIONS_ENABLED,
  OFFERS_ACTIONS_ENABLED,
  DISABLED_ACTION_MESSAGE,
} from "../featureFlags";

describe("featureFlags", () => {
  it("DONATIONS_ACTIONS_ENABLED deve ser false", () => {
    expect(DONATIONS_ACTIONS_ENABLED).toBe(false);
  });

  it("OFFERS_ACTIONS_ENABLED deve ser false", () => {
    expect(OFFERS_ACTIONS_ENABLED).toBe(false);
  });

  it("DISABLED_ACTION_MESSAGE deve ser uma string não vazia", () => {
    expect(typeof DISABLED_ACTION_MESSAGE).toBe("string");
    expect(DISABLED_ACTION_MESSAGE.length).toBeGreaterThan(0);
  });
});
