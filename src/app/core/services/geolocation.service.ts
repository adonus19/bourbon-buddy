import { Injectable } from '@angular/core';

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Thin wrapper over the browser Geolocation API (BB-177). Opt-in: callers only
 * invoke this when the user asks to attach their location. Resolves to null
 * (never rejects) on unsupported / denied / timeout, so callers can degrade
 * silently and let the sighting save without coordinates.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.geolocation;
  }

  getCurrentPosition(): Promise<Coordinates | null> {
    if (!this.isSupported()) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    });
  }
}
