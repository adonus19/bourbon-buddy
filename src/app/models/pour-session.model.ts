import { Timestamp } from '@angular/fire/firestore';

// Subcollection: /users/{userId}/logEntries/{entryId}/pourSessions/{sessionId}
// Only relevant when the parent entry has entryType === 'bottle_purchased'.
export interface PourSession {
  id?: string;
  pourDate: Timestamp;
  rating?: number | null; // 0.5 – 5.0
  settingNotes?: string | null;
  tastingNotes?: string | null;
  createdAt: Timestamp;
}
