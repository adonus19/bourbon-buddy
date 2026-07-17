import { CriticSignal, upsertCriticSignal } from "./critic-signals";

const ts = (millis: number): { toMillis: () => number } => ({
  toMillis: () => millis,
});

const entry = (over: Partial<CriticSignal> = {}): CriticSignal => ({
  score: null,
  verdict: "positive",
  sourceName: "Whiskey Advocate",
  at: ts(1000),
  ...over,
});

describe("upsertCriticSignal (BB-220)", () => {
  it("adds a new entry keyed by articleId without mutating the input", () => {
    const existing = {};
    const next = upsertCriticSignal(existing, "a1", entry());
    expect(next["a1"].verdict).toBe("positive");
    expect(existing).toEqual({});
  });

  it("overwrites the same article's entry (idempotent re-extraction)", () => {
    const first = upsertCriticSignal({}, "a1", entry({ verdict: "mixed" }));
    const next = upsertCriticSignal(first, "a1", entry({ verdict: "positive" }));
    expect(Object.keys(next)).toEqual(["a1"]);
    expect(next["a1"].verdict).toBe("positive");
  });

  it("preserves an existing score when the new entry carries none", () => {
    // BB-221 fills scores into these entries; a later BB-220-style re-extraction
    // (verdict only) must not clobber them.
    const withScore = upsertCriticSignal({}, "a1", entry({ score: 92 }));
    const next = upsertCriticSignal(withScore, "a1", entry({ score: null }));
    expect(next["a1"].score).toBe(92);
    const rescored = upsertCriticSignal(withScore, "a1", entry({ score: 88 }));
    expect(rescored["a1"].score).toBe(88);
  });

  it("evicts the oldest entries beyond the cap", () => {
    let map: Record<string, CriticSignal> = {};
    for (let i = 0; i < 5; i++) {
      map = upsertCriticSignal(map, `a${i}`, entry({ at: ts(i) }), 3);
    }
    // a0 and a1 (oldest) are gone; the three newest remain.
    expect(Object.keys(map).sort()).toEqual(["a2", "a3", "a4"]);
  });

  it("keeps the updated entry even when it is the oldest by timestamp", () => {
    let map: Record<string, CriticSignal> = {};
    for (let i = 0; i < 3; i++) {
      map = upsertCriticSignal(map, `a${i}`, entry({ at: ts(i + 10) }), 3);
    }
    const next = upsertCriticSignal(map, "a0", entry({ at: ts(5) }), 3);
    expect(next["a0"]).toBeDefined();
    expect(Object.keys(next)).toHaveLength(3);
  });
});
