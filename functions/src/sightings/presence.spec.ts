import { isPresenceVerified, PRESENCE_RADIUS_M } from "./presence";

describe("isPresenceVerified", () => {
  // ~111,320 m per degree of latitude ⇒ 0.001° ≈ 111 m.
  const store = { lat: 38.2527, lng: -85.7585 }; // Louisville

  it("verifies a user standing at the store", () => {
    expect(isPresenceVerified({ lat: store.lat, lng: store.lng }, store)).toBe(
      true
    );
  });

  it("verifies within the presence radius", () => {
    const user = { lat: store.lat + 0.001, lng: store.lng }; // ~111 m north
    expect(isPresenceVerified(user, store)).toBe(true);
  });

  it("rejects a user beyond the radius", () => {
    const user = { lat: store.lat + 0.01, lng: store.lng }; // ~1.1 km north
    expect(isPresenceVerified(user, store)).toBe(false);
  });

  it("rejects when the user has no coordinates", () => {
    expect(isPresenceVerified({ lat: null, lng: null }, store)).toBe(false);
    expect(isPresenceVerified({ lat: store.lat, lng: null }, store)).toBe(false);
  });

  it("rejects when no store was picked", () => {
    expect(isPresenceVerified({ lat: store.lat, lng: store.lng }, null)).toBe(
      false
    );
    expect(
      isPresenceVerified({ lat: store.lat, lng: store.lng }, undefined)
    ).toBe(false);
  });

  it("honors a custom radius", () => {
    const user = { lat: store.lat + 0.001, lng: store.lng }; // ~111 m
    expect(isPresenceVerified(user, store, 50)).toBe(false);
  });

  it("exports a tolerance that covers GPS drift but not across-town", () => {
    expect(PRESENCE_RADIUS_M).toBeGreaterThanOrEqual(50);
    expect(PRESENCE_RADIUS_M).toBeLessThanOrEqual(300);
  });
});
