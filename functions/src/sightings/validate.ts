/**
 * Pure input validation for the logSighting callable (BB-163). Extracted so the
 * rules can be unit-tested without the Firestore/callable machinery. Throws
 * HttpsError('invalid-argument') on the first problem.
 */
import { HttpsError } from "firebase-functions/v2/https";

import { isValidLat, isValidLng } from "../shared/geohash";

export const STORE_MAX = 120;
export const TEXT_MAX = 80;
export const NOTES_MAX = 500;
export const PRICE_CEILING = 100000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface LogSightingData {
  bourbonId?: string;
  bourbonName?: string | null;
  storeName?: string;
  price?: number;
  sightingDateMillis?: number;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  visibility?: string;
  lat?: number | null;
  lng?: number | null;
  // Client-generated idempotency key (BB-182): lets an offline sighting be
  // replayed on reconnect without creating a duplicate. Doc-id-safe charset.
  clientId?: string | null;
  // The store picked from the nearby-retailer list (BB-191), if any: its OSM
  // ref + coordinates, used server-side for presence attestation.
  store?: { id?: string | null; lat?: number; lng?: number } | null;
}

export interface ValidatedSighting {
  bourbonId: string;
  storeName: string;
  price: number;
  sightingDateMillis: number;
  visibility: string;
  lat: number | null;
  lng: number | null;
  clientId: string | null;
  store: { id: string | null; lat: number; lng: number } | null;
}

// Doc-id-safe idempotency key: a UUID or similar short token.
export const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// OSM element ref from the retailer picker, e.g. "node/123456".
export const STORE_ID_RE = /^(node|way|relation)\/\d{1,16}$/;

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

export function validate(d: LogSightingData): ValidatedSighting {
  if (!d.bourbonId || typeof d.bourbonId !== "string") {
    bad("A bottle is required.");
  }
  if (
    !d.storeName ||
    typeof d.storeName !== "string" ||
    d.storeName.length > STORE_MAX
  ) {
    bad("Store name is required and must be under 120 characters.");
  }
  if (typeof d.price !== "number" || !(d.price > 0) || d.price > PRICE_CEILING) {
    bad("Price must be a positive number under 100,000.");
  }
  const when =
    typeof d.sightingDateMillis === "number" ? d.sightingDateMillis : Date.now();
  if (when > Date.now() + DAY_MS) {
    bad("Sighting date can't be in the future.");
  }
  for (const [field, max] of [
    [d.city, TEXT_MAX],
    [d.state, TEXT_MAX],
    [d.notes, NOTES_MAX],
  ] as const) {
    if (field != null && (typeof field !== "string" || field.length > max)) {
      bad("A field is too long.");
    }
  }
  const visibility = d.visibility === "friends" ? "friends" : "private";

  // Optional idempotency key (BB-182). Reject a malformed one rather than
  // silently ignoring it, so a duplicate-suppressing replay can't be defeated.
  let clientId: string | null = null;
  if (d.clientId != null) {
    if (typeof d.clientId !== "string" || !CLIENT_ID_RE.test(d.clientId)) {
      bad("Invalid client id.");
    }
    clientId = d.clientId;
  }

  // Location is opt-in (BB-177): accept only a complete, in-range coordinate
  // pair, otherwise store nothing.
  let lat: number | null = null;
  let lng: number | null = null;
  if (d.lat != null || d.lng != null) {
    if (!isValidLat(d.lat) || !isValidLng(d.lng)) {
      bad("Invalid location coordinates.");
    }
    lat = d.lat;
    lng = d.lng;
  }

  // Optional picked store (BB-191). Same posture as location: accept only a
  // complete, well-formed value, otherwise store nothing — a malformed store
  // silently degrades to "unattested" rather than failing the sighting.
  let store: ValidatedSighting["store"] = null;
  if (d.store != null && typeof d.store === "object") {
    const s = d.store;
    if (isValidLat(s.lat) && isValidLng(s.lng)) {
      const id =
        typeof s.id === "string" && STORE_ID_RE.test(s.id) ? s.id : null;
      store = { id, lat: s.lat as number, lng: s.lng as number };
    }
  }

  return {
    bourbonId: d.bourbonId as string,
    storeName: d.storeName as string,
    price: d.price as number,
    sightingDateMillis: when,
    visibility,
    lat,
    lng,
    clientId,
    store,
  };
}
