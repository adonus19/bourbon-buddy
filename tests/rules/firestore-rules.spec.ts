/**
 * Gated-access Security Rules matrix (BB-210).
 *
 * Three personas against the deployed rules file:
 *   - pending:  signed in, NO claims — can touch only their own profile doc
 *   - approved: `approved: true` claim — full normal access
 *   - admin:    `admin: true` claim — approval queue + allowlist, and passes
 *               isApproved() so the owner can never lock themself out
 *
 * Runs inside `firebase emulators:exec` (npm run test:rules).
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

const PENDING = 'pending-uid';
const APPROVED = 'approved-uid';
const ADMIN = 'admin-uid';

const pendingDb = () => env.authenticatedContext(PENDING).firestore();
const approvedDb = () =>
  env.authenticatedContext(APPROVED, { approved: true }).firestore();
const adminDb = () =>
  env.authenticatedContext(ADMIN, { admin: true }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'bb-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `users/${PENDING}`), {
      displayName: 'Pending Pete',
      accessStatus: 'pending',
    });
    await setDoc(doc(db, `users/${APPROVED}`), {
      displayName: 'Approved Amy',
      accessStatus: 'approved',
    });
    await setDoc(doc(db, 'bourbons/b1'), { name: 'Test Bourbon' });
    await setDoc(doc(db, 'newsArticles/a1'), { title: 'News' });
    await setDoc(doc(db, `publicProfiles/${APPROVED}`), {
      displayName: 'Approved Amy',
    });
    await setDoc(doc(db, 'accessAllowlist/friend@example.com'), {
      note: 'seeded',
    });
  });
});

describe('pending user (signed in, no claims)', () => {
  it('can read their own profile doc (the pending screen needs it)', async () => {
    await assertSucceeds(getDoc(doc(pendingDb(), `users/${PENDING}`)));
  });

  it('can update their own profile fields', async () => {
    await assertSucceeds(
      updateDoc(doc(pendingDb(), `users/${PENDING}`), { displayName: 'Pete' })
    );
  });

  it('can create their own profile doc without accessStatus (ensureProfile)', async () => {
    const db = env.authenticatedContext('brand-new-uid').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/brand-new-uid'), { displayName: 'New' })
    );
  });

  it('cannot mint accessStatus on create', async () => {
    const db = env.authenticatedContext('sneaky-uid').firestore();
    await assertFails(
      setDoc(doc(db, 'users/sneaky-uid'), {
        displayName: 'Sneaky',
        accessStatus: 'approved',
      })
    );
  });

  it('cannot change accessStatus on update', async () => {
    await assertFails(
      updateDoc(doc(pendingDb(), `users/${PENDING}`), {
        accessStatus: 'approved',
      })
    );
  });

  it('cannot write their own subcollections', async () => {
    await assertFails(
      setDoc(doc(pendingDb(), `users/${PENDING}/logEntries/e1`), {
        bottleName: 'Nope',
      })
    );
  });

  it('cannot read the shared catalog, news, or public profiles', async () => {
    await assertFails(getDoc(doc(pendingDb(), 'bourbons/b1')));
    await assertFails(getDoc(doc(pendingDb(), 'newsArticles/a1')));
    await assertFails(getDoc(doc(pendingDb(), `publicProfiles/${APPROVED}`)));
  });

  it('cannot see the allowlist', async () => {
    await assertFails(
      getDoc(doc(pendingDb(), 'accessAllowlist/friend@example.com'))
    );
  });
});

describe('approved user', () => {
  it('reads the catalog, news, and public profiles as before', async () => {
    await assertSucceeds(getDoc(doc(approvedDb(), 'bourbons/b1')));
    await assertSucceeds(getDoc(doc(approvedDb(), 'newsArticles/a1')));
    await assertSucceeds(
      getDoc(doc(approvedDb(), `publicProfiles/${APPROVED}`))
    );
  });

  it('writes their own subcollections as before', async () => {
    await assertSucceeds(
      setDoc(doc(approvedDb(), `users/${APPROVED}/logEntries/e1`), {
        bottleName: 'Blanton’s',
      })
    );
  });

  it('still cannot touch accessStatus, even approved', async () => {
    await assertFails(
      updateDoc(doc(approvedDb(), `users/${APPROVED}`), {
        accessStatus: 'denied',
      })
    );
  });

  it("cannot read another user's profile doc or the allowlist", async () => {
    await assertFails(getDoc(doc(approvedDb(), `users/${PENDING}`)));
    await assertFails(
      getDoc(doc(approvedDb(), 'accessAllowlist/friend@example.com'))
    );
  });
});

describe('admin', () => {
  it('reads any profile doc and queries the pending queue', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), `users/${PENDING}`)));
    await assertSucceeds(
      getDocs(
        query(
          collection(adminDb(), 'users'),
          where('accessStatus', '==', 'pending')
        )
      )
    );
  });

  it('manages the allowlist', async () => {
    await assertSucceeds(
      setDoc(doc(adminDb(), 'accessAllowlist/new@example.com'), {
        note: 'Mike from work',
        addedAt: new Date(),
      })
    );
    await assertSucceeds(
      deleteDoc(doc(adminDb(), 'accessAllowlist/friend@example.com'))
    );
  });

  it('passes isApproved() without a separate approved claim', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), 'bourbons/b1')));
  });

  it('still cannot write accessStatus from the client (Admin SDK only)', async () => {
    await assertFails(
      updateDoc(doc(adminDb(), `users/${PENDING}`), {
        accessStatus: 'approved',
      })
    );
  });
});

describe('signed out', () => {
  it('gets nothing', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'bourbons/b1')));
    await assertFails(getDoc(doc(db, `users/${PENDING}`)));
  });
});
