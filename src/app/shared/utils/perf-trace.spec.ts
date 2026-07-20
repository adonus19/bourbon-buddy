import { PerfTrace, formatTrace } from './perf-trace';

/** Deterministic clock: each call returns the next queued millisecond value. */
function fakeClock(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('PerfTrace', () => {
  it('records a span with its start offset and duration', () => {
    // open=0, span start=10, span end=35, trace end=40
    const trace = new PerfTrace('sheet', fakeClock([0, 10, 35, 40]));
    const end = trace.span('catalog.getById');
    end();
    const report = trace.end();

    expect(report.name).toBe('sheet');
    expect(report.totalMs).toBe(40);
    expect(report.spans).toEqual([
      { label: 'catalog.getById', startMs: 10, durationMs: 25 },
    ]);
  });

  it('keeps spans in the order they were started', () => {
    const trace = new PerfTrace('sheet', fakeClock([0, 5, 10, 20, 30, 50]));
    const a = trace.span('a'); // starts 5
    const b = trace.span('b'); // starts 10
    a(); // ends 20 → 15ms
    b(); // ends 30 → 20ms
    const report = trace.end();

    expect(report.spans.map((s) => s.label)).toEqual(['a', 'b']);
    expect(report.spans[0].durationMs).toBe(15);
    expect(report.spans[1].durationMs).toBe(20);
  });

  it('is idempotent — ending a span twice does not change its duration', () => {
    const trace = new PerfTrace('sheet', fakeClock([0, 10, 20, 999, 1000]));
    const end = trace.span('once');
    end();
    end(); // second call must be ignored
    const report = trace.end();

    expect(report.spans).toHaveLength(1);
    expect(report.spans[0].durationMs).toBe(10);
  });

  it('closes spans left open when the trace ends and flags them as unfinished', () => {
    const trace = new PerfTrace('sheet', fakeClock([0, 5, 25]));
    trace.span('never-finished'); // starts at 5, never ended
    const report = trace.end(); // ends at 25

    // A read still in flight when the sheet is dismissed is exactly the 20s
    // symptom we're hunting, so it must be visible rather than dropped.
    expect(report.spans[0]).toEqual({
      label: 'never-finished',
      startMs: 5,
      durationMs: 20,
      unfinished: true,
    });
  });

  it('reports zero spans and a total for a trace with no work', () => {
    const trace = new PerfTrace('empty', fakeClock([0, 12]));
    const report = trace.end();

    expect(report.spans).toEqual([]);
    expect(report.totalMs).toBe(12);
  });
});

describe('formatTrace', () => {
  it('renders each span with its start offset so serial vs parallel is visible', () => {
    const text = formatTrace({
      name: 'preview-sheet',
      totalMs: 100,
      spans: [
        { label: 'catalog.getById', startMs: 0, durationMs: 40 },
        { label: 'friendsOnce', startMs: 40, durationMs: 30 },
        { label: 'priceHistory', startMs: 70, durationMs: 25 },
      ],
    });

    expect(text).toContain('preview-sheet');
    expect(text).toContain('100ms');
    // Each span shows "start+duration" so a reader can spot chaining.
    expect(text).toContain('catalog.getById');
    expect(text).toContain('@0ms');
    expect(text).toContain('40ms');
    expect(text).toContain('friendsOnce');
    expect(text).toContain('@40ms');
  });

  it('flags the longest span so the bottleneck is obvious', () => {
    const text = formatTrace({
      name: 'preview-sheet',
      totalMs: 200,
      spans: [
        { label: 'fast', startMs: 0, durationMs: 5 },
        { label: 'slow', startMs: 5, durationMs: 190 },
      ],
    });

    expect(text).toMatch(/slow.*← slowest/s);
  });
});
