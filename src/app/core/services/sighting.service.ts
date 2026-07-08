import { Injectable, inject } from '@angular/core';
import {
  DocumentData,
  Firestore,
  QueryConstraint,
  QueryDocumentSnapshot,
  collection,
  collectionData,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { Sighting, SightingVisibility } from '../../models';
import { AuthService } from '../auth/auth.service';
import { GeolocationService } from './geolocation.service';
import { bestNonStalePrice } from '../../shared/utils/sighting';
import { isRetryableSightingError } from '../../shared/utils/sighting-error';
import {
  LogSightingPayload,
  QueuedSighting,
  SightingOutboxService,
} from './sighting-outbox.service';

/** Caller-supplied sighting fields; the service fills the rest. */
export type SightingInput = Pick<
  Sighting,
  'storeName' | 'price' | 'sightingDate' | 'city' | 'state' | 'notes'
>;

/**
 * Outcome of `add` (BB-182): `sent` reached the server; `queued` was saved to
 * the offline outbox and will sync later. Lets the caller tailor its toast.
 */
export type SightingAddResult = 'sent' | 'queued';

/**
 * First-class, catalog-keyed sightings (BB-161): top-level `/sightings`,
 * keyed by `bourbonId`, decoupled from any wishlist. A wishlist entry's
 * sightings are a query by `bourbonId`. Each mutation recomputes the user's
 * cached `bestSightingPrice` for any of their wishlist entries on that bottle.
 * (Friend visibility + cross-user recompute land in BB-110/112.)
 */
@Injectable({ providedIn: 'root' })
export class SightingService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly auth = inject(AuthService);
  private readonly outbox = inject(SightingOutboxService);
  private readonly geo = inject(GeolocationService);

  constructor() {
    // Replay queued offline sightings through the same send path; registering
    // also drains anything left over from a previous session (BB-182).
    this.outbox.registerSender((item) => this.sendQueued(item));
  }

  /** The current user's own sightings for a bottle, lowest price first. */
  sightingsForBottle(bourbonId: string): Observable<Sighting[]> {
    return this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (collectionData(
              query(
                this.col(),
                where('bourbonId', '==', bourbonId),
                where('spotterUid', '==', user.uid),
                orderBy('price', 'asc')
              ),
              { idField: 'id' }
            ) as Observable<Sighting[]>)
          : of<Sighting[]>([])
      )
    );
  }

  /**
   * Creates a sighting via the `logSighting` callable (BB-163) — server-side
   * validation + per-user daily rate limit; direct client writes to /sightings
   * are denied by the rules. Then recomputes the user's cached best price.
   *
   * Offline-first (BB-182): we try to send immediately; if that fails because
   * we're offline/transient, the sighting is queued in the outbox and synced
   * later (idempotently, via its clientId). A permanent rejection (validation /
   * rate limit) is thrown so the form can show it.
   */
  async add(
    bourbonId: string,
    bourbonName: string | null,
    input: SightingInput,
    visibility: SightingVisibility = 'private',
    location: { lat: number; lng: number } | null = null,
    // The store picked from the nearby list (BB-191); lets the server attest
    // the spotter was physically at the store ("Spotted on-site" badge).
    store: { id?: string | null; lat: number; lng: number } | null = null
  ): Promise<SightingAddResult> {
    this.requireUid(); // fail fast (and permanently) if not signed in
    const payload: LogSightingPayload = {
      clientId: this.newClientId(),
      bourbonId,
      bourbonName: bourbonName ?? null,
      storeName: input.storeName,
      price: input.price,
      sightingDateMillis: input.sightingDate.toMillis(),
      city: input.city ?? null,
      state: input.state ?? null,
      notes: input.notes ?? null,
      visibility,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      store,
    };

    try {
      await this.sendSighting(payload);
      return 'sent';
    } catch (err) {
      if (isRetryableSightingError(err)) {
        // Offline / transient — durably queue it and report success; the outbox
        // replays it when connectivity returns.
        await this.outbox.enqueue({
          clientId: payload.clientId,
          bourbonId,
          payload,
          queuedAt: Date.now(),
        });
        return 'queued';
      }
      throw err; // permanent — surface to the caller
    }
  }

  /**
   * Sends one sighting payload through the callable and recomputes best price.
   * Throws on any failure (caller/outbox classify it). The recompute folds in
   * the just-created sighting to beat the read-after-write index lag.
   */
  private async sendSighting(payload: LogSightingPayload): Promise<void> {
    const uid = this.requireUid();
    const callable = httpsCallable<LogSightingPayload, { id: string }>(
      this.functions,
      'logSighting'
    );
    const res = await callable(payload);
    await this.recomputeBestPrice(uid, payload.bourbonId, {
      id: res.data?.id,
      price: payload.price,
      sightingDate: Timestamp.fromMillis(payload.sightingDateMillis),
    });
  }

  /**
   * Vote on a friend's sighting (BB-194): "still there" or "gone". Requires
   * being physically at the store — the device position is captured here and
   * verified server-side against the sighting's coordinates, so votes can't be
   * cast from the couch. Throws LOCATION_REQUIRED when no position is available.
   */
  async confirm(
    sightingId: string,
    verdict: 'confirm' | 'dispute'
  ): Promise<{ verdict: string; changed: boolean }> {
    const coords = await this.geo.getCurrentPosition();
    if (!coords) {
      throw new Error('LOCATION_REQUIRED');
    }
    const callable = httpsCallable<
      { sightingId: string; verdict: string; lat: number; lng: number },
      { verdict: string; changed: boolean }
    >(this.functions, 'confirmSighting');
    return (await callable({ sightingId, verdict, ...coords })).data;
  }

  /** Outbox sender: never throws — maps failures to keep/drop for the queue. */
  private async sendQueued(item: QueuedSighting): Promise<'sent' | 'retry' | 'drop'> {
    try {
      await this.sendSighting(item.payload);
      return 'sent';
    } catch (err) {
      return isRetryableSightingError(err) ? 'retry' : 'drop';
    }
  }

  /** Doc-id-safe idempotency key (matches the server's CLIENT_ID_RE). */
  private newClientId(): string {
    return (
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    );
  }

  /** Max friends we fan a single feed query across (Firestore `in` cap). */
  static readonly FEED_UID_CAP = 30;

  /**
   * One page of friends' shared sightings, newest-first (BB-111). A one-shot
   * paginated read (not a listener) — the feed is a pull surface, so this avoids
   * an always-open listener re-reading on every friend's sighting change. Bounded
   * by `pageSize` and by at most 30 spotter UIDs (the `in` limit). Pass the last
   * doc of the previous page as `after` to page forward.
   */
  async friendsFeedPage(
    spotterUids: string[],
    pageSize: number,
    after?: QueryDocumentSnapshot<DocumentData> | null
  ): Promise<{
    items: Sighting[];
    last: QueryDocumentSnapshot<DocumentData> | null;
  }> {
    const uids = spotterUids.slice(0, SightingService.FEED_UID_CAP);
    if (!uids.length) {
      return { items: [], last: null };
    }
    const constraints: QueryConstraint[] = [
      where('visibility', '==', 'friends'),
      where('spotterUid', 'in', uids),
      orderBy('createdAt', 'desc'),
    ];
    if (after) {
      constraints.push(startAfter(after));
    }
    constraints.push(limit(pageSize));

    const snap = await getDocs(query(this.col(), ...constraints));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sighting);
    const last =
      snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null;
    return { items, last };
  }

  /**
   * Friends' shared + the user's own sightings, for the nearby-sightings map
   * (BB-179). Two bounded one-shot reads (no per-marker fan-out); the caller
   * filters to those with coordinates, non-stale, and within radius.
   */
  async nearbySightings(
    friendUids: string[],
    selfUid: string,
    max = 200
  ): Promise<Sighting[]> {
    const uids = friendUids.slice(0, SightingService.FEED_UID_CAP);
    const toItems = (s: {
      docs: QueryDocumentSnapshot<DocumentData>[];
    }): Sighting[] =>
      s.docs.map((d) => ({ id: d.id, ...d.data() }) as Sighting);

    const reads: Promise<Sighting[]>[] = [
      // The user's own sightings (any visibility). Bare equality — no index.
      getDocs(
        query(this.col(), where('spotterUid', '==', selfUid), limit(max))
      ).then(toItems),
    ];
    if (uids.length) {
      // Friends' shared sightings (reuses the feed's composite index).
      reads.push(
        getDocs(
          query(
            this.col(),
            where('visibility', '==', 'friends'),
            where('spotterUid', 'in', uids),
            orderBy('createdAt', 'desc'),
            limit(max)
          )
        ).then(toItems)
      );
    }

    const byId = new Map<string, Sighting>();
    for (const arr of await Promise.all(reads)) {
      for (const s of arr) {
        if (s.id) {
          byId.set(s.id, s);
        }
      }
    }
    return [...byId.values()];
  }

  async setStale(
    sightingId: string,
    bourbonId: string,
    stale: boolean
  ): Promise<void> {
    const uid = this.requireUid();
    await updateDoc(this.sightingDoc(sightingId), { markedStaleManually: stale });
    await this.recomputeBestPrice(uid, bourbonId);
  }

  async remove(sightingId: string, bourbonId: string): Promise<void> {
    const uid = this.requireUid();
    await deleteDoc(this.sightingDoc(sightingId));
    await this.recomputeBestPrice(uid, bourbonId);
  }

  /**
   * Recomputes `bestSightingPrice` (lowest non-stale price among the user's own
   * sightings) onto any of the user's wishlist entries for this bottle.
   */
  private async recomputeBestPrice(
    uid: string,
    bourbonId: string,
    justAdded?: { id?: string; price: number; sightingDate: Timestamp }
  ): Promise<void> {
    const mine = await getDocs(
      query(
        this.col(),
        where('bourbonId', '==', bourbonId),
        where('spotterUid', '==', uid)
      )
    );
    const sightings = mine.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as Sighting
    );
    // Include the just-added sighting if the query hasn't caught up to it yet
    // (deduped by id, so no double-count once the index does catch up).
    if (justAdded && !sightings.some((s) => s.id === justAdded.id)) {
      sightings.push({
        id: justAdded.id,
        price: justAdded.price,
        sightingDate: justAdded.sightingDate,
        markedStaleManually: false,
      } as Sighting);
    }
    const best = bestNonStalePrice(sightings);

    const entries = await getDocs(
      query(
        collection(this.firestore, `users/${uid}/wishlistEntries`),
        where('bourbonId', '==', bourbonId)
      )
    );
    await Promise.all(
      entries.docs.map((d) =>
        updateDoc(d.ref, {
          bestSightingPrice: best,
          updatedAt: serverTimestamp(),
        })
      )
    );
  }

  private col() {
    return collection(this.firestore, 'sightings');
  }
  private sightingDoc(sightingId: string) {
    return doc(this.firestore, `sightings/${sightingId}`);
  }

  private requireUid(): string {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      throw new Error('Not signed in.');
    }
    return uid;
  }
}
