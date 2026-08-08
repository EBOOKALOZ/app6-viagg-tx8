/**
 * Cobertura da fatia Doações (Comando Convênio) — service layer.
 * Fecha o P1 da auditoria de 2026-08-07: validação de entrada não deve
 * depender exclusivamente das constraints do banco.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDonation,
  listDonations,
  updateDonationStatus,
  validateDonationInput,
} from "../donations";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

const state = {
  insertResult: { data: null as unknown, error: null as { message: string } | null },
  updateResult: { data: null as unknown, error: null as { message: string } | null },
  selectResult: { data: [] as unknown[], error: null as { message: string } | null },
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        insert: vi.fn(() => builder),
        update: vi.fn(() => builder),
        order: vi.fn(() => builder),
        range: vi.fn(() => Promise.resolve(state.selectResult)),
        eq: vi.fn(() => builder),
        single: vi.fn(() => {
          // insert().select().single() e update().eq().select().single()
          // compartilham o mesmo builder; usamos insertResult como padrão e
          // updateResult quando um update foi chamado por último neste teste.
          return Promise.resolve(builder.__lastOp === "update" ? state.updateResult : state.insertResult);
        }),
        __lastOp: "insert" as "insert" | "update",
      };
      const originalInsert = builder.insert;
      const originalUpdate = builder.update;
      builder.insert = vi.fn((...args) => {
        builder.__lastOp = "insert";
        return originalInsert(...args);
      });
      builder.update = vi.fn((...args) => {
        builder.__lastOp = "update";
        return originalUpdate(...args);
      });
      return builder;
    }),
  },
}));

describe("validateDonationInput", () => {
  it("aceita um payload válido", () => {
    expect(() =>
      validateDonationInput({ donor_name: "Maria", amount: 100, campaign_id: VALID_UUID })
    ).not.toThrow();
  });

  it("rejeita amount zero ou negativo", () => {
    expect(() => validateDonationInput({ donor_name: "Maria", amount: 0 })).toThrow(/maior que zero/);
    expect(() => validateDonationInput({ donor_name: "Maria", amount: -10 })).toThrow(/maior que zero/);
  });

  it("rejeita amount não finito (NaN/Infinity) — cobre Number('') do formulário", () => {
    expect(() => validateDonationInput({ donor_name: "Maria", amount: Number("") })).toThrow();
    expect(() => validateDonationInput({ donor_name: "Maria", amount: Infinity })).toThrow(/finito/);
  });

  it("rejeita amount acima do limite máximo", () => {
    expect(() => validateDonationInput({ donor_name: "Maria", amount: 2_000_000 })).toThrow(/excede/);
  });

  it("rejeita donor_name vazio (string em branco) mas aceita null (anônimo)", () => {
    expect(() => validateDonationInput({ donor_name: "   ", amount: 50 })).toThrow(/vazio/);
    expect(() => validateDonationInput({ donor_name: null, amount: 50, is_anonymous: true })).not.toThrow();
  });

  it("rejeita donor_name acima de 200 caracteres", () => {
    expect(() => validateDonationInput({ donor_name: "a".repeat(201), amount: 50 })).toThrow(/excede/);
  });

  it("rejeita campaign_id que não é UUID", () => {
    expect(() => validateDonationInput({ donor_name: "Maria", amount: 50, campaign_id: "not-a-uuid" })).toThrow(
      /inválido/
    );
  });

  it("aceita campaign_id nulo (campanha opcional)", () => {
    expect(() => validateDonationInput({ donor_name: "Maria", amount: 50, campaign_id: null })).not.toThrow();
  });

  it("rejeita status fora do enum da máquina de estados", () => {
    expect(() =>
      validateDonationInput({ donor_name: "Maria", amount: 50, status: "aprovada" as never })
    ).toThrow();
  });
});

describe("createDonation", () => {
  beforeEach(() => {
    state.insertResult = { data: { id: VALID_UUID, amount: 50 }, error: null };
  });

  it("rejeita entrada inválida antes de qualquer chamada ao banco", async () => {
    await expect(createDonation({ donor_name: "Maria", amount: -5 })).rejects.toThrow(/maior que zero/);
  });

  it("propaga erro do banco com mensagem padronizada", async () => {
    state.insertResult = { data: null, error: { message: "constraint violation" } };
    await expect(createDonation({ donor_name: "Maria", amount: 50 })).rejects.toThrow(
      /Falha ao registrar doação: constraint violation/
    );
  });

  it("aceita payload válido e retorna o registro criado", async () => {
    const result = await createDonation({ donor_name: "Maria", amount: 50 });
    expect(result).toEqual({ id: VALID_UUID, amount: 50 });
  });
});

describe("updateDonationStatus", () => {
  beforeEach(() => {
    state.updateResult = { data: { id: VALID_UUID, status: "confirmada" }, error: null };
  });

  it("rejeita id que não é UUID", async () => {
    await expect(
      updateDonationStatus({ id: "not-a-uuid", from: "registrada", to: "confirmada" })
    ).rejects.toThrow(/ID de doação inválido/);
  });

  it("rejeita transição inválida (estornada é terminal)", async () => {
    await expect(
      updateDonationStatus({ id: VALID_UUID, from: "estornada", to: "confirmada" })
    ).rejects.toThrow(/Transição de status inválida/);
  });

  it("rejeita salto de estado (registrada → confirmada é válido, mas confirmada não volta a registrada)", async () => {
    await expect(
      updateDonationStatus({ id: VALID_UUID, from: "confirmada", to: "registrada" })
    ).rejects.toThrow(/Transição de status inválida/);
  });

  it("propaga erro do banco com mensagem padronizada", async () => {
    state.updateResult = { data: null, error: { message: "row not found" } };
    await expect(
      updateDonationStatus({ id: VALID_UUID, from: "registrada", to: "confirmada" })
    ).rejects.toThrow(/Falha ao mudar status da doação: row not found/);
  });

  it("aceita transição válida e retorna o registro atualizado", async () => {
    const result = await updateDonationStatus({ id: VALID_UUID, from: "registrada", to: "confirmada" });
    expect(result).toEqual({ id: VALID_UUID, status: "confirmada" });
  });
});

describe("listDonations", () => {
  it("propaga erro do banco com mensagem padronizada", async () => {
    state.selectResult = { data: null as unknown as unknown[], error: { message: "timeout" } };
    await expect(listDonations(0)).rejects.toThrow(/Falha ao carregar doações: timeout/);
  });

  it("mapeia campaign_title a partir do join e calcula hasMore", async () => {
    state.selectResult = {
      data: [{ id: VALID_UUID, amount: 10, convenio_campaigns: { title: "Campanha X" } }],
      error: null,
    };
    const page = await listDonations(0);
    expect(page.rows[0]).toEqual({ id: VALID_UUID, amount: 10, campaign_title: "Campanha X" });
    expect(page.hasMore).toBe(false);
  });
});
