import { TestBed } from '@angular/core/testing';

jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));

import { Functions, httpsCallable } from '@angular/fire/functions';
import { SharingService } from './sharing.service';

const asMock = (fn: unknown) => fn as jest.Mock;

describe('SharingService', () => {
  let service: SharingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SharingService, { provide: Functions, useValue: {} }],
    });
    service = TestBed.inject(SharingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('calls the shareBottle callable with the input and returns its data', async () => {
    const callable = jest.fn(() =>
      Promise.resolve({ data: { shareId: 's1', bourbonId: 'b1' } })
    );
    asMock(httpsCallable).mockReturnValue(callable);

    const input = { toUid: 'bob', bourbonId: 'b1', note: 'enjoy', sharerRating: 4.5 };
    const res = await service.shareBottle(input);

    expect(asMock(httpsCallable)).toHaveBeenCalledWith(expect.anything(), 'shareBottle');
    expect(callable).toHaveBeenCalledWith(input);
    expect(res).toEqual({ shareId: 's1', bourbonId: 'b1' });
  });

  it('propagates a callable rejection (e.g. rate limit / not a friend)', async () => {
    const callable = jest.fn(() => Promise.reject(new Error('failed-precondition')));
    asMock(httpsCallable).mockReturnValue(callable);
    await expect(
      service.shareBottle({ toUid: 'bob', bourbonId: 'b1' })
    ).rejects.toThrow('failed-precondition');
  });

  it('calls the shareList callable and returns its data', async () => {
    const callable = jest.fn(() => Promise.resolve({ data: { shareId: 's2', bottleCount: 7 } }));
    asMock(httpsCallable).mockReturnValue(callable);
    const res = await service.shareList({ toUid: 'bob', note: 'my list' });
    expect(asMock(httpsCallable)).toHaveBeenCalledWith(expect.anything(), 'shareList');
    expect(callable).toHaveBeenCalledWith({ toUid: 'bob', note: 'my list' });
    expect(res).toEqual({ shareId: 's2', bottleCount: 7 });
  });
});
