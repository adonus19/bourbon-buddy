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
});
