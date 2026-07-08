/**
 * Nearby Retailer Picker (BB-187).
 *
 * `nearbyRetailers` returns retail POIs near a captured sighting coordinate,
 * sourced from OpenStreetMap **Overpass** and cached per geohash cell so we
 * respect Overpass fair-use (one call per ~1.2 km cell per week). Degrades
 * silently: any Overpass failure returns an empty list, so the sighting form
 * always falls back to manual entry.
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { isValidLat, isValidLng } from "../shared/geohash";
import {
  buildOverpassQuery,
  CACHE_TTL_MS,
  isCacheFresh,
  parseOverpassRetailers,
  Retailer,
  retailerCacheKey,
} from "./overpass";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export const nearbyRetailers = onCall(
  { region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in to find nearby stores.");
    }
    const { lat, lng } = (request.data ?? {}) as { lat?: number; lng?: number };
    if (!isValidLat(lat) || !isValidLng(lng)) {
      throw new HttpsError("invalid-argument", "Valid coordinates are required.");
    }

    const db = getFirestore();
    const ref = db.doc(`overpassCache/${retailerCacheKey(lat, lng)}`);

    // Serve a fresh cache entry without touching Overpass.
    const snap = await ref.get();
    if (snap.exists) {
      const fetchedAt = snap.get("fetchedAt") as { toMillis?: () => number };
      if (isCacheFresh(fetchedAt?.toMillis?.(), Date.now(), CACHE_TTL_MS)) {
        return { retailers: (snap.get("retailers") as Retailer[]) ?? [], cached: true };
      }
    }

    // Miss/stale → query Overpass. Cache only a successful response (even if
    // empty — a genuinely barren cell); on failure, return empty WITHOUT caching
    // so a transient Overpass outage doesn't wedge the cell for a week.
    let retailers: Retailer[] = [];
    let ok = false;
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "BourbonBuddy/1.0 (nearby retailer picker)",
        },
        body: buildOverpassQuery(lat, lng),
      });
      if (res.ok) {
        retailers = parseOverpassRetailers(await res.json(), { lat, lng });
        ok = true;
      } else {
        logger.warn(`Overpass ${res.status} for ${retailerCacheKey(lat, lng)}`);
      }
    } catch (err) {
      logger.warn("Overpass request failed", err);
    }

    if (ok) {
      await ref.set({ retailers, fetchedAt: FieldValue.serverTimestamp() });
    }
    return { retailers, cached: false };
  }
);
