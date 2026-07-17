import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';

import { CriticSignal } from '../../../models';
import { CriticSummaryComponent } from './critic-summary.component';

const signal = (over: Partial<CriticSignal> = {}): CriticSignal => ({
  score: null,
  verdict: null,
  sourceName: 'Whiskey Advocate',
  at: Timestamp.fromMillis(1000),
  ...over,
});

const map = (...signals: CriticSignal[]): Record<string, CriticSignal> =>
  Object.fromEntries(signals.map((s, i) => [`a${i}`, s]));

describe('CriticSummaryComponent (BB-221)', () => {
  let fixture: ComponentFixture<CriticSummaryComponent>;
  let el: HTMLElement;

  const setSignals = (value: Record<string, CriticSignal> | null): void => {
    fixture.componentRef.setInput('signals', value);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CriticSummaryComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(CriticSummaryComponent);
  });

  it('renders nothing when there are no signals', () => {
    setSignals(null);
    expect(el.querySelector('.critic')).toBeNull();
    setSignals({});
    expect(el.querySelector('.critic')).toBeNull();
  });

  it('shows verdicts as words with counts', () => {
    setSignals(
      map(
        signal({ verdict: 'rave' }),
        signal({ verdict: 'rave' }),
        signal({ verdict: 'mixed' })
      )
    );
    const chips = Array.from(el.querySelectorAll('.critic__verdict')).map((c) =>
      c.textContent?.replace(/\s+/g, ' ').trim()
    );
    expect(chips).toEqual(['2 raves', '1 mixed']);
  });

  it('shows the average only with two or more scores', () => {
    setSignals(map(signal({ score: 92, verdict: 'positive' })));
    expect(el.querySelector('.critic__score')).toBeNull(); // 1 score → no average
    expect(el.querySelector('.critic__verdict')?.textContent).toContain('positive');

    setSignals(map(signal({ score: 92 }), signal({ score: 88 })));
    expect(el.querySelector('.critic__score-num')?.textContent?.trim()).toBe('90');
    expect(el.querySelector('.critic__score-count')?.textContent).toContain('2');
  });
});
