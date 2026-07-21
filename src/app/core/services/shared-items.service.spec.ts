import { TestBed } from '@angular/core/testing';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  doc: jest.fn((_fs, path) => ({ path })),
  getDoc: jest.fn(),
  updateDoc: jest.fn(() => Promise.resolve()),
}));

import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { AuthService } from '../auth/auth.service';
import { SharedItemsService } from './shared-items.service';

const asMock = (fn: unknown) => fn as jest.Mock;
const snap = (exists: boolean, data: Record<string, unknown> = {}, id = 's1') => ({
  exists: () => exists,
  id,
  data: () => data,
});

describe('SharedItemsService', () => {
  let service: SharedItemsService;

  function setup(uid: string | null) {
    TestBed.configureTestingModule({
      providers: [
        SharedItemsService,
        { provide: Firestore, useValue: {} },
        { provide: AuthService, useValue: { snapshotUser: uid ? { uid } : null } },
      ],
    });
    service = TestBed.inject(SharedItemsService);
  }

  afterEach(() => jest.clearAllMocks());

  it('reads a shared item under the current user and hydrates its id', async () => {
    setup('me');
    asMock(getDoc).mockResolvedValue(snap(true, { kind: 'bottle', bottleName: 'Weller 12' }));
    const item = await service.get('s1');
    expect(asMock(doc).mock.calls[0][1]).toBe('users/me/sharedItems/s1');
    expect(item).toMatchObject({ id: 's1', bottleName: 'Weller 12' });
  });

  it('returns null when the share does not exist', async () => {
    setup('me');
    asMock(getDoc).mockResolvedValue(snap(false));
    expect(await service.get('missing')).toBeNull();
  });

  it('returns null (no read) when signed out', async () => {
    setup(null);
    expect(await service.get('s1')).toBeNull();
    expect(asMock(getDoc)).not.toHaveBeenCalled();
  });

  it('marks a share imported', async () => {
    setup('me');
    await service.markStatus('s1', 'imported');
    expect(asMock(doc).mock.calls[0][1]).toBe('users/me/sharedItems/s1');
    expect(asMock(updateDoc)).toHaveBeenCalledWith(expect.anything(), { status: 'imported' });
  });
});
