/**
 * @vitest-environment jsdom
 *
 * ORION-480 achado A-3 — dangerouslySetInnerHTML sem sanitização.
 * Garante que o helper central bloqueia XSS (script, on* handlers,
 * javascript: em href) e preserva formatação de texto rico segura.
 *
 * DOMPurify precisa de um DOM real (window/document) para sanitizar —
 * o ambiente padrão do vitest neste projeto é "node", por isso este
 * arquivo declara jsdom isoladamente via docblock em vez de mudar a
 * config global do projeto.
 */
import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../sanitizeHtml";

describe("sanitizeHtml", () => {
  it("remove onerror de <img> (payload clássico de XSS)", () => {
    const dirty = '<img src=x onerror=alert(1)>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("alert(1)");
    // <img> não está na allowlist, então a tag inteira é removida
    expect(clean).not.toContain("<img");
  });

  it("remove tags <script>", () => {
    const dirty = '<p>oi</p><script>alert(document.cookie)</script>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("alert(document.cookie)");
    expect(clean).toContain("<p>oi</p>");
  });

  it("remove handlers on* em tags permitidas", () => {
    const dirty = '<p onclick="alert(1)">clique</p>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("onclick");
    expect(clean).toContain("clique");
  });

  it("bloqueia javascript: em href", () => {
    const dirty = '<a href="javascript:alert(1)">link</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("javascript:");
  });

  it("permite href http(s) normal e reforça rel em target=_blank", () => {
    const dirty = '<a href="https://viagg.com.br" target="_blank">site</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain('href="https://viagg.com.br"');
    expect(clean).toContain("noopener");
    expect(clean).toContain("noreferrer");
  });

  it("preserva formatação simples (strong, ul/li, p)", () => {
    const dirty = "<p>Olá <strong>mundo</strong></p><ul><li>item</li></ul>";
    const clean = sanitizeHtml(dirty);
    expect(clean).toBe(dirty);
  });

  it("remove atributo style com expression/url perigosos", () => {
    const dirty = '<p style="background:url(javascript:alert(1))">x</p>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("style=");
    expect(clean).not.toContain("javascript:");
  });

  it("retorna string vazia para entrada vazia/nula", () => {
    expect(sanitizeHtml("")).toBe("");
    // @ts-expect-error — validação defensiva de runtime para input inesperado
    expect(sanitizeHtml(null)).toBe("");
  });

  it("remove svg/onload (vetor de XSS via SVG)", () => {
    const dirty = '<svg onload=alert(1)></svg>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("onload");
    expect(clean).not.toContain("<svg");
  });
});
