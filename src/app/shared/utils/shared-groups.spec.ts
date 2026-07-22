import { Timestamp } from '@angular/fire/firestore';

import { SharedItem } from '../../models';
import { groupSharesBySharer } from './shared-groups';

const share = (over: Partial<SharedItem>): SharedItem => ({
  id: Math.random().toString(36).slice(2),
  kind: 'bottle',
  fromUid: 'u1',
  fromDisplayName: 'Alice',
  fromUsername: 'alice',
  fromAvatarUrl: null,
  status: 'pending',
  createdAt: Timestamp.now(),
  ...over,
});

describe('groupSharesBySharer (BB-230e)', () => {
  it('groups shares by sharer uid', () => {
    const groups = groupSharesBySharer([
      share({ fromUid: 'u1' }),
      share({ fromUid: 'u2', fromDisplayName: 'Bob', fromUsername: 'bob' }),
      share({ fromUid: 'u1' }),
    ]);
    expect(groups.map((g) => g.fromUid)).toEqual(['u1', 'u2']);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  it('preserves input order — first sharer seen leads (callers pass newest-first)', () => {
    const groups = groupSharesBySharer([
      share({ fromUid: 'newest', fromUsername: 'new' }),
      share({ fromUid: 'older', fromUsername: 'old' }),
    ]);
    expect(groups[0].fromUid).toBe('newest');
  });

  it('carries denormalized sharer metadata onto the group', () => {
    const [g] = groupSharesBySharer([
      share({ fromUid: 'u9', fromDisplayName: 'Carol', fromUsername: 'carol', fromAvatarUrl: 'a.png' }),
    ]);
    expect(g).toMatchObject({ displayName: 'Carol', username: 'carol', avatarUrl: 'a.png' });
  });

  it('falls back to "A friend" when the sharer has no display name', () => {
    const [g] = groupSharesBySharer([
      share({ fromUid: 'u0', fromDisplayName: null, fromUsername: null }),
    ]);
    expect(g.displayName).toBe('A friend');
    expect(g.username).toBeNull();
  });

  it('returns an empty array for no shares', () => {
    expect(groupSharesBySharer([])).toEqual([]);
  });
});
