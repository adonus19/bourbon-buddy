/**
 * shareBottle core (BB-230a). The onCall wrapper is a thin auth delegate and
 * isn't re-tested; the guards (friends-only, blocks, rate limit) live in
 * shareBottleLogic and are covered here. findOrCreateBourbon and the notifier
 * are mocked — they have their own specs.
 */
const docs = new Map<
  string,
  { exists: boolean; data: () => Record<string, unknown> | undefined }
>();
const setCalls: Array<{ path: string; data: Record<string, unknown> }> = [];
const sendNotificationToUser: jest.Mock<Promise<number>, unknown[]> = jest.fn(
  () => Promise.resolve(1)
);
const findOrCreateBourbon: jest.Mock<Promise<unknown>, unknown[]> = jest.fn();
let autoId = 0;

function makeRef(path: string) {
  return {
    path,
    id: path.split("/").pop() as string,
    get: () =>
      Promise.resolve(docs.get(path) ?? { exists: false, data: () => undefined }),
    set: (data: Record<string, unknown>) => {
      setCalls.push({ path, data });
      return Promise.resolve();
    },
  };
}

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    doc: (path: string) => makeRef(path),
    collection: (path: string) => ({
      doc: (id?: string) => makeRef(`${path}/${id ?? `gen-${++autoId}`}`),
    }),
    runTransaction: async (
      fn: (tx: {
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (ref: { path: string }, data: Record<string, unknown>) => void;
      }) => Promise<void>
    ) =>
      fn({
        get: (ref) => ref.get(),
        set: (ref, data) => setCalls.push({ path: ref.path, data }),
      }),
  }),
  FieldValue: { serverTimestamp: () => "TS" },
}));
jest.mock("../shared/catalog", () => ({ findOrCreateBourbon }));
jest.mock("../notifications", () => ({ sendNotificationToUser }));

import { DAILY_SHARE_LIMIT, shareBottleLogic } from "./index";

const FROM = "alice";
const TO = "bob";
const seedDoc = (path: string, data?: Record<string, unknown>) =>
  docs.set(path, { exists: true, data: () => data ?? {} });

beforeEach(() => {
  docs.clear();
  setCalls.length = 0;
  autoId = 0;
  jest.clearAllMocks();
  // Default happy-path world: they're friends, sharer has a profile, no block.
  seedDoc(`users/${FROM}/friends/${TO}`, { since: "TS" });
  seedDoc(`publicProfiles/${FROM}`, { displayName: "Alice", username: "alice" });
  findOrCreateBourbon.mockResolvedValue({
    id: "b1",
    name: "Weller 12",
    distillery: "Buffalo Trace",
    category: "bourbon",
  });
});

const share = (over: Record<string, unknown> = {}) =>
  shareBottleLogic(FROM, { toUid: TO, bourbonId: "b1", ...over });

describe("shareBottleLogic (BB-230a)", () => {
  it("shares to a friend: writes the durable item, counts it, and notifies", async () => {
    const res = await share({ note: "  you'll love this  " });
    expect(res).toEqual({ shareId: "gen-1", bourbonId: "b1" });

    const item = setCalls.find((c) =>
      c.path.startsWith(`users/${TO}/sharedItems/`)
    );
    expect(item?.data).toMatchObject({
      kind: "bottle",
      fromUid: FROM,
      fromUsername: "alice",
      bourbonId: "b1",
      bottleName: "Weller 12",
      status: "pending",
      note: "you'll love this", // trimmed
    });

    const limit = setCalls.find((c) => c.path === `users/${FROM}/rateLimits/shares`);
    expect(limit?.data).toMatchObject({ count: 1 });

    expect(sendNotificationToUser).toHaveBeenCalledTimes(1);
    const [uid, payload, type] = sendNotificationToUser.mock.calls[0] as [
      string,
      { body: string; link: string; data: Record<string, string> },
      string,
    ];
    expect(uid).toBe(TO);
    expect(type).toBe("bottleShare");
    expect(payload.data).toMatchObject({ type: "bottleShare", bourbonId: "b1" });
    // BB-230c: deep-links to the durable shared item so the recipient can act on
    // it (the receive chooser), not to a generic list.
    expect(payload.data.shareId).toBe("gen-1");
    expect(payload.link).toBe("/shared/gen-1");
  });

  it("rejects sharing with someone who isn't a friend", async () => {
    docs.delete(`users/${FROM}/friends/${TO}`);
    await expect(share()).rejects.toThrow(/only share with friends/i);
    expect(setCalls).toHaveLength(0);
    expect(sendNotificationToUser).not.toHaveBeenCalled();
  });

  it("rejects when either party has blocked the other", async () => {
    seedDoc(`users/${TO}/blocks/${FROM}`, {});
    await expect(share()).rejects.toThrow(/can't share/i);
    expect(setCalls).toHaveLength(0);
  });

  it("enforces the daily share limit", async () => {
    const today = new Date().toISOString().slice(0, 10);
    seedDoc(`users/${FROM}/rateLimits/shares`, {
      day: today,
      count: DAILY_SHARE_LIMIT,
    });
    await expect(share()).rejects.toThrow(/daily limit/i);
    // No share item written when the limit rejects the transaction.
    expect(setCalls.some((c) => c.path.includes("sharedItems"))).toBe(false);
    expect(sendNotificationToUser).not.toHaveBeenCalled();
  });

  it("rejects self-shares and empty payloads", async () => {
    await expect(shareBottleLogic(FROM, { toUid: FROM, bourbonId: "b1" })).rejects.toThrow(
      /yourself/i
    );
    await expect(shareBottleLogic(FROM, { toUid: TO })).rejects.toThrow(/nothing to share/i);
  });

  it("includes a valid opt-in rating, and drops an out-of-range one", async () => {
    await share({ sharerRating: 4.5 });
    let item = setCalls.find((c) => c.path.startsWith(`users/${TO}/sharedItems/`));
    expect(item?.data.sharerRating).toBe(4.5);

    setCalls.length = 0;
    await share({ sharerRating: 9 }); // out of 0–5 range
    item = setCalls.find((c) => c.path.startsWith(`users/${TO}/sharedItems/`));
    expect(item?.data.sharerRating).toBeNull();
  });

  it("omits the rating (null) when the sharer didn't opt in", async () => {
    await share();
    const item = setCalls.find((c) => c.path.startsWith(`users/${TO}/sharedItems/`));
    expect(item?.data.sharerRating).toBeNull();
  });

  it("findOrCreates the catalog bottle from a Radar bottle with no bourbonId", async () => {
    await shareBottleLogic(FROM, {
      toUid: TO,
      bottle: { name: "The Lakes Chocolatier", distillery: "The Lakes", category: "world_other" },
    });
    expect(findOrCreateBourbon).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "The Lakes Chocolatier", createdByUserId: FROM })
    );
  });
});
