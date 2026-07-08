import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface PlaceName {
  city: string | null;
  state: string | null;
}

/** A nearby retail POI from the Overpass-backed picker (BB-187). */
export interface Retailer {
  name: string;
  lat: number;
  lng: number;
  kind: string;
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
  private readonly functions = inject(Functions);

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.geolocation;
  }

  /**
   * Nearby retail stores for a coordinate (BB-187), via the `nearbyRetailers`
   * callable (Overpass, geohash-cached server-side). Resolves to [] on any
   * failure so the sighting form degrades to manual entry.
   */
  async nearbyRetailers(lat: number, lng: number): Promise<Retailer[]> {
    try {
      const callable = httpsCallable<
        { lat: number; lng: number },
        { retailers: Retailer[] }
      >(this.functions, 'nearbyRetailers');
      return (await callable({ lat, lng })).data?.retailers ?? [];
    } catch {
      return [];
    }
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
