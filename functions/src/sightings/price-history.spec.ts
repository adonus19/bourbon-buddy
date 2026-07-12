import { Timestamp } from "firebase-admin/firestore";

import {
  priceHistoryPoint,
  priceHistoryPointFromSighting,
} from "./price-history";
import { ValidatedSighting } from "./validate";

const validated = (over: Partial<ValidatedSighting> = {}): ValidatedSighting => ({
  bourbonId: "b1",
  storeName: "Total Wine",
  price: 45,
  sightingDateMillis: 1_700_000_000_000,
  visibility: "private",
  lat: null,
  lng: null,
  clientId: null,
  store: null,
  ...over,
});

describe("priceHistoryPoint (live path)", () => {
  it("maps a validated sighting + raw data into a durable point", () => {
    const created = Timestamp.fromMillis(1_700_000_100_000);
    const p = priceHistoryPoint(
      validated(),
      { city: "Charlotte", state: "NC", notes: "n/a" },
      "u1",
      "s1",
      created
    );
    expect(p).toEqual({
      bourbonId: "b1",
      price: 45,
      sightingDate: Timestamp.fromMillis(1_700_000_000_000),
      storeName: "Total Wine",
      city: "Charlotte",
      state: "NC",
      spotterUid: "u1",
      visibility: "private",
      sourceSightingId: "s1",
      createdAt: created,
    });
  });

  it("copies friends visibility and defaults missing city/state to null", () => {
    const p = priceHistoryPoint(
      validated({ visibility: "friends" }),
      {},
      "u1",
      "s1",
      Timestamp.now()
    );
    expect(p.visibility).toBe("friends");
    expect(p.city).toBeNull();
    expect(p.state).toBeNull();
  });

  it("never carries notes — price history is a price record, not a notes store", () => {
    const p = priceHistoryPoint(
      validated(),
      { notes: "secret" },
      "u1",
      "s1",
      Timestamp.now()
    );
    expect(p).not.toHaveProperty("notes");
  });

  it("links back to the source sighting", () => {
    const p = priceHistoryPoint(validated(), {}, "u1", "sighting-42", Timestamp.now());
    expect(p.sourceSightingId).toBe("sighting-42");
  });
});

describe("priceHistoryPointFromSighting (backfill)", () => {
  it("derives a point from an existing sighting doc, keyed to that sighting", () => {
    const created = Timestamp.fromMillis(1_699_000_000_000);
    const p = priceHistoryPointFromSighting("s9", {
      bourbonId: "b2",
      price: 80,
      sightingDate: created,
      storeName: "ABC Store",
      city: "Raleigh",
      state: "NC",
      spotterUid: "u2",
      visibility: "friends",
      createdAt: created,
    });
    expect(p.sourceSightingId).toBe("s9");
    expect(p.bourbonId).toBe("b2");
    expect(p.price).toBe(80);
    expect(p.visibility).toBe("friends");
    expect(p.createdAt).toBe(created);
  });

  it("is idempotent: same sighting → identical point (preserves createdAt)", () => {
    const created = Timestamp.fromMillis(1_698_000_000_000);
    const s = {
      bourbonId: "b",
      price: 10,
      sightingDate: created,
      storeName: "S",
      spotterUid: "u",
      visibility: "private",
      createdAt: created,
    };
    const a = priceHistoryPointFromSighting("id", s);
    const b = priceHistoryPointFromSighting("id", s);
    expect(a).toEqual(b);
    expect(a.createdAt).toBe(created);
  });

  it("defaults visibility to private when the sighting lacks one", () => {
    const p = priceHistoryPointFromSighting("id", {
      bourbonId: "b",
      price: 10,
      sightingDate: Timestamp.now(),
      spotterUid: "u",
      createdAt: Timestamp.now(),
    });
    expect(p.visibility).toBe("private");
  });

  it("defaults a missing storeName to null", () => {
    const p = priceHistoryPointFromSighting("id", {
      bourbonId: "b",
      price: 10,
      sightingDate: Timestamp.now(),
      spotterUid: "u",
      visibility: "private",
      createdAt: Timestamp.now(),
    });
    expect(p.storeName).toBeNull();
  });
});
