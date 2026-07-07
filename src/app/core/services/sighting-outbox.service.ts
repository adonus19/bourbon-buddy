import { Injectable, computed, signal } from '@angular/core';

/**
 * Offline outbox for sighting capture (BB-182).
 *
 * Sightings are created through the `logSighting` **callable** (server
 * validation + rate limit; direct writes are denied by the rules), and a
 * callable can't be queued by Firestore's offline cache. So we keep our own
 * durable queue: `enqueue` a sighting, and it's replayed via a registered
 * `sender` when connectivity returns. Replay is idempotent because each item
 * carries a `clientId` the server keys the doc on — a re-send after a lost ack
 * never creates a duplicate.
 *
 * Storage is `localStorage` (small, synchronous, survives reloads) — no extra
 * Firestore reads/writes. State is exposed as signals so the UI can show a
 * pending/synced badge (Pass 2). No open listeners.
 */

/** The exact payload sent to the `logSighting` callable. */
export interface LogSightingPayload {
  clientId: string;
  bourbonId: string;
  bourbonName: string | null;
  storeName: string;
  price: number;
  sightingDateMillis: number;
  city: string | null;
  state: string | null;
  notes: string | null;
  visibility: string;
  lat: number | null;
  lng: number | null;
}

/** A queued sighting: the callable payload plus what a post-send recompute needs. */
export interface QueuedSighting {
  clientId: string;
  bourbonId: string;
  payload: LogSightingPayload;
  queuedAt: number;
}

/**
 * Result of attempting to send one queued item:
 *  - `sent`  — succeeded (or idempotently already existed); drop from the queue.
 *  - `retry` — transient/offline; stop and keep it (and the rest) for later.
 *  - `drop`  — permanent failure (e.g. validation); discard so it can't wedge
 *              the queue forever.
 */
export type FlushOutcome = 'sent' | 'retry' | 'drop';

export type SightingSender = (item: QueuedSighting) => Promise<FlushOutcome>;

const STORAGE_KEY = 'bb.sightingOutbox.v1';

@Injectable({ providedIn: 'root' })
export class SightingOutboxService {
  private readonly _items = signal<QueuedSighting[]>(this.load());

  /** Queued (not-yet-synced) sightings, oldest first. */
  readonly items = this._items.asReadonly();
  /** How many sightings are waiting to sync. */
  readonly pending = computed(() => this._items().length);

  private sender: SightingSender | null = null;
  private flushing = false;

  constructor() {
    // Drain the queue the moment connectivity returns.
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', () => void this.flush());
    }
  }

  /**
   * Register the function that actually sends a queued sighting. Called once by
   * `SightingService`; registering also drains anything left from a prior
   * session (Pass 2 wiring).
   */
  registerSender(sender: SightingSender): void {
    this.sender = sender;
    void this.flush();
  }

  /** Queue a sighting durably; then attempt an immediate flush. */
  async enqueue(item: QueuedSighting): Promise<void> {
    this._items.update((q) => [...q, item]);
    this.persist();
    await this.flush();
  }

  /** Remove a queued sighting by its clientId (idempotent). */
  remove(clientId: string): void {
    this._items.update((q) => q.filter((i) => i.clientId !== clientId));
    this.persist();
  }

  /**
   * Try to send every queued sighting in order. Stops at the first `retry`
   * (still offline / transient) so ordering is preserved and we don't hammer a
   * dead network. Re-entrancy-guarded so `online` + an in-flight `enqueue` can't
   * double-send.
   */
  async flush(): Promise<void> {
    if (this.flushing || !this.sender || !this.isOnline()) {
      return;
    }
    this.flushing = true;
    try {
      for (const item of [...this._items()]) {
        let outcome: FlushOutcome;
        try {
          outcome = await this.sender(item);
        } catch {
          outcome = 'retry'; // treat an unexpected throw as transient
        }
        if (outcome === 'retry') {
          break;
        }
        this.remove(item.clientId); // 'sent' or 'drop'
      }
    } finally {
      this.flushing = false;
    }
  }

  private isOnline(): boolean {
    // Absent navigator (SSR/tests) → assume online; only a hard `false` blocks.
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  private load(): QueuedSighting[] {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as QueuedSighting[]) : [];
    } catch {
      return []; // corrupt/unavailable storage → start empty, never crash
    }
  }

  private persist(): void {
    try {
      globalThis.localStorage?.setItem(
        STORAGE_KEY,
        JSON.stringify(this._items())
      );
    } catch {
      // Storage full/unavailable: the in-memory queue still works this session.
    }
  }
}
