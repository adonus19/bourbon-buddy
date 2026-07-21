/**
 * Server-side catalog find-or-create (BB-230a).
 *
 * Friends-only sharing (BB-230) shares the *catalog bottle*, but Radar/Dispatch
 * bottles often carry no `bourbonId` (they're only mentioned in an article). The
 * share callable must resolve every share to a shared catalog id so both sides
 * key on the same bottle — reusing the SAME match order the extraction path uses
 * (`matchOrCreateCatalog` in ai/index.ts): nameNormalized → alias → nameLowercase
 * → create. Kept here, decoupled from Firestore init, so it's reusable + testable.
 */
import { FieldValue } from "firebase-admin/firestore";

import { normalizeBottleName } from "./normalize";

export interface FoundBourbon {
  id: string;
  name: string;
  distillery: string | null;
  category: string | null;
}

export interface FindOrCreateInput {
  /** Prefer this catalog id when it resolves; falls back to name lookup. */
  bourbonId?: string | null;
  name?: string | null;
  distillery?: string | null;
  category?: string | null;
  /** Stamped on a freshly created catalog doc for provenance. */
  createdByUserId: string;
}

/** The subset of the Firestore API this helper touches (keeps it testable). */
export interface CatalogDb {
  collection(path: string): {
    where(
      field: string,
      op: string,
      value: unknown
    ): { limit(n: number): { get(): Promise<QuerySnap> } };
    doc(id?: string): {
      id: string;
      get?(): Promise<DocSnap>;
      set(data: Record<string, unknown>): Promise<unknown>;
    };
  };
}

interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface QuerySnap {
  empty: boolean;
  docs: DocSnap[];
}

function fromSnap(snap: DocSnap): FoundBourbon {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    name: typeof d.name === "string" ? d.name : "",
    distillery: typeof d.distillery === "string" ? d.distillery : null,
    category: typeof d.category === "string" ? d.category : null,
  };
}

export async function findOrCreateBourbon(
  db: CatalogDb,
  input: FindOrCreateInput
): Promise<FoundBourbon> {
  const col = db.collection("bourbons");

  // An explicit catalog id wins when it actually resolves.
  if (input.bourbonId) {
    const ref = col.doc(input.bourbonId);
    const snap = ref.get ? await ref.get() : null;
    if (snap?.exists) {
      return fromSnap(snap);
    }
  }

  const name = (input.name ?? "").trim();
  if (!name) {
    throw new Error("findOrCreateBourbon: a resolvable bourbonId or a name is required.");
  }
  const key = normalizeBottleName(name);
  const nameLowercase = name.toLowerCase();

  // Same match order the client and extraction paths use.
  const byName = await col.where("nameNormalized", "==", key).limit(1).get();
  if (!byName.empty) {
    return fromSnap(byName.docs[0]);
  }
  const byAlias = await col.where("aliases", "array-contains", key).limit(1).get();
  if (!byAlias.empty) {
    return fromSnap(byAlias.docs[0]);
  }
  const byLower = await col.where("nameLowercase", "==", nameLowercase).limit(1).get();
  if (!byLower.empty) {
    return fromSnap(byLower.docs[0]);
  }

  // No match — create the shared catalog entry so the share has a bourbonId.
  const ref = col.doc();
  const distillery = input.distillery ?? null;
  const category = input.category ?? null;
  await ref.set({
    name,
    nameLowercase,
    nameNormalized: key,
    aliases: [],
    canonicalId: null,
    distillery,
    bottler: null,
    category,
    subType: null,
    ageStatement: null,
    isNas: false,
    proof: null,
    msrp: null,
    releaseType: null,
    series: null,
    createdAt: FieldValue.serverTimestamp(),
    createdByUserId: input.createdByUserId,
  });
  return { id: ref.id, name, distillery, category };
}
