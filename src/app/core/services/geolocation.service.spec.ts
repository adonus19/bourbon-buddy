import { GeolocationService } from './geolocation.service';

describe('GeolocationService', () => {
  let service: GeolocationService;
  const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

  beforeEach(() => {
    service = new GeolocationService();
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
});
