import { Timestamp } from '@angular/fire/firestore';

// Subcollection: /users/{userId}/wishlistEntries/{entryId}/sightings/{sightingId}
// Staleness is computed on read:
//   isStale = markedStaleManually || (today - sightingDate > 30 days)
export interface Sighting {
  id?: string;
  storeName: string;
  price: number;
  sightingDate: Timestamp;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  markedStaleManually: boolean;
  createdAt: Timestamp;
}
