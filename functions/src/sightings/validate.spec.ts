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

  describe("clientId idempotency key (BB-182)", () => {
    it("defaults to null when absent", () => {
      expect(validate(ok()).clientId).toBeNull();
    });

    it("accepts a doc-id-safe token", () => {
      const id = "8f1c2b3a-0d4e-4f56-9abc-1234567890ab";
      expect(validate({ ...ok(), clientId: id }).clientId).toBe(id);
    });

    it("rejects an over-long or illegal client id", () => {
      expect(() => validate({ ...ok(), clientId: "x".repeat(65) })).toThrow(
        "client id"
      );
      expect(() => validate({ ...ok(), clientId: "bad/id" })).toThrow(
        "client id"
      );
      expect(() => validate({ ...ok(), clientId: "" })).toThrow("client id");
    });
  });

  describe("location (BB-177)", () => {
    it("stores null coordinates when none are provided", () => {
      const v = validate(ok());
      expect(v.lat).toBeNull();
      expect(v.lng).toBeNull();
    });

    it("accepts a valid coordinate pair", () => {
      const v = validate({ ...ok(), lat: 42.6, lng: -5.6 });
      expect(v.lat).toBe(42.6);
      expect(v.lng).toBe(-5.6);
    });

    it("rejects out-of-range or half-supplied coordinates", () => {
      expect(() => validate({ ...ok(), lat: 999, lng: 0 })).toThrow("location");
      expect(() => validate({ ...ok(), lat: 42.6, lng: 200 })).toThrow(
        "location"
      );
      expect(() => validate({ ...ok(), lat: 42.6 })).toThrow("location");
    });
  });
});
