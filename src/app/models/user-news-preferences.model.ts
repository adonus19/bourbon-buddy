import { Timestamp } from '@angular/fire/firestore';

// Collection: /userNewsPreferences/{userId}  (document ID = Firebase Auth UID)
// Default on creation: activeCategories: ['general'], all other arrays empty.
export interface UserNewsPreferences {
  id?: string;
  watchKeywords: string[];
  watchDistilleries: string[];
  activeCategories: string[];
  excludeKeywords: string[];
  updatedAt: Timestamp;
}
