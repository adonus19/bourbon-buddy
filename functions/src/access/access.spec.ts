/**
 * Gated access (BB-210): the signup decision, approve, and deny cores.
 * The v1 trigger and onCall wrappers are thin delegates and aren't re-tested.
 */
const docs = new Map<string, { exists: boolean; data?: Record<string, unknown> }>();
const setCalls: Array<{ path: string; value: Record<string, unknown>; opts?: unknown }> =
  [];
const setCustomUserClaims = jest.fn();
const getUser = jest.fn();
const sendNotificationToUser: jest.Mock<Promise<number>, unknown[]> = jest.fn(
  () => Promise.resolve(1)
);

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    doc: jest.fn((path: string) => ({
      get: () =>
        Promise.resolve(docs.get(path) ?? { exists: false, data: () => undefined }),
      set: (value: Record<string, unknown>, opts?: unknown) => {
        setCalls.push({ path, value, opts });
        return Promise.resolve();
      },
    })),
  })),
  FieldValue: { serverTimestamp: () => "SERVER_TS" },
}));
jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({ getUser, setCustomUserClaims })),
}));
jest.mock("firebase-functions/params", () => ({
  defineString: jest.fn(() => ({ value: () => "admin-uid" })),
}));
jest.mock("../notifications", () => ({ sendNotificationToUser }));

import { approveAccess, denyAccess, processNewUser } from "./index";

const newUser = (over: Partial<Parameters<typeof processNewUser>[0]> = {}) => ({
  uid: "u1",
  email: "Friend@Example.com",
  emailVerified: true,
  displayName: "Friend",
  ...over,
});

const allowlist = (emailLower: string) =>
  docs.set(`accessAllowlist/${emailLower}`, { exists: true });

beforeEach(() => {
  docs.clear();
  setCalls.length = 0;
  jest.clearAllMocks();
  getUser.mockResolvedValue({
    uid: "u1",
    email: "friend@example.com",
    displayName: "Friend",
    customClaims: undefined,
  });
});

describe("processNewUser", () => {
  it("auto-approves an allowlisted, verified email (case-insensitive)", async () => {
    allowlist("friend@example.com");
    const result = await processNewUser(newUser(), "admin-uid");
    expect(result).toBe("approved");
    expect(setCustomUserClaims).toHaveBeenCalledWith("u1", { approved: true });
    expect(setCalls).toContainEqual({
      path: "users/u1",
      value: { accessStatus: "approved" },
      opts: { merge: true },
    });
    expect(sendNotificationToUser).not.toHaveBeenCalled();
  });

  it("leaves an allowlisted-but-unverified email pending, with a hint", async () => {
    allowlist("friend@example.com");
    const result = await processNewUser(
      newUser({ emailVerified: false }),
      "admin-uid"
    );
    expect(result).toBe("pending");
    expect(setCustomUserClaims).not.toHaveBeenCalled();
    expect(setCalls).toContainEqual({
      path: "users/u1",
      value: { accessStatus: "pending" },
      opts: { merge: true },
    });
    const [uid, payload, type] = sendNotificationToUser.mock.calls[0] as [
      string,
      { body: string; link: string },
      string,
    ];
    expect(uid).toBe("admin-uid");
    expect(type).toBe("accessRequest");
    expect(payload.link).toBe("/admin");
    expect(payload.body).toContain("allowlist");
    expect(payload.body).toContain("isn't verified");
  });

  it("marks an unknown email pending and notifies the admin", async () => {
    const result = await processNewUser(newUser(), "admin-uid");
    expect(result).toBe("pending");
    const [uid, payload] = sendNotificationToUser.mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(uid).toBe("admin-uid");
    expect(payload.body).toContain("Friend (Friend@Example.com)");
    expect(payload.body).not.toContain("allowlist");
  });

  it("handles a provider account with no email (pending, no crash)", async () => {
    const result = await processNewUser(
      newUser({ email: null, displayName: null }),
      "admin-uid"
    );
    expect(result).toBe("pending");
    expect(
      (sendNotificationToUser.mock.calls[0] as [string, { body: string }])[1].body
    ).toContain("u1");
  });

  it("still records pending when no admin uid is configured", async () => {
    const result = await processNewUser(newUser(), "");
    expect(result).toBe("pending");
    expect(sendNotificationToUser).not.toHaveBeenCalled();
    expect(setCalls).toContainEqual({
      path: "users/u1",
      value: { accessStatus: "pending" },
      opts: { merge: true },
    });
  });
});

describe("approveAccess", () => {
  it("merges the claim without clobbering existing claims", async () => {
    getUser.mockResolvedValue({
      uid: "u1",
      email: "owner@example.com",
      displayName: "Owner",
      customClaims: { admin: true },
    });
    await approveAccess("u1");
    expect(setCustomUserClaims).toHaveBeenCalledWith("u1", {
      admin: true,
      approved: true,
    });
  });

  it("adds the email to the allowlist when missing, preserving an existing entry", async () => {
    await approveAccess("u1");
    expect(setCalls).toContainEqual({
      path: "accessAllowlist/friend@example.com",
      value: { note: "Friend", addedAt: "SERVER_TS" },
      opts: undefined,
    });

    setCalls.length = 0;
    allowlist("friend@example.com");
    await approveAccess("u1");
    expect(
      setCalls.filter((c) => c.path.startsWith("accessAllowlist/"))
    ).toHaveLength(0);
  });

  it("skips the allowlist upsert for accounts without an email", async () => {
    getUser.mockResolvedValue({ uid: "u1", customClaims: undefined });
    await approveAccess("u1");
    expect(
      setCalls.filter((c) => c.path.startsWith("accessAllowlist/"))
    ).toHaveLength(0);
    expect(setCalls).toContainEqual({
      path: "users/u1",
      value: { accessStatus: "approved" },
      opts: { merge: true },
    });
  });
});

describe("denyAccess", () => {
  it("strips only the approved claim and marks the profile denied", async () => {
    getUser.mockResolvedValue({
      uid: "u1",
      customClaims: { approved: true, admin: true },
    });
    await denyAccess("u1", "admin-uid");
    expect(setCustomUserClaims).toHaveBeenCalledWith("u1", { admin: true });
    expect(setCalls).toContainEqual({
      path: "users/u1",
      value: { accessStatus: "denied" },
      opts: { merge: true },
    });
  });

  it("refuses to deny the caller's own account", async () => {
    await expect(denyAccess("admin-uid", "admin-uid")).rejects.toMatchObject({
      code: "invalid-argument",
    });
    expect(setCustomUserClaims).not.toHaveBeenCalled();
    expect(setCalls).toHaveLength(0);
  });
});
