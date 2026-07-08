import { HttpsError } from "firebase-functions/v2/https";

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TS" },
}));

import { consumeDailyLimit, requireAdmin, todayKey } from "./guards";

type TxData = Record<string, unknown> | undefined;

/** Minimal Firestore double: one doc, real transaction semantics for our use. */
function fakeDb(existing: TxData) {
  const sets: Array<Record<string, unknown>> = [];
  const tx = {
    get: jest.fn().mockResolvedValue({ data: () => existing }),
    set: jest.fn((_ref: unknown, value: Record<string, unknown>) => {
      sets.push(value);
    }),
  };
  const db = {
    doc: jest.fn(() => ({ path: "users/u1/rateLimits/test" })),
    runTransaction: (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  };
  return { db, sets };
}

describe("todayKey", () => {
  it("formats as UTC YYYY-MM-DD", () => {
    expect(todayKey(new Date("2026-07-08T23:59:00Z"))).toBe("2026-07-08");
  });
});

describe("consumeDailyLimit", () => {
  it("starts a fresh counter when none exists", async () => {
    const { db, sets } = fakeDb(undefined);
    await consumeDailyLimit(db as never, "u1", "test", 5, "limit hit");
    expect(sets[0]).toMatchObject({ day: todayKey(), count: 1 });
  });

  it("increments today's counter", async () => {
    const { db, sets } = fakeDb({ day: todayKey(), count: 3 });
    await consumeDailyLimit(db as never, "u1", "test", 5, "limit hit");
    expect(sets[0]).toMatchObject({ count: 4 });
  });

  it("resets the counter on a new day", async () => {
    const { db, sets } = fakeDb({ day: "2001-01-01", count: 999 });
    await consumeDailyLimit(db as never, "u1", "test", 5, "limit hit");
    expect(sets[0]).toMatchObject({ day: todayKey(), count: 1 });
  });

  it("throws resource-exhausted at the limit and writes nothing", async () => {
    const { db, sets } = fakeDb({ day: todayKey(), count: 5 });
    await expect(
      consumeDailyLimit(db as never, "u1", "test", 5, "limit hit")
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(sets).toHaveLength(0);
  });
});

describe("requireAdmin", () => {
  const req = (auth: unknown) => ({ auth }) as never;

  it("rejects signed-out callers as unauthenticated", () => {
    expect(() => requireAdmin(req(undefined))).toThrow(HttpsError);
    try {
      requireAdmin(req(undefined));
    } catch (e) {
      expect((e as HttpsError).code).toBe("unauthenticated");
    }
  });

  it("rejects signed-in non-admins with permission-denied", () => {
    try {
      requireAdmin(req({ uid: "u1", token: {} }));
      fail("should have thrown");
    } catch (e) {
      expect((e as HttpsError).code).toBe("permission-denied");
    }
  });

  it("rejects a truthy-but-not-true admin claim", () => {
    expect(() =>
      requireAdmin(req({ uid: "u1", token: { admin: "yes" } }))
    ).toThrow(HttpsError);
  });

  it("returns the uid for a real admin", () => {
    expect(requireAdmin(req({ uid: "u1", token: { admin: true } }))).toBe("u1");
  });
});
