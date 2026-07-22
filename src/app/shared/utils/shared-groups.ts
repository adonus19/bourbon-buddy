import { SharedItem } from '../../models';

/** A sharer and every item they've shared with the current user (BB-230e). */
export interface SharerGroup {
  fromUid: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  items: SharedItem[];
}

/**
 * Group received shares by sharer for the Hunt List "Shared with me" segment
 * (BB-230e). Insertion order is preserved: callers pass the shares newest-first
 * (the listener orders by `createdAt desc`), so the first group is the sharer
 * with the most-recent share and each group's items stay newest-first too — the
 * page expands only the top group by default.
 */
export function groupSharesBySharer(items: SharedItem[]): SharerGroup[] {
  const byUid = new Map<string, SharerGroup>();
  for (const s of items) {
    let group = byUid.get(s.fromUid);
    if (!group) {
      group = {
        fromUid: s.fromUid,
        displayName: s.fromDisplayName || 'A friend',
        username: s.fromUsername ?? null,
        avatarUrl: s.fromAvatarUrl ?? null,
        items: [],
      };
      byUid.set(s.fromUid, group);
    }
    group.items.push(s);
  }
  return [...byUid.values()];
}
