import { Timestamp } from '@angular/fire/firestore';

// Collection: /users/{userId}  (document ID = Firebase Auth UID)
export interface UserProfile {
  id?: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
  homeRegion?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
