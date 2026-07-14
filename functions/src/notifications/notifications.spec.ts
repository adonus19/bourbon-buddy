const addFn = jest.fn(() => Promise.resolve({ id: "n1" }));
const deleteFn = jest.fn(() => Promise.resolve());
const prefsGet = jest.fn();
const tokensGet = jest.fn();
const countGet = jest.fn(() => Promise.resolve({ data: () => ({ count: 3 }) }));
const sendEachForMulticast = jest.fn();

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    doc: jest.fn(() => ({ get: prefsGet, delete: deleteFn })),
    collection: jest.fn(() => ({
      add: addFn,
      get: tokensGet,
      where: jest.fn(() => ({ count: jest.fn(() => ({ get: countGet })) })),
    })),
  })),
  FieldValue: { serverTimestamp: () => "ts" },
  Timestamp: { fromMillis: jest.fn(), now: jest.fn() },
}));
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({ sendEachForMulticast })),
}));

import { sendNotificationToUser } from "./index";

const payload = { title: "Hi", body: "There", link: "/inbox" };
const prefsSnap = (data: Record<string, unknown>) => ({ data: () => data });
const tokensSnap = (ids: string[]) => ({
  empty: ids.length === 0,
  docs: ids.map((id) => ({ id, get: () => `token-${id}` })),
});

describe("sendNotificationToUser", () => {
  beforeEach(() => jest.clearAllMocks());

  it("skips delivery + inbox when the type preference is off", async () => {
    prefsGet.mockResolvedValue(prefsSnap({ sightingMatch: false }));
    const sent = await sendNotificationToUser("u1", payload, "sightingMatch");
    expect(sent).toBe(0);
    expect(addFn).not.toHaveBeenCalled();
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("skips when notifications are globally paused", async () => {
    prefsGet.mockResolvedValue(prefsSnap({ sightingMatch: true, pausedAll: true }));
    expect(await sendNotificationToUser("u1", payload, "sightingMatch")).toBe(0);
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("delivers accessRequest without consulting prefs (BB-210)", async () => {
    tokensGet.mockResolvedValue(tokensSnap(["t1"]));
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      responses: [{ success: true }],
    });
    const sent = await sendNotificationToUser("u1", payload, "accessRequest");
    expect(sent).toBe(1);
    expect(prefsGet).not.toHaveBeenCalled(); // per-type prefs & pausedAll bypassed
    expect(addFn).toHaveBeenCalledTimes(1); // inbox record still written
  });

  it("writes an inbox record even when there are no devices", async () => {
    prefsGet.mockResolvedValue(prefsSnap({ friendRequest: true }));
    tokensGet.mockResolvedValue(tokensSnap([]));
    const sent = await sendNotificationToUser("u1", payload, "friendRequest");
    expect(sent).toBe(0);
    expect(addFn).toHaveBeenCalledTimes(1); // recoverable inbox record
  });

  it("delivers to devices and prunes dead tokens", async () => {
    prefsGet.mockResolvedValue(prefsSnap({ sightingMatch: true }));
    tokensGet.mockResolvedValue(tokensSnap(["t1", "t2"]));
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      responses: [
        { success: true },
        {
          success: false,
          error: { code: "messaging/registration-token-not-registered" },
        },
      ],
    });
    const sent = await sendNotificationToUser("u1", payload, "sightingMatch");
    expect(sent).toBe(1);
    expect(addFn).toHaveBeenCalledTimes(1);
    expect(sendEachForMulticast).toHaveBeenCalled();
    expect(deleteFn).toHaveBeenCalledTimes(1); // the one dead token
  });

  it("sends data-only messages so the SW controls display (BB-092)", async () => {
    prefsGet.mockResolvedValue(prefsSnap({ sightingMatch: true }));
    tokensGet.mockResolvedValue(tokensSnap(["t1"]));
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      responses: [{ success: true }],
    });
    await sendNotificationToUser("u1", payload, "sightingMatch");
    const msg = sendEachForMulticast.mock.calls[0][0];
    expect(msg.notification).toBeUndefined();
    // Data-only, and carries the unread count for the app-icon badge (BB-093).
    expect(msg.data).toEqual({
      title: "Hi",
      body: "There",
      link: "/inbox",
      badge: "3",
    });
  });

  it("without a type, skips prefs/inbox and just delivers", async () => {
    tokensGet.mockResolvedValue(tokensSnap(["t1"]));
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      responses: [{ success: true }],
    });
    const sent = await sendNotificationToUser("u1", payload);
    expect(sent).toBe(1);
    expect(prefsGet).not.toHaveBeenCalled();
    expect(addFn).not.toHaveBeenCalled();
  });
});
