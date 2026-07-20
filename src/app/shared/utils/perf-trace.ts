/**
 * Minimal timing trace for diagnosing slow UI paths (BB-228a).
 *
 * The Radar → bottle preview sheet path can take ~20s to paint, which is far
 * beyond what its ~5 Firestore round trips should cost. Before changing any
 * Firebase configuration we need to know WHICH read stalls and whether the
 * reads are chained or concurrent — so this records, per span, both a start
 * offset and a duration. Two spans with overlapping [start, start+duration)
 * windows ran concurrently; adjacent ones ran serially.
 *
 * Pure and clock-injectable so it is unit-testable; no Angular, no Firebase.
 */

export interface PerfSpan {
  label: string;
  /** Milliseconds from trace open to this span starting. */
  startMs: number;
  durationMs: number;
  /** Present only when the span was still open when the trace ended. */
  unfinished?: true;
}

export interface PerfReport {
  name: string;
  totalMs: number;
  spans: PerfSpan[];
}

interface OpenSpan {
  label: string;
  startMs: number;
  durationMs: number | null;
}

export class PerfTrace {
  private readonly openedAt: number;
  private readonly entries: OpenSpan[] = [];
  private ended = false;

  constructor(
    readonly name: string,
    private readonly now: () => number = () => performance.now()
  ) {
    this.openedAt = this.now();
  }

  /**
   * Opens a span and returns its end function. Calling the end function more
   * than once is ignored, so a `finally { end(); }` alongside an early return
   * can't corrupt the timing.
   */
  span(label: string): () => void {
    const entry: OpenSpan = {
      label,
      startMs: this.now() - this.openedAt,
      durationMs: null,
    };
    this.entries.push(entry);
    return () => {
      if (entry.durationMs === null) {
        entry.durationMs = this.now() - this.openedAt - entry.startMs;
      }
    };
  }

  /** Closes the trace, force-closing any span still open. */
  end(): PerfReport {
    const totalMs = this.now() - this.openedAt;
    this.ended = true;
    return {
      name: this.name,
      totalMs,
      spans: this.entries.map((e) =>
        e.durationMs === null
          ? {
              label: e.label,
              startMs: e.startMs,
              durationMs: totalMs - e.startMs,
              unfinished: true as const,
            }
          : { label: e.label, startMs: e.startMs, durationMs: e.durationMs }
      ),
    };
  }

  get isEnded(): boolean {
    return this.ended;
  }
}

/** Human-readable one-block summary, safe to `console.log`. */
export function formatTrace(report: PerfReport): string {
  const slowest = report.spans.reduce<PerfSpan | null>(
    (worst, s) => (!worst || s.durationMs > worst.durationMs ? s : worst),
    null
  );
  const lines = report.spans.map((s) => {
    const flags = [
      s.unfinished ? ' (unfinished)' : '',
      s === slowest && report.spans.length > 1 ? ' ← slowest' : '',
    ].join('');
    return `  @${round(s.startMs)}ms  ${s.label}  ${round(s.durationMs)}ms${flags}`;
  });
  return [
    `[perf] ${report.name} — ${round(report.totalMs)}ms total`,
    ...lines,
  ].join('\n');
}

function round(ms: number): number {
  return Math.round(ms);
}
