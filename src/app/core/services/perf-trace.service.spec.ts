import { PerfTraceService } from './perf-trace.service';

describe('PerfTraceService', () => {
  let service: PerfTraceService;
  let logged: string[];

  beforeEach(() => {
    logged = [];
    service = new PerfTraceService();
    service.configure({ enabled: true, sink: (line) => logged.push(line) });
  });

  it('returns a no-op end function when no trace is active', () => {
    // Child components call span() unconditionally; with no open trace this
    // must be harmless rather than throwing.
    const end = service.span('orphan');
    expect(() => end()).not.toThrow();
    expect(logged).toHaveLength(0);
  });

  it('collects spans from separate callers into one trace and logs on end', () => {
    service.start('preview-sheet');
    service.span('catalog.getById')();
    service.span('similar-bottles.getById')();
    service.end();

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('preview-sheet');
    expect(logged[0]).toContain('catalog.getById');
    expect(logged[0]).toContain('similar-bottles.getById');
  });

  it('does nothing at all when disabled', () => {
    service.configure({ enabled: false, sink: (line) => logged.push(line) });
    service.start('preview-sheet');
    service.span('catalog.getById')();
    service.end();

    expect(logged).toHaveLength(0);
  });

  it('starting a new trace discards an abandoned one instead of leaking spans', () => {
    // A sheet dismissed mid-load never calls end(); the next open must not
    // inherit its spans.
    service.start('first');
    service.span('stale-read');
    service.start('second');
    service.span('fresh-read')();
    service.end();

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('second');
    expect(logged[0]).toContain('fresh-read');
    expect(logged[0]).not.toContain('stale-read');
  });

  it('measure() returns the caller promise untouched when no trace is active', async () => {
    // Guards against instrumentation adding a microtask tick to every read,
    // which would shift how many ticks callers must flush.
    const work = Promise.resolve('value');
    const returned = service.measure('untraced', () => work);

    expect(returned).toBe(work);
    await expect(returned).resolves.toBe('value');
  });

  it('measure() times the work and still records it when the work rejects', async () => {
    service.start('preview-sheet');
    await expect(
      service.measure('boom', () => Promise.reject(new Error('nope')))
    ).rejects.toThrow('nope');
    service.end();

    // A read that fails after 20s is a finding, not a gap in the trace.
    expect(logged[0]).toContain('boom');
  });

  it('ignores a second end() for the same trace', () => {
    service.start('preview-sheet');
    service.end();
    service.end();

    expect(logged).toHaveLength(1);
  });
});
