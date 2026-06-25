import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  endAt,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAt,
  where,
} from '@angular/fire/firestore';

import { Bourbon } from '../../models';
import { AuthService } from '../auth/auth.service';

/** Fields used to seed a catalog entry when a new bottle name is logged. */
export type CatalogSeed = Pick<
  Bourbon,
  | 'name'
  | 'distillery'
  | 'bottler'
  | 'category'
  | 'subType'
  | 'ageStatement'
  | 'isNas'
  | 'proof'
  | 'series'
>;

/**
 * The shared /bourbons catalog. Reads are intentionally one-shot (getDocs) and
 * caller-debounced — autocomplete fires a single bounded query (limit 10) per
 * keystroke-batch rather than holding an open listener on a growing collection.
 */
@Injectable({ providedIn: 'root' })
export class BourbonCatalogService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /** Prefix search on nameLowercase for the name autocomplete. */
  async search(term: string): Promise<Bourbon[]> {
    const t = term.trim().toLowerCase();
    if (t.length < 2) {
      return [];
    }
    const q = query(
      this.catalogCol(),
      orderBy('nameLowercase'),
      startAt(t),
      endAt(t + ''),
      limit(10)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Bourbon);
  }

  /**
   * Returns the catalog doc id for this bottle name, creating it if no exact
   * (case-insensitive) match exists. Exact-match dedupe for MVP; fuzzy later.
   */
  async findOrCreate(seed: CatalogSeed): Promise<string> {
    const nameLowercase = seed.name.trim().toLowerCase();

    const existing = await getDocs(
      query(this.catalogCol(), where('nameLowercase', '==', nameLowercase), limit(1))
    );
    if (!existing.empty) {
      return existing.docs[0].id;
    }

    const ref = await addDoc(this.catalogCol(), {
      name: seed.name.trim(),
      nameLowercase,
      distillery: seed.distillery ?? null,
      bottler: seed.bottler ?? null,
      category: seed.category ?? null,
      subType: seed.subType ?? null,
      ageStatement: seed.ageStatement ?? null,
      isNas: seed.isNas ?? false,
      proof: seed.proof ?? null,
      msrp: null,
      series: seed.series ?? null,
      createdAt: serverTimestamp(),
      createdByUserId: this.requireUid(),
    });
    return ref.id;
  }

  private catalogCol() {
    return collection(this.firestore, 'bourbons');
  }

  private requireUid(): string {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      throw new Error('Not signed in.');
    }
    return uid;
  }
}
