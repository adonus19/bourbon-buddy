import { Timestamp } from '@angular/fire/firestore';

// Document: /users/{userId}/settings/notifications (BB-091).
// Every type defaults off until the user opts in. `pausedAll` is a master
// kill-switch the send-helper checks before delivering anything.
export interface NotificationPrefs {
  sightingMatch: boolean; // a friend spots a bottle on your Hunt List (BB-112)
  priceAlert: boolean; // a wishlist bottle's price target is beaten
  tasteMatch: boolean; // a friend spots a bottle matching your taste (BB-199)
  friendRequest: boolean; // someone sends you a friend request
  newsDigest: boolean; // periodic news digest
  bottleShare: boolean; // a friend shares a bottle with you (BB-230)
  listShare: boolean; // a friend shares their hunt list with you (BB-230)
  pausedAll: boolean; // master pause
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  sightingMatch: false,
  priceAlert: false,
  tasteMatch: false,
  friendRequest: false,
  newsDigest: false,
  bottleShare: false,
  listShare: false,
  pausedAll: false,
};

/** The toggle keys the user can flip (everything except the computed defaults). */
export type NotificationPrefKey = keyof NotificationPrefs;
