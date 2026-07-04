import { DAY_MS, PRICE_CEILING, validate } from "./validate";

const ok = () => ({
  bourbonId: "b1",
  storeName: "Total Wine",
  price: 45,
});

describe("validate (logSighting input)", () => {
  it("accepts valid input and defaults date + visibility", () => {
    const before = Date.now();
    const v = validate(ok());
    expect(v.bourbonId).toBe("b1");
    expect(v.storeName).toBe("Total Wine");
    expect(v.price).toBe(45);
    expect(v.visibility).toBe("private");
    expect(v.sightingDateMillis).toBeGreaterThanOrEqual(before);
  });

  it("preserves an explicit friends visibility and past date", () => {
    const when = Date.now() - DAY_MS;
    const v = validate({ ...ok(), visibility: "friends", sightingDateMillis: when });
    expect(v.visibility).toBe("friends");
    expect(v.sightingDateMillis).toBe(when);
  });

  it("coerces an unknown visibility to private", () => {
    expect(validate({ ...ok(), visibility: "public" }).visibility).toBe("private");
  });

  it("requires a bottle id", () => {
    expect(() => validate({ storeName: "S", price: 10 })).toThrow(
      "A bottle is required."
    );
  });

  it("requires a store name within the length cap", () => {
    expect(() => validate({ bourbonId: "b1", price: 10 })).toThrow("Store name");
    expect(() =>
      validate({ ...ok(), storeName: "x".repeat(121) })
    ).toThrow("Store name");
  });

  it("rejects non-positive, non-numeric, or over-ceiling prices", () => {
    expect(() => validate({ ...ok(), price: 0 })).toThrow("Price");
    expect(() => validate({ ...ok(), price: -5 })).toThrow("Price");
    expect(() =>
      validate({ ...ok(), price: undefined as unknown as number })
    ).toThrow("Price");
    expect(() => validate({ ...ok(), price: PRICE_CEILING + 1 })).toThrow(
      "Price"
    );
  });

  it("rejects a future sighting date", () => {
    expect(() =>
      validate({ ...ok(), sightingDateMillis: Date.now() + 3 * DAY_MS })
    ).toThrow("future");
  });

  it("rejects over-long city/state/notes", () => {
    expect(() => validate({ ...ok(), city: "x".repeat(81) })).toThrow("too long");
    expect(() => validate({ ...ok(), state: "x".repeat(81) })).toThrow(
      "too long"
    );
    expect(() => validate({ ...ok(), notes: "x".repeat(501) })).toThrow(
      "too long"
    );
  });

  it("allows null optional fields", () => {
    expect(() =>
      validate({ ...ok(), city: null, state: null, notes: null })
    ).not.toThrow();
  });
});
