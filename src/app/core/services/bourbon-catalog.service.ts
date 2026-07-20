import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  QueryConstraint,
  addDoc,
  arrayUnion,
  collection,
  doc,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAt,
  updateDoc,
  where,
} from '@angular/fire/firestore';

import { Functions, httpsCallable } from '@angular/fire/functions';

import { Bourbon, FlavorProfile } from '../../models';
import { AuthService } from '../auth/auth.service';
import { normalizeBottleName } from '../../shared/utils/normalize-name';
import { normalizeBarcode } from '../../shared/utils/barcode';
import { blendedProfileTags } from '../../shared/utils/flavor-provenance';

/** AI-suggested tasting tags for a bottle (BB-186), canonical labels (BB-181). */
export interface FlavorSuggestions {
  nose: string[];
  palate: string[];
  finish: string[];
}

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
  private readonly functions = inject(Functions);
  private readonly auth = inject(AuthService);

  /**
   * Short-lived catalog-doc cache (BB-228c). Deliberately brief: catalog docs
   * are enriched server-side (flavor profiles, critic signals, similar bottles),
   * so a long TTL would show stale data. This exists to collapse duplicate reads
   * within a single screen open, not to be a durable store — Firestore's own
   * IndexedDB cache already covers that.
   */
  private static readonly DOC_TTL_MS = 30_000;
  private static readonly DOC_CACHE_MAX = 50;
  private readonly docCache = new Map<
    string,
    { at: number; value: Bourbon | null }
  >();
  private readonly inFlight = new Map<string, Promise<Bourbon | null>>();

  /**
   * AI flavor suggestions for a bottle (BB-186), via the `enrichBottleFlavor`
   * callable (BB-185). The server returns a cached profile or generates one on
   * the spot (enrich-at-point-of-use), so this is a single round-trip.
   * Best-effort: returns null on any failure or empty profile, so the picker
   * simply opens empty.
   */
  async getFlavorSuggestions(
    bourbonId: string
  ): Promise<FlavorSuggestions | null> {
    if (!bourbonId) {
      return null;
    }
    try {
      const callable = httpsCallable<
        { bourbonId: string },
        { flavorProfile: Partial<FlavorProfile> | null }
      >(this.functions, 'enrichBottleFlavor');
      const profile = (await callable({ bourbonId })).data?.flavorProfile;
      if (!profile) {
        return null;
      }
      // Blend the community tier (BB-188) over the AI/review arrays so prefill
      // offers what tasters confirmed first.
      const tags: FlavorSuggestions = blendedProfileTags(profile as FlavorProfile);
      return tags.nose.length || tags.palate.length || tags.finish.length
        ? tags
        : null;
    } catch {
      return null; // best-effort — never block logging on enrichment
    }
  }

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
   * Returns the catalog doc id for this bottle name, creating it only if no
   * canonical match exists (BB-160). Matching folds case/punctuation/diacritics
   * via the normalized key, plus legacy `nameLowercase` and merged `aliases`, so
   * "Blanton's" and "Blantons" resolve to one entry. Match is exact-on-normalized
   * (not fuzzy) to avoid collapsing genuinely different bottles.
   */
  async findOrCreate(seed: CatalogSeed): Promise<string> {
    const trimmed = seed.name.trim();
    const nameLowercase = trimmed.toLowerCase();
    const nameNormalized = normalizeBottleName(trimmed);

    const match =
      (await this.firstMatch(where('nameNormalized', '==', nameNormalized))) ??
      (await this.firstMatch(where('aliases', 'array-contains', nameNormalized))) ??
      // Legacy docs created before BB-160 only have nameLowercase.
      (await this.firstMatch(where('nameLowercase', '==', nameLowercase)));
    if (match) {
      return match;
    }

    const ref = await addDoc(this.catalogCol(), {
      name: trimmed,
      nameLowercase,
      nameNormalized,
      aliases: [],
      canonicalId: null,
      distillery: seed.distillery ?? null,
      bottler: seed.bottler ?? null,
      category: seed.category ?? null,
      subType: seed.subType ?? null,
      ageStatement: seed.ageStatement ?? null,
      isNas: seed.isNas ?? false,
      proof: seed.proof ?? null,
      msrp: null,
      series: seed.series ?? null,
      upc: [],
      createdAt: serverTimestamp(),
      createdByUserId: this.requireUid(),
    });
    return ref.id;
  }

  /**
   * One-shot read of a catalog bottle by id (BB-197: detail pages fetch it for
   * the precomputed `similarBottles`). Not a listener on purpose — a detail
   * view needs one snapshot, and the neighbor list only changes server-side
   * on enrichment sweeps.
   */
  async getById(bourbonId: string): Promise<Bourbon | null> {
    if (!bourbonId) {
      return null;
    }

    const cached = this.docCache.get(bourbonId);
    if (cached && Date.now() - cached.at < BourbonCatalogService.DOC_TTL_MS) {
      return cached.value;
    }

    // Share one request between simultaneous callers. The preview sheet and its
    // similar-bottles child both ask for the same doc within a few ms (BB-228a),
    // and without this each opened its own round trip.
    const pending = this.inFlight.get(bourbonId);
    if (pending) {
      return pending;
    }

    const request = (async () => {
      const snap = await getDoc(doc(this.firestore, 'bourbons', bourbonId));
      return snap.exists()
        ? ({ id: snap.id, ...snap.data() } as Bourbon)
        : null;
    })();
    this.inFlight.set(bourbonId, request);

    try {
      const value = await request;
      this.cacheDoc(bourbonId, value); // only on success — a failed read must
      return value; // not poison the cache
    } finally {
      this.inFlight.delete(bourbonId);
    }
  }

  /** Drops a cached doc — call after any write that changes it. */
  invalidate(bourbonId: string): void {
    this.docCache.delete(bourbonId);
  }

  private cacheDoc(bourbonId: string, value: Bourbon | null): void {
    // Bounded: evict oldest-inserted once over the cap so a long session can't
    // grow this without limit.
    if (this.docCache.size >= BourbonCatalogService.DOC_CACHE_MAX) {
      const oldest = this.docCache.keys().next().value;
      if (oldest !== undefined) {
        this.docCache.delete(oldest);
      }
    }
    this.docCache.set(bourbonId, { at: Date.now(), value });
  }

  /**
   * Look up a catalog bottle by a scanned/typed barcode (BB-175). The index is
   * crowdsourced: `upc` is populated as users confirm bottles for codes. One
   * bounded query; returns null for an unknown or malformed code.
   */
  async findByUpc(code: string): Promise<Bourbon | null> {
    const normalized = normalizeBarcode(code);
    if (!normalized) {
      return null;
    }
    const snap = await getDocs(
      query(
        this.catalogCol(),
        where('upc', 'array-contains', normalized),
        limit(1)
      )
    );
    return snap.empty
      ? null
      : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Bourbon);
  }

  /**
   * Associate a barcode with a catalog bottle so future scans resolve instantly
   * (BB-175). Idempotent via arrayUnion; no-ops on a malformed code.
   */
  async addUpc(bourbonId: string, code: string): Promise<void> {
    const normalized = normalizeBarcode(code);
    if (!normalized) {
      return;
    }
    await updateDoc(doc(this.firestore, 'bourbons', bourbonId), {
      upc: arrayUnion(normalized),
    });
    this.invalidate(bourbonId); // the doc just changed (BB-228c)
  }

  /** Returns the id of the first catalog doc matching the constraint, or null. */
  private async firstMatch(constraint: QueryConstraint): Promise<string | null> {
    const snap = await getDocs(query(this.catalogCol(), constraint, limit(1)));
    return snap.empty ? null : snap.docs[0].id;
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
