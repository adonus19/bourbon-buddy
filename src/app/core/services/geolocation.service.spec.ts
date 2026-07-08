import { TestBed } from '@angular/core/testing';

jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));

import { Functions, httpsCallable } from '@angular/fire/functions';
import { GeolocationService } from './geolocation.service';

const asMock = (fn: unknown) => fn as jest.Mock;

describe('GeolocationService', () => {
  let service: GeolocationService;
  const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [GeolocationService, { provide: Functions, useValue: {} }],
    });
    service = TestBed.inject(GeolocationService);
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(navigator, 'geolocation', original);
    }
  });

  function stubGeolocation(value: unknown): void {
    Object.defineProperty(navigator, 'geolocation', {
      value,
      configurable: true,
    });
  }

  it('resolves coordinates on success', async () => {
    stubGeolocation({
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: 42.6, longitude: -5.6 } }),
    });
    await expect(service.getCurrentPosition()).resolves.toEqual({
      lat: 42.6,
      lng: -5.6,
    });
  });

  it('resolves null when the user denies or it errors', async () => {
    stubGeolocation({
      getCurrentPosition: (_ok: unknown, err: () => void) => err(),
    });
    await expect(service.getCurrentPosition()).resolves.toBeNull();
  });

  it('resolves null when geolocation is unsupported', async () => {
    stubGeolocation(undefined);
    expect(service.isSupported()).toBe(false);
    await expect(service.getCurrentPosition()).resolves.toBeNull();
  });

  describe('reverseGeocode', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = realFetch;
    });
    const mockFetch = (impl: () => unknown) => {
      globalThis.fetch = jest.fn(impl) as unknown as typeof fetch;
    };

    it('maps city and state from a successful response', async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              city: 'Louisville',
              principalSubdivision: 'Kentucky',
            }),
        })
      );
      await expect(service.reverseGeocode(38.25, -85.75)).resolves.toEqual({
        city: 'Louisville',
        state: 'Kentucky',
      });
    });

    it('falls back to locality when city is absent', async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ locality: 'Bardstown', principalSubdivision: 'Kentucky' }),
        })
      );
      const place = await service.reverseGeocode(37.8, -85.4);
      expect(place?.city).toBe('Bardstown');
    });

    it('returns null on a non-ok response', async () => {
      mockFetch(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
      await expect(service.reverseGeocode(0, 0)).resolves.toBeNull();
    });

    it('returns null when the request throws', async () => {
      mockFetch(() => Promise.reject(new Error('offline')));
      await expect(service.reverseGeocode(0, 0)).resolves.toBeNull();
    });

    it('returns null when no place fields are present', async () => {
      mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
      await expect(service.reverseGeocode(0, 0)).resolves.toBeNull();
    });
  });

  describe('nearbyRetailers (BB-187)', () => {
    it('returns the retailers from the callable', async () => {
      const callable = jest.fn().mockResolvedValue({
        data: {
          retailers: [
            { name: 'Total Wine', lat: 1, lng: 2, kind: 'wine', city: null, state: null },
          ],
        },
      });
      asMock(httpsCallable).mockReturnValue(callable);

      const out = await service.nearbyRetailers(42.5, -71.1);
      expect(callable).toHaveBeenCalledWith({ lat: 42.5, lng: -71.1 });
      expect(out.map((r) => r.name)).toEqual(['Total Wine']);
    });

    it('returns [] when the callable errors (degrades to manual entry)', async () => {
      asMock(httpsCallable).mockReturnValue(
        jest.fn().mockRejectedValue(new Error('offline'))
      );
      await expect(service.nearbyRetailers(1, 2)).resolves.toEqual([]);
    });

    it('returns [] when the response has no retailers', async () => {
      asMock(httpsCallable).mockReturnValue(
        jest.fn().mockResolvedValue({ data: {} })
      );
      await expect(service.nearbyRetailers(1, 2)).resolves.toEqual([]);
    });
  });
});
