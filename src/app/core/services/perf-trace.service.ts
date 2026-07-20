import { Injectable } from '@angular/core';

import { environment } from '../../../environments/environment';
import { PerfTrace, formatTrace } from '../../shared/utils/perf-trace';

/** Where formatted traces go. Swapped in tests; `console.log` in the app. */
export type PerfSink = (line: string) => void;

export interface PerfTraceConfig {
  enabled: boolean;
  sink: PerfSink;
}

/**
 * Shares ONE timing trace across the components that make up a single UI path
 * (BB-228a). The bottle preview sheet fans out to `similar-bottles`,
 * `price-history` and `critic-summary`, each of which reads independently — a
 * per-component timer would hide whether those reads are chained or concurrent,
 * which is exactly the question behind the ~20s open.
 *
 * Diagnostic only: disabled in production builds, and every method is a no-op
 * when there is no active trace, so callers never need a guard.
 */
@Injectable({ providedIn: 'root' })
export class PerfTraceService {
  private config: PerfTraceConfig = {
    // Gated on the HOSTNAME, not just `environment.production` — deliberately,
    // and for the same reason App Check's debug-token switch is
    // (see app.module.ts).
    //
    // `environment.production` is NOT a reliable "is deployed" signal in this
    // repo: .github/workflows/deploy.yml deploys with `npm run build:staging`,
    // and the `staging` configuration has no fileReplacements — so the LIVE
    // site runs environment.ts with `production: false`. Gating on that alone
    // would print perf traces to every real user's console.
    // Only true local dev traces.
    enabled: !environment.production && isLocalhost(),
    sink: (line) => console.log(line),
  };
  private current: PerfTrace | null = null;

  /** Test seam / kill-switch. */
  configure(config: Partial<PerfTraceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Opens a trace, replacing any abandoned one. A sheet dismissed mid-load
   * never calls `end()`, so the next open must start clean rather than inherit
   * the previous path's spans.
   */
  start(name: string): void {
    if (!this.config.enabled) {
      return;
    }
    this.current = new PerfTrace(name);
  }

  /** Opens a span on the active trace. Returns a no-op when none is active. */
  span(label: string): () => void {
    return this.current?.span(label) ?? NOOP;
  }

  /** Closes and logs the active trace. Safe to call twice. */
  end(): void {
    const trace = this.current;
    if (!trace) {
      return;
    }
    this.current = null;
    this.config.sink(formatTrace(trace.end()));
  }

  /**
   * Times an async operation as one span, closing it whether it resolves or
   * rejects — a read that throws after 20s is a finding, not a gap.
   */
  measure<T>(label: string, work: () => Promise<T>): Promise<T> {
    // With no active trace there is nothing to record, so hand the caller's
    // promise back untouched. Wrapping it would insert an extra microtask tick
    // into every instrumented read — enough to change how many ticks a
    // component's callers must flush, which is observable in tests and pure
    // overhead in production where tracing is off.
    if (!this.current) {
      return work();
    }
    const end = this.span(label);
    return work().finally(end);
  }
}

const NOOP = (): void => {};

/** True only for a dev server on this machine — never a deployed origin. */
function isLocalhost(): boolean {
  return (
    typeof location !== 'undefined' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  );
}
