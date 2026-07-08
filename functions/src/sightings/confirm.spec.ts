import { HttpsError } from "firebase-functions/v2/https";

import { assessVote, CONFIRM_RADIUS_M, voteDeltas } from "./confirm";

const SPOT = { lat: 38.2527, lng: -85.7585 };

const sighting = (over: Partial<Parameters<typeof assessVote>[1]> = {}) => ({
  spotterUid: "spotter",
  visibility: "friends",
  lat: SPOT.lat,
  lng: SPOT.lng,
  ...over,
});

const atStore = { lat: SPOT.lat, lng: SPOT.lng };

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as HttpsError).code;
  }
  return "none";
}

describe("assessVote", () => {
  it("accepts an on-site friend's confirm and dispute", () => {
    expect(assessVote("v1", sighting(), "confirm", atStore, true)).toBe(
      "confirm"
    );
    expect(assessVote("v1", sighting(), "dispute", atStore, true)).toBe(
      "dispute"
    );
  });

  it("rejects unknown verdicts", () => {
    expect(codeOf(() => assessVote("v1", sighting(), "maybe", atStore, true))).toBe(
      "invalid-argument"
    );
    expect(
      codeOf(() => assessVote("v1", sighting(), undefined, atStore, true))
    ).toBe("invalid-argument");
  });

  it("rejects self-votes", () => {
    expect(
      codeOf(() => assessVote("spotter", sighting(), "confirm", atStore, true))
    ).toBe("failed-precondition");
  });

  it("hides private or non-friend sightings as not-found", () => {
    expect(
      codeOf(() =>
        assessVote("v1", sighting({ visibility: "private" }), "confirm", atStore, true)
      )
    ).toBe("not-found");
    expect(
      codeOf(() => assessVote("v1", sighting(), "confirm", atStore, false))
    ).toBe("not-found");
  });

  it("rejects sightings without a location", () => {
    expect(
      codeOf(() =>
        assessVote("v1", sighting({ lat: null, lng: null }), "confirm", atStore, true)
      )
    ).toBe("failed-precondition");
  });

  it("requires the voter to be at the store (anti-spoof presence gate)", () => {
    const farAway = { lat: SPOT.lat + 0.05, lng: SPOT.lng }; // ~5.5 km
    expect(
      codeOf(() => assessVote("v1", sighting(), "confirm", farAway, true))
    ).toBe("failed-precondition");
    expect(
      codeOf(() => assessVote("v1", sighting(), "confirm", {}, true))
    ).toBe("failed-precondition");
  });

  it("uses a radius tolerant of two stacked GPS fixes", () => {
    expect(CONFIRM_RADIUS_M).toBeGreaterThanOrEqual(150);
    const nearby = { lat: SPOT.lat + 0.0018, lng: SPOT.lng }; // ~200 m
    expect(assessVote("v1", sighting(), "confirm", nearby, true)).toBe("confirm");
  });
});

describe("voteDeltas", () => {
  it("counts a first vote", () => {
    expect(voteDeltas(null, "confirm")).toEqual({ confirm: 1, dispute: 0 });
    expect(voteDeltas(null, "dispute")).toEqual({ confirm: 0, dispute: 1 });
  });

  it("moves the count when a verdict flips", () => {
    expect(voteDeltas("confirm", "dispute")).toEqual({ confirm: -1, dispute: 1 });
    expect(voteDeltas("dispute", "confirm")).toEqual({ confirm: 1, dispute: -1 });
  });

  it("is idempotent for a repeated verdict", () => {
    expect(voteDeltas("confirm", "confirm")).toEqual({ confirm: 0, dispute: 0 });
  });
});
