import { TestBed } from '@angular/core/testing';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  doc: jest.fn((_fs, path) => ({ path })),
  docData: jest.fn(),
  getDoc: jest.fn(),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(() => 'ts'),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
}));

import { Firestore, runTransaction } from '@angular/fire/firestore';
import { USERNAME_TAKEN, UserService } from './user.service';

const asMock = (fn: unknown) => fn as jest.Mock;

/** Firestore DocumentSnapshot stub keyed by an in-memory store. */
const snapFor = (store: Record<string, Record<string, unknown> | undefined>) => (ref: {
  path: string;
}) => {
  const data = store[ref.path];
  return {
    exists: () => data !== undefined,
    get: (k: string) => data?.[k],
    data: () => data,
  };
};

/**
 * Runs `claimUsername` against a fake transaction over `store`, returning the
 * writes it issued so tests can assert the exact public-profile payload.
 */
async function runClaim(
  service: UserService,
  uid: string,
  desired: string,
  current: string | null,
  store: Record<string, Record<string, unknown> | undefined>
) {
  const sets: { path: string; data: Record<string, unknown> }[] = [];
  const updates: { path: string; data: Record<string, unknown> }[] = [];
  const deletes: string[] = [];
  const getSnap = snapFor(store);

  asMock(runTransaction).mockImplementation((_fs, fn) =>
    fn({
      get: (ref: { path: string }) => Promise.resolve(getSnap(ref)),
      set: (ref: { path: string }, data: Record<string, unknown>) =>
        sets.push({ path: ref.path, data }),
      update: (ref: { path: string }, data: Record<string, unknown>) =>
        updates.push({ path: ref.path, data }),
      delete: (ref: { path: string }) => deletes.push(ref.path),
    })
  );

  await service.claimUsername(uid, desired, current);
  return { sets, updates, deletes };
}

describe('UserService.claimUsername', () => {
  let service: UserService;

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [UserService, { provide: Firestore, useValue: {} }],
    });
    service = TestBed.inject(UserService);
  });

  it('writes the full 8-key public projection, preserving existing values', async () => {
    const store = {
      'publicProfiles/u1': {
        displayName: 'Dan',
        avatarUrl: 'https://img/a.jpg',
        homeRegion: 'Charlotte, NC',
        isDiscoverable: true,
        friendCount: 7,
      },
    };
    const { sets } = await runClaim(service, 'u1', 'Bourbon_Dan', null, store);

    const pub = sets.find((s) => s.path === 'publicProfiles/u1');
    expect(pub).toBeDefined();
    expect(Object.keys(pub!.data).sort()).toEqual([
      'avatarUrl',
      'displayName',
      'friendCount',
      'homeRegion',
      'isDiscoverable',
      'updatedAt',
      'username',
      'usernameLower',
    ]);
    // Existing values survive; friendCount is not reset by the claim.
    expect(pub!.data).toMatchObject({
      displayName: 'Dan',
      username: 'Bourbon_Dan',
      usernameLower: 'bourbon_dan',
      avatarUrl: 'https://img/a.jpg',
      homeRegion: 'Charlotte, NC',
      isDiscoverable: true,
      friendCount: 7,
    });
  });

  it('self-heals a legacy/partial public doc missing required fields', async () => {
    // Only displayName present — the pre-fix merge write would have left the
    // doc missing isDiscoverable/friendCount and failed rules validation.
    const store = { 'publicProfiles/u1': { displayName: 'Dan' } };
    const { sets } = await runClaim(service, 'u1', 'newhandle', null, store);

    const pub = sets.find((s) => s.path === 'publicProfiles/u1')!;
    expect(pub.data).toMatchObject({
      displayName: 'Dan',
      username: 'newhandle',
      usernameLower: 'newhandle',
      avatarUrl: null,
      homeRegion: null,
      isDiscoverable: false,
      friendCount: 0,
    });
  });

  it('reserves the new handle and releases the previous one', async () => {
    const store = { 'publicProfiles/u1': { displayName: 'Dan' } };
    const { sets, deletes } = await runClaim(
      service,
      'u1',
      'newname',
      'oldname',
      store
    );
    expect(sets.some((s) => s.path === 'usernames/newname')).toBe(true);
    expect(deletes).toContain('usernames/oldname');
  });

  it('throws USERNAME_TAKEN when the handle belongs to someone else', async () => {
    const store = { 'usernames/taken': { uid: 'someone-else' } };
    await expect(
      runClaim(service, 'u1', 'taken', null, store)
    ).rejects.toThrow(USERNAME_TAKEN);
  });

  it('no-ops when the handle is unchanged (case-insensitive)', async () => {
    await service.claimUsername('u1', 'Dan', 'dan');
    expect(runTransaction).not.toHaveBeenCalled();
  });
});
