import {
  FlushOutcome,
  QueuedSighting,
  SightingOutboxService,
  SightingSender,
} from './sighting-outbox.service';

const STORAGE_KEY = 'bb.sightingOutbox.v1';

function item(clientId: string): QueuedSighting {
  return {
    clientId,
    bourbonId: 'b1',
    queuedAt: 1,
    payload: {
      clientId,
      bourbonId: 'b1',
      bourbonName: 'Buffalo Trace',
      storeName: 'Total Wine',
      price: 42,
      sightingDateMillis: 1,
      city: null,
      state: null,
      notes: null,
      visibility: 'private',
      lat: null,
      lng: null,
    },
  };
}

/** Force navigator.onLine for a test. */
function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: online,
  });
}

/** Inject a sender without triggering registerSender's auto-flush. */
function setSender(svc: SightingOutboxService, sender: SightingSender): void {
  (svc as unknown as { sender: SightingSender }).sender = sender;
}

describe('SightingOutboxService (BB-182 offline outbox)', () => {
  beforeEach(() => {
    localStorage.clear();
    setOnline(true);
  });

  it('enqueues durably: persists to storage and bumps the pending count', async () => {
    const svc = new SightingOutboxService();
    setSender(svc, async () => 'retry'); // don't let it drain, so we can inspect
    setOnline(false);

    await svc.enqueue(item('a'));

    expect(svc.pending()).toBe(1);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored).toHaveLength(1);
    expect(stored[0].clientId).toBe('a');
  });

  it('loads an existing queue from storage on construction', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([item('a'), item('b')]));
    const svc = new SightingOutboxService();
    expect(svc.pending()).toBe(2);
  });

  it('starts empty when stored data is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const svc = new SightingOutboxService();
    expect(svc.pending()).toBe(0);
  });

  it('flush sends each queued item and clears the ones that succeed', async () => {
    const svc = new SightingOutboxService();
    setOnline(false);
    await svc.enqueue(item('a'));
    await svc.enqueue(item('b'));

    const sent: string[] = [];
    setSender(svc, async (i) => {
      sent.push(i.clientId);
      return 'sent';
    });
    setOnline(true);
    await svc.flush();

    expect(sent).toEqual(['a', 'b']);
    expect(svc.pending()).toBe(0);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string)).toEqual([]);
  });

  it('stops at the first retry and keeps that item and the rest, in order', async () => {
    const svc = new SightingOutboxService();
    setOnline(false);
    await svc.enqueue(item('a'));
    await svc.enqueue(item('b'));
    await svc.enqueue(item('c'));

    const attempted: string[] = [];
    setSender(svc, async (i) => {
      attempted.push(i.clientId);
      return i.clientId === 'a' ? 'sent' : 'retry';
    });
    setOnline(true);
    await svc.flush();

    expect(attempted).toEqual(['a', 'b']); // c never attempted after b retried
    expect(svc.items().map((i) => i.clientId)).toEqual(['b', 'c']);
  });

  it('drops a permanently-failed item so it cannot wedge the queue', async () => {
    const svc = new SightingOutboxService();
    setOnline(false);
    await svc.enqueue(item('a'));
    await svc.enqueue(item('b'));

    const outcomes: Record<string, FlushOutcome> = { a: 'drop', b: 'sent' };
    setSender(svc, async (i) => outcomes[i.clientId]);
    setOnline(true);
    await svc.flush();

    expect(svc.pending()).toBe(0); // 'a' discarded, 'b' sent
  });

  it('treats a thrown sender as retryable (keeps the item)', async () => {
    const svc = new SightingOutboxService();
    setOnline(false);
    await svc.enqueue(item('a'));

    setSender(svc, async () => {
      throw new Error('network down');
    });
    setOnline(true);
    await svc.flush();

    expect(svc.pending()).toBe(1);
  });

  it('does nothing while offline', async () => {
    const svc = new SightingOutboxService();
    setOnline(false);
    await svc.enqueue(item('a'));

    const sender = jest.fn<Promise<FlushOutcome>, [QueuedSighting]>(
      async () => 'sent'
    );
    setSender(svc, sender);
    await svc.flush();

    expect(sender).not.toHaveBeenCalled();
    expect(svc.pending()).toBe(1);
  });

  it('registerSender drains a queue left from a previous session', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([item('a')]));
    const svc = new SightingOutboxService();

    svc.registerSender(async () => 'sent');
    await Promise.resolve(); // let the auto-flush settle

    expect(svc.pending()).toBe(0);
  });

  it('remove is idempotent', async () => {
    const svc = new SightingOutboxService();
    setOnline(false);
    await svc.enqueue(item('a'));

    svc.remove('a');
    svc.remove('a'); // no-op second time
    expect(svc.pending()).toBe(0);
  });
});
