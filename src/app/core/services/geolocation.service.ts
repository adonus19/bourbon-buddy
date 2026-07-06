import { Injectable } from '@angular/core';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface PlaceName {
  city: string | null;
  state: string | null;
}

// Free, key-less, CORS-enabled reverse geocoder (BB-183). No paid dependency.
const REVERSE_GEOCODE_URL =
  'https://api.bigdatacloud.net/data/reverse-geocode-client';

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

  /**
   * Reverse-geocode coordinates to a city/state (BB-183) via a free, key-less
   * client API. Resolves to null on any failure so callers degrade silently.
   */
  async reverseGeocode(lat: number, lng: number): Promise<PlaceName | null> {
    try {
      const url = `${REVERSE_GEOCODE_URL}?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
      const res = await fetch(url);
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as {
        city?: string;
        locality?: string;
        principalSubdivision?: string;
      };
      const city = (data.city || data.locality || '').trim() || null;
      const state = (data.principalSubdivision || '').trim() || null;
      return city || state ? { city, state } : null;
    } catch {
      return null;
    }
  }
}
