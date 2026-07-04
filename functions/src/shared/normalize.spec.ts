import { normalizeBottleName } from "./normalize";

describe("normalizeBottleName", () => {
  it("lowercases and trims", () => {
    expect(normalizeBottleName("  Buffalo Trace  ")).toBe("buffalo trace");
  });

  it("strips apostrophes/quotes/periods so variants collapse", () => {
    expect(normalizeBottleName("Blanton's Single Barrel")).toBe(
      "blantons single barrel"
    );
    expect(normalizeBottleName("E.H. Taylor")).toBe("eh taylor");
    expect(normalizeBottleName("Blanton’s")).toBe("blantons"); // curly quote
  });

  it("folds diacritics", () => {
    expect(normalizeBottleName("Jose Cué́rvo")).toBe("jose cuervo");
  });

  it("collapses punctuation and whitespace to single spaces", () => {
    expect(normalizeBottleName("Weller  12 - Year!!")).toBe("weller 12 year");
  });

  it("returns empty string for nullish/empty input", () => {
    expect(normalizeBottleName("")).toBe("");
    expect(normalizeBottleName(undefined as unknown as string)).toBe("");
    expect(normalizeBottleName(null as unknown as string)).toBe("");
  });
});
